#!/usr/bin/env python3
"""Pinterest official API (v5) integration for Lance.

OAuth 2.0 authorization-code flow + board/pin sync into the reference library.

Environment (set in deployment/vps/.env):
    PINTEREST_CLIENT_ID
    PINTEREST_CLIENT_SECRET
    PINTEREST_REDIRECT_URI  (default https://lance.lance624.com/api/sync/pinterest/callback)

CLI:
    python3 studio_pinterest.py status
    python3 studio_pinterest.py auth-url
    python3 studio_pinterest.py boards
    python3 studio_pinterest.py sync [--workspace xinxuan]
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import studio_sync

CLIENT_ID = os.environ.get('PINTEREST_CLIENT_ID', '').strip()
CLIENT_SECRET = os.environ.get('PINTEREST_CLIENT_SECRET', '').strip()
REDIRECT_URI = os.environ.get('PINTEREST_REDIRECT_URI', 'https://lance.lance624.com/api/sync/pinterest/callback').strip()
SCOPES = 'boards:read,pins:read,user_accounts:read'
AUTH_URL = 'https://www.pinterest.com/oauth/'
TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token'
API = 'https://api.pinterest.com/v5'
TOKEN_SETTING = 'pinterest_oauth'
SEEN_NAME = 'pinterest-api-seen.json'
UA = 'LanceStudio/1.0'


def configured():
    return bool(CLIENT_ID and CLIENT_SECRET)


def _tokens():
    try:
        with studio_sync._db() as conn:
            row = conn.execute('select value from settings where key=?', (TOKEN_SETTING,)).fetchone()
        return json.loads(row[0]) if row else {}
    except Exception:
        return {}


def _save_tokens(data):
    with studio_sync._db() as conn:
        conn.execute('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value',
                     (TOKEN_SETTING, json.dumps(data, ensure_ascii=False)))


def connected():
    tokens = _tokens()
    return bool(tokens.get('access_token'))


def _sign(payload):
    return hmac.new(studio_sync._secret().encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def make_state(ttl=900):
    payload = f'{int(time.time())}.{os.urandom(8).hex()}'
    raw = payload + '.' + _sign(payload)
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip('=')


def verify_state(state):
    try:
        raw = base64.urlsafe_b64decode(state + '=' * (-len(state) % 4)).decode()
        payload, signature = raw.rsplit('.', 1)
        ts, nonce = payload.split('.', 1)
        if not hmac.compare_digest(signature, _sign(payload)):
            return False
        return 0 <= time.time() - int(ts) <= 900
    except Exception:
        return False


def auth_url(state):
    if not configured():
        raise RuntimeError('未配置 PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET')
    params = {
        'response_type': 'code',
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT_URI,
        'scope': SCOPES,
        'state': state,
    }
    return AUTH_URL + '?' + urllib.parse.urlencode(params, safe=':,/')


def _basic():
    return 'Basic ' + base64.b64encode(f'{CLIENT_ID}:{CLIENT_SECRET}'.encode()).decode()


def _token_request(form):
    request = urllib.request.Request(TOKEN_URL, data=urllib.parse.urlencode(form).encode(),
                                     headers={'Authorization': _basic(), 'Content-Type': 'application/x-www-form-urlencoded',
                                              'User-Agent': UA}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b'{}')
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', 'ignore')[:500]
        raise RuntimeError(f'Pinterest 令牌请求失败（{error.code}）：{detail}')


def exchange_code(code):
    data = _token_request({'grant_type': 'authorization_code', 'code': code, 'redirect_uri': REDIRECT_URI})
    access = data.get('access_token')
    if not access:
        raise RuntimeError('Pinterest 未返回 access_token')
    tokens = {
        'access_token': access,
        'refresh_token': data.get('refresh_token', ''),
        'expires_at': int(time.time()) + int(data.get('expires_in') or 0),
        'refresh_expires_at': int(time.time()) + int(data.get('refresh_token_expires_in') or 0),
        'scope': data.get('scope', ''),
        'connected_at': int(time.time()),
    }
    _save_tokens(tokens)
    try:
        account = api_get('/user_account')
        tokens['account'] = {'username': account.get('username'), 'account_type': account.get('account_type'),
                             'profile_image': account.get('profile_image')}
        _save_tokens(tokens)
    except Exception:
        pass
    return tokens


def refresh():
    tokens = _tokens()
    if not tokens.get('refresh_token'):
        raise RuntimeError('Pinterest 授权已过期，请重新授权')
    data = _token_request({'grant_type': 'refresh_token', 'refresh_token': tokens['refresh_token']})
    tokens.update({
        'access_token': data.get('access_token'),
        'expires_at': int(time.time()) + int(data.get('expires_in') or 0),
    })
    if data.get('refresh_token'):
        tokens['refresh_token'] = data['refresh_token']
        tokens['refresh_expires_at'] = int(time.time()) + int(data.get('refresh_token_expires_in') or 0)
    _save_tokens(tokens)
    return tokens['access_token']


def access_token():
    tokens = _tokens()
    if not tokens.get('access_token'):
        raise RuntimeError('Pinterest 尚未授权')
    if int(tokens.get('expires_at') or 0) <= int(time.time()) + 120:
        return refresh()
    return tokens['access_token']


def api_request(path, params=None, method='GET', data=None):
    token = access_token()
    url = API + path
    if params:
        url += '?' + urllib.parse.urlencode(params, safe=':,/')
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(url, data=body, method=method,
                                     headers={'Authorization': 'Bearer ' + token, 'User-Agent': UA,
                                              'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b'{}')
    except urllib.error.HTTPError as error:
        if error.code == 401:
            refresh()
            return api_request(path, params, method, data)
        detail = error.read().decode('utf-8', 'ignore')[:500]
        raise RuntimeError(f'Pinterest API 失败（{error.code}）：{detail}')


def api_get(path, params=None):
    return api_request(path, params)


def user_account():
    return api_get('/user_account')


def list_boards():
    boards, bookmark = [], None
    while True:
        params = {'page_size': 100}
        if bookmark:
            params['bookmark'] = bookmark
        data = api_get('/boards', params)
        boards.extend(data.get('items') or [])
        bookmark = data.get('bookmark')
        if not bookmark:
            return boards


def board_pins(board_id):
    pins, bookmark = [], None
    while True:
        params = {'page_size': 100}
        if bookmark:
            params['bookmark'] = bookmark
        data = api_get(f'/boards/{board_id}/pins', params)
        pins.extend(data.get('items') or [])
        bookmark = data.get('bookmark')
        if not bookmark:
            return pins


def best_image(pin):
    images = ((pin.get('media') or {}).get('images') or {})
    for key in ('1200x', '600x', '400x300', '150x150'):
        if images.get(key, {}).get('url'):
            return images[key]['url']
    for value in images.values():
        if isinstance(value, dict) and value.get('url'):
            return value['url']
    return ''


def _seen_path():
    return studio_sync.SYNC_DIR / SEEN_NAME


def _load_seen():
    seen = set()
    try:
        data = json.loads(_seen_path().read_text(encoding='utf-8'))
        seen.update(str(value) for value in data.get('pins', []))
    except Exception:
        pass
    # 公开主页同步（studio_ingest）已经导入过的 Pin 不重复导入
    try:
        ingest = json.loads((studio_sync.SYNC_DIR / 'ingest-seen.json').read_text(encoding='utf-8'))
        seen.update(str(value) for value in ingest.get('pinterest', []))
    except Exception:
        pass
    return seen


def _save_seen(seen):
    _seen_path().write_text(json.dumps({'pins': sorted(seen)[-5000:]}, ensure_ascii=False), encoding='utf-8')


def collect(verbose=True):
    boards = list_boards()
    if verbose:
        print(f'Pinterest 画板 {len(boards)} 个')
    items, seen_in_run = [], set()
    for board in boards:
        board_id = board.get('id')
        if not board_id:
            continue
        try:
            pins = board_pins(board_id)
        except Exception as error:
            if verbose:
                print(f'  画板失败 {board.get("name")}: {error}')
            continue
        if verbose:
            print(f'  {board.get("name") or board_id}: {len(pins)} Pin')
        for pin in pins:
            pin_id = str(pin.get('id') or '')
            if not pin_id or pin_id in seen_in_run:
                continue
            seen_in_run.add(pin_id)
            title = (pin.get('title') or pin.get('description') or '').strip()
            items.append({
                'id': pin_id,
                'board': board.get('name') or '',
                'url': pin.get('link') or f'https://www.pinterest.com/pin/{pin_id}/',
                'title': (title or 'Pinterest 收藏')[:200],
                'body': (pin.get('description') or '')[:4000],
                'cover': best_image(pin),
            })
    return items


def push_item(item, workspace):
    key = studio_sync._capture_key()
    if not key:
        raise RuntimeError('缺少收藏口令')
    payload = {
        'url': item['url'],
        'title': item['title'],
        'body': item['body'],
        'cover_url': item.get('cover') or '',
        'workspace': workspace,
    }
    request = urllib.request.Request('http://127.0.0.1:10000/api/sync/capture?key=' + urllib.parse.quote(key),
                                     data=json.dumps(payload, ensure_ascii=False).encode(), method='POST',
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read() or b'{}')


def sync(workspace='xinxuan', verbose=True):
    if not configured():
        raise RuntimeError('未配置 PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET')
    seen = _load_seen()
    items = collect(verbose=verbose)
    fresh = [item for item in items if item['id'] not in seen]
    if verbose:
        print(f'Pinterest 共 {len(items)} Pin，新增 {len(fresh)}')
    pushed = 0
    for item in fresh:
        try:
            push_item(item, workspace)
            seen.add(item['id'])
            pushed += 1
            if verbose:
                print(f'  + {item["id"]} {item["title"][:70]}')
        except Exception as error:
            if verbose:
                print(f'  推送失败 {item["id"]}: {error}')
        time.sleep(0.4)
    _save_seen(seen)
    if verbose:
        print(f'同步完成，新增 {pushed} 条')
    return {'total': len(items), 'pushed': pushed}


def status():
    return {
        'configured': configured(),
        'connected': connected(),
        'tokens': {key: value for key, value in _tokens().items() if key not in ('access_token', 'refresh_token')},
        'redirect_uri': REDIRECT_URI,
        'scopes': SCOPES,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description='Pinterest official API sync')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('status')
    sub.add_parser('auth-url')
    sub.add_parser('boards')
    sync_parser = sub.add_parser('sync')
    sync_parser.add_argument('--workspace', choices=('xinxuan', 'personal'), default='xinxuan')
    args = parser.parse_args(argv)
    studio_sync._ensure()
    if args.command == 'status':
        print(json.dumps(status(), ensure_ascii=False, indent=2))
    elif args.command == 'auth-url':
        print(auth_url(make_state()))
    elif args.command == 'boards':
        for board in list_boards():
            print(f'{board.get("name")}  {board.get("privacy")}  {board.get("pin_count")} Pin  {board.get("id")}')
    elif args.command == 'sync':
        print(json.dumps(sync(args.workspace), ensure_ascii=False))


if __name__ == '__main__':
    main()
