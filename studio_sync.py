#!/usr/bin/env python3
"""Self-hosted sync API for Lance (single user).

The browser/mobile clients keep the same auth/session shape the Supabase client
used, so switching providers is a front-end-only change. Data lives next to the
existing media volume:

    $LANCE_DATA_DIR/sync/sync.sqlite3   metadata + snapshots + inbox
    $LANCE_DATA_DIR/sync/blobs/<sha>    content-addressed media
    $LANCE_DATA_DIR/sync/backups        snapshot backups (inside SQLite)

Endpoints (all prefixed with /api/sync):

    GET  health
    POST auth/login | auth/refresh | auth/logout
    GET  auth/session
    GET|POST|PUT workbench
    POST workbenches
    GET|POST workbench/backup
    GET|POST inbox          PATCH inbox/<id>
    GET|POST projects       DELETE projects?id=&workspace=&updated_at=
    POST media?workspace=&name=      (raw bytes)
    POST media/sign                  ({paths,expiresIn})
    GET  media/<sha>?e=&s=           (HMAC signed, no bearer)
    GET  state

Only the Python standard library is used: sqlite3 + hashlib + hmac + secrets.
"""
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import socket
import sqlite3
import threading
import time
import unicodedata
import urllib.parse
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler
from pathlib import Path

ACCESS_TTL = 30 * 24 * 3600
REFRESH_TTL = 180 * 24 * 3600
DEFAULT_SIGN_TTL = 7 * 24 * 3600
MAX_SIGN_TTL = 30 * 24 * 3600
MAX_MEDIA_BYTES = 256 * 1024 * 1024
MAX_JSON_BYTES = 32 * 1024 * 1024
WORKSPACES = ('xinxuan', 'personal')
BACKUP_KEEP = 20
_VERSION = 1

DATA = Path(os.environ.get('LANCE_DATA_DIR', Path(__file__).resolve().parent / '.lance-data'))
SYNC_DIR = DATA / 'sync'
DB_PATH = SYNC_DIR / 'sync.sqlite3'
BLOB_DIR = SYNC_DIR / 'blobs'

_ready = False
_ready_lock = threading.Lock()
_login_failures = {}
_login_lock = threading.Lock()


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def configure(data_dir):
    """Point the module at another data directory (tests / migration)."""
    global DATA, SYNC_DIR, DB_PATH, BLOB_DIR, _ready
    DATA = Path(data_dir)
    SYNC_DIR = DATA / 'sync'
    DB_PATH = SYNC_DIR / 'sync.sqlite3'
    BLOB_DIR = SYNC_DIR / 'blobs'
    _ready = False


def _ensure():
    global _ready
    if _ready:
        return
    with _ready_lock:
        if _ready:
            return
        SYNC_DIR.mkdir(parents=True, exist_ok=True)
        BLOB_DIR.mkdir(parents=True, exist_ok=True)
        (SYNC_DIR / 'tmp').mkdir(parents=True, exist_ok=True)
        with _db() as conn:
            conn.executescript("""
            create table if not exists settings(key text primary key, value text not null);
            create table if not exists users(
              id text primary key, email text unique not null, password_hash text not null,
              created_at text not null, updated_at text not null);
            create table if not exists tokens(
              kind text not null, token_hash text primary key, user_id text not null,
              device_id text, expires_at integer not null, created_at text not null);
            create table if not exists snapshots(
              user_id text not null, workspace text not null, payload text not null,
              revision integer not null, device_id text not null default '', updated_at text not null,
              primary key(user_id, workspace));
            create table if not exists backups(
              id text primary key, user_id text not null, workspace text not null,
              revision integer not null, device_id text not null default '',
              payload text not null, created_at text not null);
            create table if not exists media(
              id integer primary key autoincrement, user_id text not null,
              logical_path text not null, sha256 text not null, size integer not null,
              mime text not null default '', created_at text not null, last_ref_at text not null,
              unique(user_id, logical_path));
            create index if not exists media_sha on media(sha256);
            create table if not exists inbox(
              id text primary key, user_id text not null, workspace text not null,
              kind text not null, title text not null default '', body text not null default '',
              source_url text, file_path text, file_name text, mime_type text,
              status text not null default 'inbox', metadata text not null default '{}',
              created_at text not null, updated_at text not null, imported_at text);
            create table if not exists projects(
              id text primary key, user_id text not null, workspace text not null,
              source_id text not null, kind text not null, title text not null,
              summary text not null default '', status text not null default '',
              target_date text not null default '', payload text not null default '{}',
              updated_at text not null, unique(user_id, workspace, source_id));
            """)
            if not conn.execute("select 1 from settings where key='signing_secret'").fetchone():
                conn.execute("insert into settings(key,value) values('signing_secret',?)", (secrets.token_hex(32),))
            if not conn.execute("select 1 from settings where key='capture_key'").fetchone():
                conn.execute("insert into settings(key,value) values('capture_key',?)", (secrets.token_urlsafe(24),))
        _ready = True


@contextmanager
def _db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA busy_timeout=5000')
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def _secret():
    _ensure()
    with _db() as conn:
        return conn.execute("select value from settings where key='signing_secret'").fetchone()[0]


# ---------- auth ----------

def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32).hex()
    return 'scrypt$' + salt + '$' + digest


def verify_password(password, stored):
    try:
        _, salt, digest = str(stored).split('$')
        calc = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32).hex()
        return hmac.compare_digest(calc, digest)
    except Exception:
        return False


