/* Self-hosted sync implementation for Lance (VPS /api/sync).
 * Loaded before studio-cloud.js; studio-cloud.js picks this provider when the
 * browser is in "vps" mode (localStorage lance_sync_mode or ?mode=vps).
 * The public API mirrors the Supabase implementation so callers stay unchanged.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object') module.exports = api;
  else root.StudioCloudVps = api;
})(globalThis, function(root) {
  'use strict';

  const SESSION_KEY = 'jinhua_cloud_session_v1';
  const BASE = '/api/sync';

  function configured() { return true; }
  function storage() { return root.localStorage; }
  function saveSession(value) {
    if (value) storage()?.setItem(SESSION_KEY, JSON.stringify(value));
    else storage()?.removeItem(SESSION_KEY);
    return value;
  }
  function readSession() {
    try { return JSON.parse(storage()?.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function deviceId() {
    let id = storage()?.getItem('jinhua_sync_device_v1');
    if (!id) {
      id = root.crypto?.randomUUID?.() || 'device-' + Date.now().toString(36);
      storage()?.setItem('jinhua_sync_device_v1', id);
    }
    return id;
  }
  function safeName(name) {
    return String(name || 'file').normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|-+$/g, '').slice(-90) || 'file';
  }
  function absolute(url) {
    if (!url) return '';
    return /^https?:\/\//.test(url) ? url : String(root.location?.origin || '') + url;
  }
  async function request(path, { method = 'GET', body, raw, token, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (raw !== undefined) init.body = raw;
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    if (token) init.headers.Authorization = 'Bearer ' + token;
    const response = await root.fetch(BASE + path, init);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw Error(data?.error || data?.msg || `同步请求失败（${response.status}）`);
    return data;
  }

  async function signIn(email, password) {
    return saveSession(await request('/auth/login', { method: 'POST', body: { email, password }, headers: { 'X-Device-Id': deviceId() } }));
  }
  async function signUp() {
    throw Error('自建同步是单用户，账号由服务器创建；请用邮箱密码登录');
  }
  function signOut() { saveSession(null); }
  async function session() {
    const current = readSession();
    if (!current?.access_token) return null;
    const expires = Number(current.expires_at || 0) * 1000;
    if (!expires || expires > Date.now() + 60000) return current;
    if (!current.refresh_token) { signOut(); return null; }
    try { return saveSession(await request('/auth/refresh', { method: 'POST', body: { refresh_token: current.refresh_token } })); }
    catch { signOut(); return null; }
  }
  async function auth() {
    const s = await session();
    if (!s?.access_token || !s?.user?.id) throw Error('请先登录同步账号');
    return s;
  }

  async function getWorkbench(workspace) {
    return request('/workbench?workspace=' + encodeURIComponent(workspace), { token: (await auth()).access_token });
  }
  async function getWorkbenchMeta(workspace) {
    return request('/workbench/meta?workspace=' + encodeURIComponent(workspace), { token: (await auth()).access_token });
  }
  async function putWorkbench(workspace, payload, revision, id) {
    const s = await auth();
    return request('/workbench', { method: 'POST', token: s.access_token, body: { workspace, payload, revision, device_id: String(id || deviceId()) } });
  }
  async function putWorkbenches(items) {
    return request('/workbenches', { method: 'POST', token: (await auth()).access_token, body: items });
  }
  async function backupWorkbench(workspace, payload, revision, id) {
    return request('/workbench/backup', { method: 'POST', token: (await auth()).access_token, body: { workspace, payload, revision, device_id: String(id || deviceId()) } });
  }
  async function uploadWorkbenchMedia(workspace, name, blob) {
    const s = await auth();
    const result = await request('/media?workspace=' + encodeURIComponent(workspace) + '&name=' + encodeURIComponent(safeName(name)), {
      method: 'POST', token: s.access_token, raw: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' }
    });
    return result.path;
  }
  async function signedWorkbenchMedia(path, expiresIn = 604800) {
    const s = await auth();
    const rows = await request('/media/sign', { method: 'POST', token: s.access_token, body: { paths: [path], expiresIn } });
    const row = rows?.[0];
    if (!row?.signedURL) throw Error(row?.error || '云端素材地址生成失败');
    return absolute(row.signedURL);
  }
  async function signedWorkbenchMediaBatch(paths, expiresIn = 604800) {
    const s = await auth();
    const rows = await request('/media/sign', { method: 'POST', token: s.access_token, body: { paths: [...new Set(paths || [])], expiresIn } });
    const out = new Map();
    for (const row of rows || []) if (row?.signedURL) out.set(row.path, absolute(row.signedURL));
    return out;
  }
  async function listWorkbenchMedia() { return []; }

  async function listInbox() {
    return request('/inbox?limit=200', { token: (await auth()).access_token }) || [];
  }
  async function countInbox() {
    const rows = await listInbox();
    return rows.filter(row => row.status === 'inbox').length;
  }
  async function createInbox(value) {
    const s = await auth();
    return request('/inbox', { method: 'POST', token: s.access_token, body: value });
  }
  async function patchInbox(id, value) {
    const s = await auth();
    return request('/inbox/' + encodeURIComponent(id), { method: 'PATCH', token: s.access_token, body: value });
  }
  async function listProjects() {
    return request('/projects?limit=300', { token: (await auth()).access_token }) || [];
  }
  async function publishProjects(items) {
    return request('/projects', { method: 'POST', token: (await auth()).access_token, body: items });
  }
  async function removeBackedUpProjects(items) {
    const s = await auth();
    for (const row of items || []) {
      await request('/projects?id=' + encodeURIComponent(row.id) + '&workspace=' + encodeURIComponent(row.workspace) + '&updated_at=' + encodeURIComponent(row.updated_at),
        { method: 'DELETE', token: s.access_token });
    }
    return true;
  }

  async function uploadFile(file) {
    const s = await auth();
    const result = await request('/media?workspace=xinxuan&name=' + encodeURIComponent(file.name || 'file'), {
      method: 'POST', token: s.access_token, raw: file, headers: { 'Content-Type': file.type || 'application/octet-stream' }
    });
    return result.path;
  }
  async function downloadFile(path) {
    const url = await signedWorkbenchMedia(path, 600);
    const response = await root.fetch(url);
    if (!response.ok) throw Error('随身文件下载失败');
    return response.blob();
  }
  async function deleteInboxFile(path) {
    if (!path) return false;
    await request('/media?path=' + encodeURIComponent(path), { method: 'DELETE', token: (await auth()).access_token });
    return true;
  }

  return {
    provider: 'vps', configured, readSession, saveSession, signIn, signUp, signOut, session,
    listInbox, countInbox, createInbox, patchInbox, listProjects, removeBackedUpProjects,
    publishProjects, getWorkbench, getWorkbenchMeta, putWorkbench, putWorkbenches,
    uploadWorkbenchMedia, backupWorkbench, signedWorkbenchMedia, signedWorkbenchMediaBatch,
    listWorkbenchMedia, uploadFile, downloadFile, deleteInboxFile, safeName
  };
});
