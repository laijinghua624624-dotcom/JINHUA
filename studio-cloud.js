/* Lightweight authenticated sync for the mobile companion and desktop inbox. */
(function(root,factory){const api=factory(root);if(typeof module==='object')module.exports=api;else root.StudioCloud=api;})(globalThis,function(root){
  'use strict';
  const SESSION_KEY='jinhua_cloud_session_v1';
  const BUCKET='mobile-inbox';
  function config(){
    const value=root.JINHUA_MOBILE_CONFIG||{};
    return {url:String(value.supabaseUrl||'').replace(/\/$/,''),key:String(value.publishableKey||'')};
  }
  function configured(){const c=config();return /^https:\/\/[^/]+\.supabase\.co$/i.test(c.url)&&c.key.length>20;}
  function storage(){return root.localStorage;}
  function saveSession(value){if(value)storage()?.setItem(SESSION_KEY,JSON.stringify(value));else storage()?.removeItem(SESSION_KEY);return value;}
  function readSession(){try{return JSON.parse(storage()?.getItem(SESSION_KEY)||'null');}catch{return null;}}
  async function request(path,{method='GET',body,token,headers={}}={}){
    if(!configured())throw Error('随身同步尚未配置');
    const c=config(),response=await root.fetch(c.url+path,{method,headers:{apikey:c.key,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined&&!(body instanceof Blob)?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:body instanceof Blob?body:JSON.stringify(body)});
    const raw=await response.text();let data=null;try{data=raw?JSON.parse(raw):null;}catch{data=raw;}
    if(!response.ok)throw Error(data?.msg||data?.message||data?.error_description||data?.error||`同步请求失败（${response.status}）`);
    return data;
  }
  async function signUp(email,password){const result=await request('/auth/v1/signup',{method:'POST',body:{email,password}});return result?.access_token?saveSession(result):result;}
  async function signIn(email,password){return saveSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));}
  function signOut(){saveSession(null);}
  async function session(){
    const current=readSession();if(!current?.access_token)return null;
    const expires=Number(current.expires_at||0)*1000;
    if(!expires||expires>Date.now()+60000)return current;
    if(!current.refresh_token){signOut();return null;}
    try{return saveSession(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:current.refresh_token}}));}catch{signOut();return null;}
  }
  async function auth(){const s=await session();if(!s?.access_token||!s?.user?.id)throw Error('请先登录随身同步');return s;}
  async function listInbox(){const s=await auth();return request('/rest/v1/mobile_inbox?select=*&order=created_at.desc&limit=200',{token:s.access_token})||[];}
  async function createInbox(value){const s=await auth();const row={...value,user_id:s.user.id,status:value.status||'inbox'};const data=await request('/rest/v1/mobile_inbox',{method:'POST',token:s.access_token,headers:{Prefer:'return=representation'},body:row});return data?.[0]||row;}
  async function patchInbox(id,value){const s=await auth();const data=await request('/rest/v1/mobile_inbox?id=eq.'+encodeURIComponent(id),{method:'PATCH',token:s.access_token,headers:{Prefer:'return=representation'},body:value});return data?.[0]||value;}
  function safeName(name){return String(name||'file').normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^[.-]+|-+$/g,'').slice(-90)||'file';}
  function encodePath(path){return String(path).split('/').map(encodeURIComponent).join('/');}
  async function uploadFile(file){
    const s=await auth(),id=root.crypto?.randomUUID?.()||Date.now().toString(36),path=`${s.user.id}/${id}-${safeName(file.name)}`;
    await request('/storage/v1/object/'+BUCKET+'/'+encodePath(path),{method:'POST',token:s.access_token,headers:{'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file});
    return path;
  }
  async function downloadFile(path){const s=await auth();const c=config(),response=await root.fetch(c.url+'/storage/v1/object/'+BUCKET+'/'+encodePath(path),{headers:{apikey:c.key,Authorization:'Bearer '+s.access_token}});if(!response.ok)throw Error('随身文件下载失败');return response.blob();}
  async function listProjects(){const s=await auth();return request('/rest/v1/mobile_projects?select=*&order=updated_at.desc&limit=300',{token:s.access_token})||[];}
  async function publishProjects(items){
    const s=await auth(),rows=items.map(item=>({...item,user_id:s.user.id,updated_at:new Date().toISOString()}));if(!rows.length)return [];
    return request('/rest/v1/mobile_projects?on_conflict=user_id,workspace,source_id',{method:'POST',token:s.access_token,headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:rows});
  }
  return {SESSION_KEY,BUCKET,config,configured,readSession,saveSession,signUp,signIn,signOut,session,listInbox,createInbox,patchInbox,uploadFile,downloadFile,listProjects,publishProjects,safeName};
});