def create_user(email, password):
    _ensure()
    email = str(email or '').strip().lower()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise ValueError('邮箱格式不正确')
    if len(str(password or '')) < 8:
        raise ValueError('密码至少 8 位')
    with _db() as conn:
        existing = conn.execute('select id from users where email=?', (email,)).fetchone()
        if existing:
            raise ValueError('该邮箱已存在')
        user_id = str(uuid.uuid4())
        now = _now()
        conn.execute('insert into users(id,email,password_hash,created_at,updated_at) values(?,?,?,?,?)',
                     (user_id, email, hash_password(password), now, now))
    return {'id': user_id, 'email': email}


def set_password(email, password):
    _ensure()
    if len(str(password or '')) < 8:
        raise ValueError('密码至少 8 位')
    with _db() as conn:
        row = conn.execute('select id from users where email=?', (str(email).strip().lower(),)).fetchone()
        if not row:
            raise ValueError('用户不存在')
        conn.execute('update users set password_hash=?,updated_at=? where id=?',
                     (hash_password(password), _now(), row['id']))
        conn.execute('delete from tokens where user_id=?', (row['id'],))
    return {'id': row['id'], 'email': str(email).strip().lower()}


def _issue_tokens(user, device_id=''):
    access = secrets.token_urlsafe(32)
    refresh = secrets.token_urlsafe(32)
    now = int(time.time())
    email = user['email'] if isinstance(user, dict) or hasattr(user, 'keys') else ''
    user_id = user['id'] if isinstance(user, dict) or hasattr(user, 'keys') else user
    with _db() as conn:
        row = conn.execute('select email from users where id=?', (user_id,)).fetchone()
        email = row['email'] if row else email
        conn.execute('delete from tokens where expires_at<?', (now,))
        conn.execute('insert into tokens(kind,token_hash,user_id,device_id,expires_at,created_at) values(?,?,?,?,?,?)',
                     ('access', hashlib.sha256(access.encode()).hexdigest(), user_id, device_id, now + ACCESS_TTL, _now()))
        conn.execute('insert into tokens(kind,token_hash,user_id,device_id,expires_at,created_at) values(?,?,?,?,?,?)',
                     ('refresh', hashlib.sha256(refresh.encode()).hexdigest(), user_id, device_id, now + REFRESH_TTL, _now()))
    return {'access_token': access, 'refresh_token': refresh, 'expires_at': now + ACCESS_TTL,
            'user': {'id': user_id, 'email': email}}


def _client_ip(handler):
    forwarded = (handler.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
    if forwarded and re.fullmatch(r'[0-9a-fA-F:.]+', forwarded):
        return forwarded
    return handler.client_address[0] if getattr(handler, 'client_address', None) else 'local'


def _login_guard(handler):
    ip = _client_ip(handler)
    now = time.time()
    with _login_lock:
        hits = [t for t in _login_failures.get(ip, []) if now - t < 600]
        if len(hits) >= 5:
            raise ApiError(429, '登录尝试太频繁，请 1 分钟后再试')
        _login_failures[ip] = hits


def _login_failed(handler):
    ip = _client_ip(handler)
    with _login_lock:
        _login_failures.setdefault(ip, []).append(time.time())


def _bearer(handler):
    match = re.fullmatch(r'Bearer\s+([A-Za-z0-9_\-.~+/=]{16,})', handler.headers.get('Authorization', '') or '')
    return match.group(1) if match else ''


def _user(handler):
    token = _bearer(handler)
    if not token:
        raise ApiError(401, '请先登录同步账号')
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with _db() as conn:
        row = conn.execute("select user_id,device_id,expires_at from tokens where kind='access' and token_hash=?",
                           (token_hash,)).fetchone()
        if not row or int(row['expires_at']) < int(time.time()):
            raise ApiError(401, '同步登录已过期，请重新登录')
        user = conn.execute('select id,email from users where id=?', (row['user_id'],)).fetchone()
        if not user:
            raise ApiError(401, '同步账号不存在')
        device = _device(handler)
        if device:
            conn.execute('update tokens set device_id=? where token_hash=?', (device, token_hash))
        return {'id': user['id'], 'email': user['email'], 'device_id': device or row['device_id'] or ''}


def _device(handler):
    return re.sub(r'[^A-Za-z0-9_.:-]', '', str(handler.headers.get('X-Device-Id', '') or ''))[:80]


# ---------- helpers ----------

def _json(handler, value, status=200):
    if hasattr(handler, 'send_json'):
        return handler.send_json(value, status)
    data = json.dumps(value, ensure_ascii=False).encode()
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(data)))
    handler.send_header('Cache-Control', 'no-store')
    handler.end_headers()
    handler.wfile.write(data)


def _body(handler, limit=MAX_JSON_BYTES):
    try:
        length = int(handler.headers.get('Content-Length') or 0)
    except ValueError:
        raise ApiError(400, '请求长度无效')
    if length <= 0:
        return {}
    if length > limit:
        raise ApiError(413, '请求体过大')
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        raise ApiError(400, '请求格式不是 JSON')


def _query(handler):
    return urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query)


def _path(handler):
    return urllib.parse.unquote(urllib.parse.urlparse(handler.path).path)


def _safe_name(name):
    value = unicodedata.normalize('NFKC', str(name or 'file'))
    value = re.sub(r'[^A-Za-z0-9._-]+', '-', value)
    value = value.strip('.-')[-90:] or 'file'
    return value


def _workspace(value):
    if value not in WORKSPACES:
        raise ApiError(400, '未知的空间')
    return value


def _row_snapshot(row):
    return {'user_id': row['user_id'], 'workspace': row['workspace'],
            'payload': json.loads(row['payload']), 'revision': int(row['revision']),
            'device_id': row['device_id'], 'updated_at': row['updated_at']}


def _row_inbox(row):
    data = dict(row)
    try:
        data['metadata'] = json.loads(data.get('metadata') or '{}')
    except Exception:
        data['metadata'] = {}
    return data


def _row_project(row):
    data = dict(row)
    try:
        data['payload'] = json.loads(data.get('payload') or '{}')
    except Exception:
        data['payload'] = {}
    return data


def _media_row(handler, sha, query):
    try:
        expires = int(query.get('e', ['0'])[0])
        signature = query.get('s', [''])[0]
    except ValueError:
        raise ApiError(403, '素材地址无效')
    if expires < int(time.time()):
        raise ApiError(403, '素材地址已过期，请重新同步')
    expected = hmac.new(_secret().encode(), f'{sha}:{expires}'.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise ApiError(403, '素材地址签名无效')
    path = BLOB_DIR / sha[:2] / sha
    if not path.is_file():
        raise ApiError(404, '素材不存在')
    size = path.stat().st_size
    with _db() as conn:
        row = conn.execute('select mime from media where sha256=? limit 1', (sha,)).fetchone()
    mime = (row['mime'] if row else '') or 'application/octet-stream'
    handler.send_response(200)
    handler.send_header('Content-Type', mime)
    handler.send_header('Content-Length', str(size))
    handler.send_header('ETag', '"' + sha + '"')
    handler.send_header('Cache-Control', 'private, max-age=604800')
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.end_headers()
    with path.open('rb') as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            handler.wfile.write(chunk)


def _sign_paths(handler, user):
    body = _body(handler)
    paths = body.get('paths') or []
    if not isinstance(paths, list):
        raise ApiError(400, 'paths 必须是数组')
    try:
        expires = int(body.get('expiresIn') or DEFAULT_SIGN_TTL)
    except (TypeError, ValueError):
        expires = DEFAULT_SIGN_TTL
    expires = max(60, min(MAX_SIGN_TTL, expires))
    deadline = int(time.time()) + expires
    out = []
    with _db() as conn:
        for path in paths[:500]:
            if not isinstance(path, str):
                continue
            row = conn.execute('select sha256 from media where user_id=? and logical_path=?',
                               (user['id'], path)).fetchone()
            if not row:
                out.append({'path': path, 'signedURL': None, 'error': '素材不在云端'})
                continue
            signature = hmac.new(_secret().encode(), f"{row['sha256']}:{deadline}".encode(), hashlib.sha256).hexdigest()
            out.append({'path': path, 'signedURL': f"/api/sync/media/{row['sha256']}?e={deadline}&s={signature}", 'error': None})
    return out


# ---------- route handlers ----------

def _login(handler):
    _login_guard(handler)
    body = _body(handler)
    email = str(body.get('email') or '').strip().lower()
    password = str(body.get('password') or '')
    with _db() as conn:
        user = conn.execute('select id,email,password_hash from users where email=?', (email,)).fetchone()
    if not user or not verify_password(password, user['password_hash']):
        _login_failed(handler)
        raise ApiError(401, '邮箱或密码不正确')
    return _issue_tokens({'id': user['id'], 'email': user['email']}, _device(handler))


def _refresh(handler):
    body = _body(handler)
    token = str(body.get('refresh_token') or '')
    if not token:
        raise ApiError(400, '缺少 refresh_token')
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with _db() as conn:
        row = conn.execute("select user_id,device_id,expires_at from tokens where kind='refresh' and token_hash=?",
                           (token_hash,)).fetchone()
        if not row or int(row['expires_at']) < int(time.time()):
            raise ApiError(401, '刷新令牌已过期，请重新登录')
        user = conn.execute('select id,email from users where id=?', (row['user_id'],)).fetchone()
        conn.execute('delete from tokens where token_hash=?', (token_hash,))
    return _issue_tokens({'id': user['id'], 'email': user['email']}, row['device_id'] or _device(handler))


def _logout(handler):
    token = _bearer(handler)
    if token:
        with _db() as conn:
            conn.execute("delete from tokens where token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))
    return {'ok': True}


def _get_workbench(handler, user):
    workspace = _workspace(_query(handler).get('workspace', [''])[0])
    with _db() as conn:
        row = conn.execute('select * from snapshots where user_id=? and workspace=?', (user['id'], workspace)).fetchone()
    return _row_snapshot(row) if row else None


def _get_workbench_meta(handler, user):
    workspace = _workspace(_query(handler).get('workspace', [''])[0])
    with _db() as conn:
        row = conn.execute('select workspace,revision,updated_at from snapshots where user_id=? and workspace=?',
                           (user['id'], workspace)).fetchone()
    return dict(row) if row else None


def _put_workbench(handler, user):
    body = _body(handler)
    workspace = _workspace(body.get('workspace'))
    payload = body.get('payload')
    if not isinstance(payload, dict):
        raise ApiError(400, 'payload 必须是对象')
    try:
        revision = int(body.get('revision') or 0) or int(time.time() * 1000)
    except (TypeError, ValueError):
        revision = int(time.time() * 1000)
    device_id = str(body.get('device_id') or user.get('device_id') or '')[:80]
    now = _now()
    with _db() as conn:
        previous = conn.execute('select payload from snapshots where user_id=? and workspace=?',
                                (user['id'], workspace)).fetchone()
        if previous and previous['payload'] != json.dumps(payload, ensure_ascii=False):
            conn.execute('insert into backups(id,user_id,workspace,revision,device_id,payload,created_at) values(?,?,?,?,?,?,?)',
                         (str(uuid.uuid4()), user['id'], workspace, revision, device_id,
                          previous['payload'], now))
            conn.execute("""delete from backups where user_id=? and workspace=? and id not in
                            (select id from backups where user_id=? and workspace=? order by created_at desc limit ?)""",
                         (user['id'], workspace, user['id'], workspace, BACKUP_KEEP))
        conn.execute("""insert into snapshots(user_id,workspace,payload,revision,device_id,updated_at)
                        values(?,?,?,?,?,?)
                        on conflict(user_id,workspace) do update set
                          payload=excluded.payload,revision=excluded.revision,
                          device_id=excluded.device_id,updated_at=excluded.updated_at""",
                     (user['id'], workspace, json.dumps(payload, ensure_ascii=False), revision, device_id, now))
        row = conn.execute('select * from snapshots where user_id=? and workspace=?', (user['id'], workspace)).fetchone()
    return _row_snapshot(row)


def _put_workbenches(handler, user):
    body = _body(handler)
    items = body if isinstance(body, list) else body.get('items')
    if not isinstance(items, list) or len(items) != 2:
        raise ApiError(400, '需要同时提交两个空间')
    spaces = {item.get('workspace') for item in items if isinstance(item, dict)}
    if spaces != set(WORKSPACES):
        raise ApiError(400, '空间范围不完整')
    rows = [_put_workbench_rows(user, item) for item in items]
    return rows


def _put_workbench_rows(user, item):
    workspace = _workspace(item.get('workspace'))
    payload = item.get('payload')
    if not isinstance(payload, dict):
        raise ApiError(400, 'payload 必须是对象')
    try:
        revision = int(item.get('revision') or 0) or int(time.time() * 1000)
    except (TypeError, ValueError):
        revision = int(time.time() * 1000)
    device_id = str(item.get('device_id') or user.get('device_id') or '')[:80]
    now = _now()
    with _db() as conn:
        conn.execute("""insert into snapshots(user_id,workspace,payload,revision,device_id,updated_at)
                        values(?,?,?,?,?,?)
                        on conflict(user_id,workspace) do update set
                          payload=excluded.payload,revision=excluded.revision,
                          device_id=excluded.device_id,updated_at=excluded.updated_at""",
                     (user['id'], workspace, json.dumps(payload, ensure_ascii=False), revision, device_id, now))
        row = conn.execute('select * from snapshots where user_id=? and workspace=?', (user['id'], workspace)).fetchone()
    return _row_snapshot(row)


def _backup_workbench(handler, user):
    body = _body(handler)
    workspace = _workspace(body.get('workspace'))
    payload = body.get('payload')
    if not isinstance(payload, dict):
        raise ApiError(400, 'payload 必须是对象')
    try:
        revision = int(body.get('revision') or 0)
    except (TypeError, ValueError):
        revision = 0
    device_id = str(body.get('device_id') or '')[:80]
    backup_id = str(uuid.uuid4())
    created = _now()
    with _db() as conn:
        conn.execute('insert into backups(id,user_id,workspace,revision,device_id,payload,created_at) values(?,?,?,?,?,?,?)',
                     (backup_id, user['id'], workspace, revision, device_id,
                      json.dumps(payload, ensure_ascii=False), created))
        conn.execute("""delete from backups where user_id=? and workspace=? and id not in
                        (select id from backups where user_id=? and workspace=? order by created_at desc limit ?)""",
                     (user['id'], workspace, user['id'], workspace, BACKUP_KEEP))
    return {'path': 'backups/' + backup_id, 'created_at': created, 'revision': revision, 'workspace': workspace}


def _list_backups(handler, user):
    workspace = _workspace(_query(handler).get('workspace', [''])[0])
    try:
        limit = max(1, min(100, int(_query(handler).get('limit', ['20'])[0])))
    except ValueError:
        limit = 20
    with _db() as conn:
        rows = conn.execute('select id,workspace,revision,device_id,created_at from backups where user_id=? and workspace=? order by created_at desc limit ?',
                            (user['id'], workspace, limit)).fetchall()
    return [{'path': 'backups/' + row['id'], 'workspace': row['workspace'], 'revision': int(row['revision']),
             'device_id': row['device_id'], 'created_at': row['created_at']} for row in rows]


def _upload_media(handler, user):
    query = _query(handler)
    workspace = _workspace(query.get('workspace', [''])[0])
    name = _safe_name(query.get('name', ['file'])[0])
    try:
        length = int(handler.headers.get('Content-Length') or 0)
    except ValueError:
        raise ApiError(400, '上传长度无效')
    if not 0 < length <= MAX_MEDIA_BYTES:
        raise ApiError(413, '单文件为空或超过 256 MiB')
    tmp = SYNC_DIR / 'tmp' / (uuid.uuid4().hex + '.part')
    digest = hashlib.sha256()
    size = 0
    try:
        with tmp.open('wb') as out:
            remaining = length
            while remaining > 0:
                chunk = handler.rfile.read(min(65536, remaining))
                if not chunk:
                    raise ApiError(400, '上传连接中断')
                out.write(chunk)
                digest.update(chunk)
                size += len(chunk)
                remaining -= len(chunk)
        sha = digest.hexdigest()
        blob = BLOB_DIR / sha[:2] / sha
        blob.parent.mkdir(parents=True, exist_ok=True)
        deduped = blob.exists()
        if deduped:
            tmp.unlink()
        else:
            os.replace(tmp, blob)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    logical = f"{user['id']}/{workspace}/{name}"
    mime = (handler.headers.get('Content-Type') or 'application/octet-stream').split(';')[0][:120]
    now = _now()
    with _db() as conn:
        conn.execute("""insert into media(user_id,logical_path,sha256,size,mime,created_at,last_ref_at)
                        values(?,?,?,?,?,?,?)
                        on conflict(user_id,logical_path) do update set
                          sha256=excluded.sha256,size=excluded.size,mime=excluded.mime,last_ref_at=excluded.last_ref_at""",
                     (user['id'], logical, sha, size, mime, now, now))
    return {'path': logical, 'sha256': sha, 'size': size, 'mime': mime, 'deduped': deduped}


def _delete_media(handler, user):
    path = _query(handler).get('path', [''])[0]
    if not path:
        raise ApiError(400, '缺少素材路径')
    with _db() as conn:
        row = conn.execute('select sha256 from media where user_id=? and logical_path=?',
                           (user['id'], path)).fetchone()
        if not row:
            return {'deleted': False}
        conn.execute('delete from media where user_id=? and logical_path=?', (user['id'], path))
        left = conn.execute('select count(*) from media where sha256=?', (row['sha256'],)).fetchone()[0]
    if not left:
        blob = BLOB_DIR / row['sha256'][:2] / row['sha256']
        try:
            blob.unlink()
        except FileNotFoundError:
            pass
    return {'deleted': True}


_FETCH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def _public_url(url):
    try:
        parsed = urllib.parse.urlparse(str(url or '').strip())
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            return False
        for info in socket.getaddrinfo(parsed.hostname, 443, proto=socket.IPPROTO_TCP):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
                return False
        return True
    except Exception:
        return False


def _fetch_bytes(url, limit, timeout=7):
    if not _public_url(url):
        return None, ''
    request = urllib.request.Request(url, headers={'User-Agent': _FETCH_UA, 'Accept': '*/*'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = (response.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        data = response.read(limit + 1)
    if len(data) > limit:
        return None, content_type
    return data, content_type


def _link_meta(url):
    try:
        data, content_type = _fetch_bytes(url, 700 * 1024)
        if not data or 'html' not in content_type:
            return {}
        text = data.decode('utf-8', 'ignore')
        def pick(pattern):
            match = re.search(pattern, text, re.I | re.S)
            return match.group(1).strip() if match else ''
        title = pick(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)')
        title = title or pick(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title')
        title = title or pick(r'<title[^>]*>(.*?)</title>')
        image = pick(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)')
        image = image or pick(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image')
        image = image or pick(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)')
        description = pick(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)')
        if image.startswith('//'):
            image = 'https:' + image
        elif image.startswith('/'):
            parsed = urllib.parse.urlparse(url)
            image = f'{parsed.scheme}://{parsed.netloc}' + image
        return {'title': title, 'image': image, 'description': description}
    except Exception:
        return {}


def _store_media_bytes(user, workspace, name, data, mime):
    sha = hashlib.sha256(data).hexdigest()
    blob = BLOB_DIR / sha[:2] / sha
    blob.parent.mkdir(parents=True, exist_ok=True)
    if not blob.exists():
        tmp = blob.with_suffix('.part')
        tmp.write_bytes(data)
        os.replace(tmp, blob)
    logical = f"{user['id']}/{workspace}/{_safe_name(name)}"
    now = _now()
    with _db() as conn:
        conn.execute("""insert into media(user_id,logical_path,sha256,size,mime,created_at,last_ref_at)
                        values(?,?,?,?,?,?,?)
                        on conflict(user_id,logical_path) do update set
                          sha256=excluded.sha256,size=excluded.size,mime=excluded.mime,last_ref_at=excluded.last_ref_at""",
                     (user['id'], logical, sha, len(data), mime or 'application/octet-stream', now, now))
    return {'path': logical, 'sha256': sha, 'size': len(data), 'name': _safe_name(name)}


def _html(handler, body, status=200):
    payload = body.encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'text/html; charset=utf-8')
    handler.send_header('Content-Length', str(len(payload)))
    handler.send_header('Cache-Control', 'no-store')
    handler.end_headers()
    try:
        handler.wfile.write(payload)
    except (BrokenPipeError, ConnectionResetError):
        pass
    return None


def _redirect(handler, location):
    handler.send_response(302)
    handler.send_header('Location', location)
    handler.send_header('Cache-Control', 'no-store')
    handler.end_headers()
    return None


def _pinterest_key_ok(handler):
    key = _query(handler).get('key', [''])[0]
    expected = _capture_key()
    return bool(expected and key and hmac.compare_digest(key, expected))


def _pinterest_start(handler):
    import studio_pinterest as pinterest
    if not _pinterest_key_ok(handler):
        raise ApiError(401, '收藏口令无效')
    if not pinterest.configured():
        raise ApiError(503, '请先在服务器 .env 配置 PINTEREST_CLIENT_ID 和 PINTEREST_CLIENT_SECRET')
    return _redirect(handler, pinterest.auth_url(pinterest.make_state()))


def _pinterest_callback(handler):
    import studio_pinterest as pinterest
    query = _query(handler)
    if query.get('error'):
        return _html(handler, '<h2>Pinterest 授权未完成</h2><p>可以关闭此页，重新发起授权。</p>')
    code = query.get('code', [''])[0]
    state = query.get('state', [''])[0]
    if not pinterest.verify_state(state):
        return _html(handler, '<h2>授权状态已失效</h2><p>请回到 Lance 重新打开授权链接。</p>', 400)
    if not code:
        return _html(handler, '<h2>缺少授权码</h2>', 400)
    try:
        tokens = pinterest.exchange_code(code)
        account = tokens.get('account') or {}
        username = account.get('username') or 'Pinterest 账号'
        return _html(handler, f'<h2>Pinterest 授权成功</h2><p>已连接：<strong>{username}</strong></p><p>可以关闭此页，回到 Lance 等待同步。</p>')
    except Exception as error:
        return _html(handler, f'<h2>授权失败</h2><p>{str(error)[:300]}</p>', 500)


def _pinterest_status(handler):
    import studio_pinterest as pinterest
    if not _pinterest_key_ok(handler):
        raise ApiError(401, '收藏口令无效')
    return _json(handler, pinterest.status())


def _capture_key():
    with _db() as conn:
        row = conn.execute("select value from settings where key='capture_key'").fetchone()
    return row[0] if row else ''


def _capture_user():
    with _db() as conn:
        return conn.execute('select id,email from users order by created_at limit 1').fetchone()


def _create_capture(handler):
    """Mobile share-sheet entry: personal key + optional raw image/video.

    POST /api/sync/capture?key=...&workspace=&title=&name=
      JSON body {url,title,body}  -> link/text item
      raw image/video/audio body  -> media item
    """
    query = _query(handler)
    key = query.get('key', [''])[0]
    expected = _capture_key()
    if not expected or not key or not hmac.compare_digest(key, expected):
        raise ApiError(401, '收藏口令无效')
    user = _capture_user()
    if not user:
        raise ApiError(503, '尚未创建同步账号')
    workspace_value = query.get('workspace', [''])[0]
    workspace = _workspace(workspace_value) if workspace_value else 'xinxuan'
    ctype = (handler.headers.get('Content-Type') or '').split(';')[0].strip().lower()
    now = _now()
    item_id = str(uuid.uuid4())
    metadata_text = json.dumps({'capture': 'simple', 'source': 'share'}, ensure_ascii=False)
    if ctype.startswith(('image/', 'video/', 'audio/')):
        uploaded = _upload_media(handler, user)
        kind = 'image' if ctype.startswith('image/') else 'video' if ctype.startswith('video/') else 'voice'
        title = (query.get('title', [''])[0] or '').strip()[:200] or uploaded.get('name') or '分享的素材'
        with _db() as conn:
            conn.execute("""insert into inbox(id,user_id,workspace,kind,title,body,source_url,file_path,file_name,mime_type,status,metadata,created_at,updated_at,imported_at)
                            values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                         (item_id, user['id'], workspace, kind, title, '', None, uploaded['path'],
                          query.get('name', [''])[0] or title, ctype, 'inbox', metadata_text, now, now, None))
        return {'ok': True, 'id': item_id, 'path': uploaded['path'], 'kind': kind}
    body = _body(handler)
    if body.get('workspace'):
        workspace = _workspace(body.get('workspace'))
    url = str(body.get('url') or body.get('source_url') or '').strip()[:2000]
    title = str(body.get('title') or '').strip()[:200]
    text = str(body.get('body') or '').strip()[:4000]
    if not url:
        match = re.search(r'https?://\S+', text)
        if match:
            url = match.group(0)
    elif not re.match(r'^https?://', url):
        match = re.search(r'https?://\S+', url) or re.search(r'https?://\S+', text)
        if match:
            url = match.group(0)
    cover_url = str(body.get('cover_url') or '').strip()[:2000]
    meta = {}
    if url and (not title or not cover_url):
        meta = _link_meta(url)
    if url:
        if not title:
            title = (meta.get('title') or '')[:200]
        if not title:
            try:
                title = urllib.parse.urlparse(url).netloc.replace('www.', '') or '收藏'
            except Exception:
                title = '收藏'
        if not cover_url:
            cover_url = meta.get('image') or ''
    file_path = file_name = mime_type = None
    if cover_url:
        try:
            image, image_type = _fetch_bytes(cover_url, 8 * 1024 * 1024)
            if image and image_type.startswith('image/'):
                stored = _store_media_bytes(user, workspace, 'cover-' + uuid.uuid4().hex[:12] + ('.png' if 'png' in image_type else '.jpg'), image, image_type)
                file_path = stored['path']
                file_name = '封面.' + ('png' if 'png' in image_type else 'jpg')
                mime_type = image_type
        except Exception:
            pass
    kind = 'link' if url else 'text'
    if meta.get('description') and not text:
        text = meta['description'][:4000]
    with _db() as conn:
        conn.execute("""insert into inbox(id,user_id,workspace,kind,title,body,source_url,file_path,file_name,mime_type,status,metadata,created_at,updated_at,imported_at)
                        values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (item_id, user['id'], workspace, kind, title or '收藏', text, url or None,
                      file_path, file_name, mime_type, 'inbox', metadata_text, now, now, None))
    return {'ok': True, 'id': item_id, 'kind': kind}


def _create_inbox(handler, user):
    body = _body(handler)
    workspace = _workspace(body.get('workspace'))
    item_id = str(body.get('id') or uuid.uuid4())
    now = _now()
    metadata = body.get('metadata')
    metadata_text = json.dumps(metadata, ensure_ascii=False) if isinstance(metadata, (dict, list)) else str(metadata or '{}')
    with _db() as conn:
        conn.execute("""insert into inbox(id,user_id,workspace,kind,title,body,source_url,file_path,file_name,mime_type,status,metadata,created_at,updated_at,imported_at)
                        values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (item_id, user['id'], workspace, str(body.get('kind') or 'text'),
                      str(body.get('title') or ''), str(body.get('body') or ''),
                      body.get('source_url'), body.get('file_path'), body.get('file_name'), body.get('mime_type'),
                      str(body.get('status') or 'inbox'), metadata_text,
                      str(body.get('created_at') or now), str(body.get('updated_at') or now), body.get('imported_at')))
        row = conn.execute('select * from inbox where id=?', (item_id,)).fetchone()
    return _row_inbox(row)


def _list_inbox(handler, user):
    try:
        limit = max(1, min(500, int(_query(handler).get('limit', ['200'])[0])))
    except ValueError:
        limit = 200
    with _db() as conn:
        rows = conn.execute('select * from inbox where user_id=? order by created_at desc limit ?', (user['id'], limit)).fetchall()
    return [_row_inbox(row) for row in rows]


def _patch_inbox(handler, user, item_id):
    body = _body(handler)
    allowed = {'title', 'body', 'source_url', 'file_path', 'file_name', 'mime_type', 'status', 'metadata', 'updated_at', 'imported_at'}
    updates = {key: body.get(key) for key in allowed if key in body}
    if 'metadata' in updates and isinstance(updates['metadata'], (dict, list)):
        updates['metadata'] = json.dumps(updates['metadata'], ensure_ascii=False)
    updates.setdefault('updated_at', _now())
    with _db() as conn:
        row = conn.execute('select id from inbox where id=? and user_id=?', (item_id, user['id'])).fetchone()
        if not row:
            raise ApiError(404, '记录不存在')
        assignments = ','.join(f'{key}=?' for key in updates)
        conn.execute(f'update inbox set {assignments} where id=? and user_id=?',
                     (*updates.values(), item_id, user['id']))
        row = conn.execute('select * from inbox where id=?', (item_id,)).fetchone()
    return _row_inbox(row)


def _list_projects(handler, user):
    try:
        limit = max(1, min(500, int(_query(handler).get('limit', ['300'])[0])))
    except ValueError:
        limit = 300
    with _db() as conn:
        rows = conn.execute('select * from projects where user_id=? order by updated_at desc limit ?', (user['id'], limit)).fetchall()
    return [_row_project(row) for row in rows]


def _publish_projects(handler, user):
    body = _body(handler)
    items = body if isinstance(body, list) else body.get('items')
    if not isinstance(items, list):
        raise ApiError(400, '需要项目数组')
    now = _now()
    out = []
    with _db() as conn:
        for item in items[:500]:
            if not isinstance(item, dict):
                continue
            workspace = _workspace(item.get('workspace'))
            source_id = str(item.get('source_id') or '')
            if not source_id:
                continue
            kind = str(item.get('kind') or 'topic')
            title = str(item.get('title') or '')
            summary = str(item.get('summary') or '')
            status = str(item.get('status') or '')
            target_date = str(item.get('target_date') or '')
            payload = item.get('payload')
            payload_text = json.dumps(payload, ensure_ascii=False) if isinstance(payload, (dict, list)) else str(payload or '{}')
            existing = conn.execute('select id from projects where user_id=? and workspace=? and source_id=?',
                                    (user['id'], workspace, source_id)).fetchone()
            if existing:
                conn.execute('update projects set kind=?,title=?,summary=?,status=?,target_date=?,payload=?,updated_at=? where id=?',
                             (kind, title, summary, status, target_date, payload_text, now, existing['id']))
                project_id = existing['id']
            else:
                project_id = str(item.get('id') or uuid.uuid4())
                conn.execute('insert into projects(id,user_id,workspace,source_id,kind,title,summary,status,target_date,payload,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)',
                             (project_id, user['id'], workspace, source_id, kind, title, summary, status, target_date, payload_text, now))
            row = conn.execute('select * from projects where id=?', (project_id,)).fetchone()
            out.append(_row_project(row))
    return out


def _delete_projects(handler, user):
    query = _query(handler)
    workspace = _workspace(query.get('workspace', [''])[0])
    item_id = query.get('id', [''])[0]
    updated_at = query.get('updated_at', [''])[0]
    if not item_id or not updated_at:
        raise ApiError(400, '缺少项目标识')
    with _db() as conn:
        cursor = conn.execute('delete from projects where id=? and user_id=? and workspace=? and updated_at=?',
                              (item_id, user['id'], workspace, updated_at))
        if cursor.rowcount != 1:
            raise ApiError(409, '手机项目已变化，已停止清理；备份已保留。')
    return {'deleted': 1}


def _state(handler, user):
    with _db() as conn:
        snapshots = {row['workspace']: int(row['revision']) for row in
                     conn.execute('select workspace,revision from snapshots where user_id=?', (user['id'],))}
        unread = conn.execute("select count(*) from inbox where user_id=? and status='inbox'", (user['id'],)).fetchone()[0]
        media_bytes = conn.execute('select coalesce(sum(size),0) from media where user_id=?', (user['id'],)).fetchone()[0]
        media_count = conn.execute('select count(*) from media where user_id=?', (user['id'],)).fetchone()[0]
        last_backup = conn.execute('select max(created_at) from backups where user_id=?', (user['id'],)).fetchone()[0]
    return {'version': _VERSION, 'revisions': snapshots, 'inboxUnread': int(unread),
            'mediaBytes': int(media_bytes), 'mediaCount': int(media_count), 'lastBackupAt': last_backup}


# ---------- router ----------

def handle(handler):
    """Dispatch one /api/sync/* request; called from studio_server.Handler."""
    try:
        _ensure()
        method = getattr(handler, 'command', 'GET').upper()
        path = _path(handler)
        if path == '/api/sync/health':
            return _json(handler, {'ok': True, 'version': _VERSION})
        if method == 'GET' and path.startswith('/api/sync/media/'):
            sha = re.sub(r'[^a-f0-9]', '', path[len('/api/sync/media/'):])[:64]
            if len(sha) != 64:
                raise ApiError(404, '素材地址无效')
            return _media_row(handler, sha, _query(handler))
        if method == 'OPTIONS':
            handler.send_response(204)
            handler.send_header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
            handler.send_header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Device-Id')
            handler.end_headers()
            return None
        if path == '/api/sync/auth/login' and method == 'POST':
            return _json(handler, _login(handler))
        if path == '/api/sync/auth/refresh' and method == 'POST':
            return _json(handler, _refresh(handler))
        if path == '/api/sync/auth/logout' and method == 'POST':
            return _json(handler, _logout(handler))
        if path == '/api/sync/capture' and method == 'POST':
            return _json(handler, _create_capture(handler))
        if path == '/api/sync/pinterest/start' and method == 'GET':
            return _pinterest_start(handler)
        if path == '/api/sync/pinterest/callback' and method == 'GET':
            return _pinterest_callback(handler)
        if path == '/api/sync/pinterest/status' and method == 'GET':
            return _pinterest_status(handler)
        user = _user(handler)
        if path == '/api/sync/auth/session' and method == 'GET':
            return _json(handler, {'user': {'id': user['id'], 'email': user['email']}})
        if path == '/api/sync/workbench':
            if method == 'GET':
                return _json(handler, _get_workbench(handler, user))
            if method in ('POST', 'PUT'):
                return _json(handler, _put_workbench(handler, user))
        if path == '/api/sync/workbench/meta' and method == 'GET':
            return _json(handler, _get_workbench_meta(handler, user))
        if path == '/api/sync/workbenches' and method == 'POST':
            return _json(handler, _put_workbenches(handler, user))
        if path == '/api/sync/workbench/backup':
            if method == 'POST':
                return _json(handler, _backup_workbench(handler, user))
            if method == 'GET':
                return _json(handler, _list_backups(handler, user))
        if path == '/api/sync/inbox':
            if method == 'GET':
                return _json(handler, _list_inbox(handler, user))
            if method == 'POST':
                return _json(handler, _create_inbox(handler, user))
        if path.startswith('/api/sync/inbox/') and method == 'PATCH':
            return _json(handler, _patch_inbox(handler, user, path[len('/api/sync/inbox/'):]))
        if path == '/api/sync/projects':
            if method == 'GET':
                return _json(handler, _list_projects(handler, user))
            if method == 'POST':
                return _json(handler, _publish_projects(handler, user))
        if path == '/api/sync/projects' and method == 'DELETE':
            return _json(handler, _delete_projects(handler, user))
        if path == '/api/sync/media' and method == 'POST':
            return _json(handler, _upload_media(handler, user))
        if path == '/api/sync/media' and method == 'DELETE':
            return _json(handler, _delete_media(handler, user))
        if path == '/api/sync/media/sign' and method == 'POST':
            return _json(handler, _sign_paths(handler, user))
        if path == '/api/sync/state' and method == 'GET':
            return _json(handler, _state(handler, user))
        raise ApiError(404, '未知同步接口')
    except ApiError as error:
        return _json(handler, {'error': error.message}, error.status)
    except (BrokenPipeError, ConnectionResetError):
        return None
    except Exception as error:  # never leak a traceback to the client
        return _json(handler, {'error': str(error)}, 400)


def _user_count():
    _ensure()
    with _db() as conn:
        return conn.execute('select count(*) from users').fetchone()[0]


class SyncHandler(BaseHTTPRequestHandler):
    """Only used by tests and by a standalone debug server."""
    def _run(self):
        return handle(self)

    def do_GET(self):
        self._run()

    def do_POST(self):
        self._run()

    def do_PUT(self):
        self._run()

    def do_PATCH(self):
        self._run()

    def do_DELETE(self):
        self._run()

    def do_OPTIONS(self):
        self._run()

    def send_json(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        return


def main(argv=None):
    import argparse
    parser = argparse.ArgumentParser(description='Lance self-hosted sync API')
    sub = parser.add_subparsers(dest='command', required=True)
    create = sub.add_parser('create-user')
    create.add_argument('email')
    create.add_argument('password')
    password = sub.add_parser('set-password')
    password.add_argument('email')
    password.add_argument('password')
    sub.add_parser('show-user')
    sub.add_parser('capture-key')
    sub.add_parser('rotate-capture-key')
    serve = sub.add_parser('serve')
    serve.add_argument('--host', default='127.0.0.1')
    serve.add_argument('--port', type=int, default=8139)
    args = parser.parse_args(argv)
    if args.command == 'create-user':
        print(json.dumps(create_user(args.email, args.password), ensure_ascii=False))
    elif args.command == 'set-password':
        print(json.dumps(set_password(args.email, args.password), ensure_ascii=False))
    elif args.command == 'show-user':
        _ensure()
        with _db() as conn:
            print(json.dumps([dict(row) for row in conn.execute('select id,email,created_at from users')], ensure_ascii=False))
    elif args.command == 'capture-key':
        _ensure()
        print(_capture_key())
    elif args.command == 'rotate-capture-key':
        _ensure()
        fresh = secrets.token_urlsafe(24)
        with _db() as conn:
            conn.execute("insert into settings(key,value) values('capture_key',?) on conflict(key) do update set value=excluded.value", (fresh,))
        print(fresh)
    elif args.command == 'serve':
        from http.server import ThreadingHTTPServer
        _ensure()
        server = ThreadingHTTPServer((args.host, args.port), SyncHandler)
        print(f'Lance sync API: http://{args.host}:{args.port}/api/sync/health')
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
