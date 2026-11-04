#!/usr/bin/env python3
"""Ingest favourite websites (RSS/Atom) and Pinterest saved pins into Lance.

Runs inside the Lance container (same volume as the sync backend):

    python3 studio_ingest.py feed-add https://example.com/feed.xml
    python3 studio_ingest.py feed-list
    python3 studio_ingest.py pinterest-sync
    python3 studio_ingest.py sync        # feeds + pinterest, for cron

New items are written through /api/sync/capture and appear in the desktop
reference library automatically (metadata.capture=simple).
"""
import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request
from xml.etree import ElementTree as ET

import studio_sync

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
CONFIG_NAME = 'ingest.json'
SEEN_NAME = 'ingest-seen.json'
DEFAULT_CONFIG = {'backfill': 5, 'feeds': [], 'pinterest': {'username': 'laijinghua624624', 'workspace': 'xinxuan'}}


def _sync_dir():
    return studio_sync.SYNC_DIR


def _load(name, default):
    path = _sync_dir() / name
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return json.loads(json.dumps(default))


def _save(name, data):
    path = _sync_dir() / name
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)


def _config():
    config = _load(CONFIG_NAME, DEFAULT_CONFIG)
    config.setdefault('backfill', 5)
    config.setdefault('feeds', [])
    config.setdefault('pinterest', DEFAULT_CONFIG['pinterest'])
    return config


def _seen():
    return _load(SEEN_NAME, {'feeds': {}, 'pinterest': []})


def _save_seen(seen):
    _save(SEEN_NAME, seen)


def fetch(url, limit=3 * 1024 * 1024, timeout=25):
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = (response.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('内容过大: ' + url)
    return data, content_type


def fetch_text(url, limit=3 * 1024 * 1024):
    data, content_type = fetch(url, limit)
    charset = 'utf-8'
    match = re.search(r'charset=([\w-]+)', content_type or '', re.I)
    if match:
        charset = match.group(1)
    return data.decode(charset, 'ignore')


def strip_html(value):
    text = re.sub(r'<script.*?</script>', ' ', value or '', flags=re.I | re.S)
    text = re.sub(r'<style.*?</style>', ' ', text, flags=re.I | re.S)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'&#39;', "'", text)
    return re.sub(r'\s+', ' ', text).strip()


def tag_name(element):
    return element.tag.split('}')[-1].lower()


def first_child(element, name):
    for child in element:
        if tag_name(child) == name:
            return child
    return None


def child_text(element, name):
    child = first_child(element, name)
    if child is None:
        return ''
    return ''.join(child.itertext()).strip()


def feed_items(xml_text, base_url):
    root = ET.fromstring(xml_text)
    items = []
    for node in root.iter():
        if tag_name(node) not in ('item', 'entry'):
            continue
        title = child_text(node, 'title')
        link = ''
        link_node = first_child(node, 'link')
        if link_node is not None:
            link = (link_node.text or '').strip() or (link_node.get('href') or '').strip()
        if not link:
            for child in node:
                if tag_name(child) == 'link' and child.get('href'):
                    link = child.get('href').strip()
                    break
        if not link:
            continue
        link = urllib.parse.urljoin(base_url, link)
        summary = child_text(node, 'description') or child_text(node, 'summary') or child_text(node, 'content')
        summary = strip_html(summary)[:4000]
        image = ''
        for child in node:
            name = tag_name(child)
            if name == 'enclosure' and str(child.get('type', '')).startswith('image/'):
                image = child.get('url') or ''
            elif name == 'content' and child.get('url'):
                image = image or child.get('url')
            elif name == 'thumbnail' and child.get('url'):
                image = image or child.get('url')
        if not image:
            match = re.search(r'<img[^>]+src=["\']([^"\']+)', child_text(node, 'description') + child_text(node, 'content'), re.I)
            if match:
                image = urllib.parse.urljoin(base_url, match.group(1))
        published = child_text(node, 'pubDate') or child_text(node, 'published') or child_text(node, 'updated')
        items.append({'url': link, 'title': title[:200], 'body': summary, 'cover': image, 'published': published})
    return items


def push(item, workspace):
    key = studio_sync._capture_key()
    if not key:
        raise RuntimeError('缺少收藏口令')
    payload = {
        'url': item.get('url'),
        'title': item.get('title') or '',
        'body': item.get('body') or '',
        'cover_url': item.get('cover') or '',
        'workspace': workspace,
    }
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request('http://127.0.0.1:10000/api/sync/capture?key=' + urllib.parse.quote(key), data=data,
                                     headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read() or b'{}')


def cmd_feed_add(args):
    config = _config()
    url = args.url.strip()
    if any(feed['url'] == url for feed in config['feeds']):
        print('已存在：' + url)
        return
    title = args.title or ''
    if not title:
        try:
            root = ET.fromstring(fetch_text(url))
            title = child_text(root, 'title') or ''
        except Exception as error:
            print('警告：无法读取订阅源标题（%s），仍会保存' % error)
    config['feeds'].append({'url': url, 'title': title or url, 'workspace': args.workspace})
    _save(CONFIG_NAME, config)
    print('已添加：%s%s' % (title or '', ' (' + url + ')'))


def cmd_feed_list(_args):
    config = _config()
    if not config['feeds']:
        print('还没有订阅源。用 feed-add <URL> 添加。')
        return
    for index, feed in enumerate(config['feeds'], 1):
        print('%d. %s  %s  [%s]' % (index, feed.get('title') or '', feed['url'], feed.get('workspace', 'xinxuan')))


def cmd_feed_remove(args):
    config = _config()
    before = len(config['feeds'])
    config['feeds'] = [feed for feed in config['feeds'] if feed['url'] != args.url]
    _save(CONFIG_NAME, config)
    print('已移除 %d 个' % (before - len(config['feeds'])))


def sync_feeds(verbose=True):
    config = _config()
    seen = _seen()
    pushed = 0
    for feed in config['feeds']:
        url = feed['url']
        workspace = feed.get('workspace') or 'xinxuan'
        state = seen.setdefault('feeds', {}).setdefault(url, {'seen': [], 'initialized': False})
        try:
            items = feed_items(fetch_text(url), url)
        except Exception as error:
            if verbose:
                print('订阅源失败 %s: %s' % (url, error))
            continue
        items = items[:40]
        fresh = [item for item in items if item['url'] not in state['seen']]
        if not state['initialized']:
            fresh = fresh[:int(config.get('backfill', 5))]
        for item in fresh:
            try:
                push(item, workspace)
                pushed += 1
                state['seen'].append(item['url'])
                if verbose:
                    print('  + %s' % (item.get('title') or item['url'])[:90])
            except Exception as error:
                if verbose:
                    print('  推送失败 %s: %s' % (item['url'], error))
        state['seen'] = state['seen'][-800:]
        state['initialized'] = True
        time.sleep(0.4)
    _save_seen(seen)
    if verbose:
        print('订阅源同步完成，新增 %d 条' % pushed)
    return pushed


def pinterest_pin_ids(username):
    ids = []
    for suffix in ('', '_created', '_saved'):
        url = 'https://www.pinterest.com/%s/%s' % (username, suffix)
        try:
            html = fetch_text(url)
        except Exception as error:
            print('Pinterest 页面失败 %s: %s' % (url, error))
            continue
        match = re.search(r'<script[^>]+id="__PWS_INITIAL_PROPS__"[^>]*>(.*?)</script>', html, re.S)
        if match:
            try:
                data = json.loads(match.group(1))
                pins = data.get('initialReduxState', {}).get('pins', {})
                for pin_id in pins.keys():
                    if pin_id not in ids:
                        ids.append(str(pin_id))
            except Exception:
                pass
        for pin_id in re.findall(r'/pin/(\d{12,})/', html):
            if pin_id not in ids:
                ids.append(pin_id)
    return ids


def pinterest_meta(pin_id):
    url = 'https://www.pinterest.com/pin/%s/' % pin_id
    html = fetch_text(url)
    def pick(pattern):
        match = re.search(pattern, html, re.I | re.S)
        return match.group(1).strip() if match else ''
    title = pick(r'<meta[^>]+property="og:title"[^>]+content="([^"]*)"')
    title = title or pick(r'<meta[^>]+content="([^"]*)"[^>]+property="og:title"')
    image = pick(r'<meta[^>]+property="og:image"[^>]+content="([^"]*)"')
    image = image or pick(r'<meta[^>]+content="([^"]*)"[^>]+property="og:image"')
    description = pick(r'<meta[^>]+property="og:description"[^>]+content="([^"]*)"')
    return {'url': url, 'title': title or ('Pinterest 收藏 ' + pin_id), 'body': strip_html(description)[:4000], 'cover': image}


def sync_pinterest(username=None, verbose=True):
    config = _config()
    pconfig = config.get('pinterest', {})
    username = username or pconfig.get('username') or 'laijinghua624624'
    workspace = pconfig.get('workspace') or 'xinxuan'
    seen = _seen()
    seen_ids = set(str(value) for value in seen.get('pinterest', []))
    ids = pinterest_pin_ids(username)
    fresh = [pin_id for pin_id in ids if pin_id not in seen_ids]
    pushed = 0
    for pin_id in fresh:
        try:
            item = pinterest_meta(pin_id)
            push(item, workspace)
            seen_ids.add(pin_id)
            pushed += 1
            if verbose:
                print('  + Pinterest %s %s' % (pin_id, (item.get('title') or '')[:70]))
        except Exception as error:
            if verbose:
                print('  Pinterest 失败 %s: %s' % (pin_id, error))
        time.sleep(0.6)
    seen['pinterest'] = sorted(seen_ids)[-2000:]
    _save_seen(seen)
    if verbose:
        print('Pinterest 同步完成，新增 %d 条（共 %d 个 Pin）' % (pushed, len(ids)))
    return pushed


def cmd_sync(args):
    total = 0
    if not args.feed_only:
        total += sync_pinterest(verbose=True)
    total += sync_feeds(verbose=True)
    print('全部完成，新增 %d 条' % total)


def cmd_status(_args):
    config = _config()
    seen = _seen()
    print(json.dumps({
        'feeds': [{'title': feed.get('title'), 'url': feed['url'], 'workspace': feed.get('workspace', 'xinxuan')} for feed in config.get('feeds', [])],
        'pinterest': config.get('pinterest'),
        'pinterest_seen': len(seen.get('pinterest', [])),
        'feed_seen': {key: len(value.get('seen', [])) for key, value in seen.get('feeds', {}).items()},
    }, ensure_ascii=False, indent=2))


def main(argv=None):
    parser = argparse.ArgumentParser(description='Lance ingest: RSS feeds and Pinterest')
    sub = parser.add_subparsers(dest='command', required=True)
    feed_add = sub.add_parser('feed-add')
    feed_add.add_argument('url')
    feed_add.add_argument('--workspace', choices=('xinxuan', 'personal'), default='xinxuan')
    feed_add.add_argument('--title', default='')
    sub.add_parser('feed-list')
    feed_remove = sub.add_parser('feed-remove')
    feed_remove.add_argument('url')
    sync = sub.add_parser('sync')
    sync.add_argument('--feed-only', action='store_true')
    pinterest = sub.add_parser('pinterest-sync')
    pinterest.add_argument('--username', default='')
    sub.add_parser('status')
    args = parser.parse_args(argv)
    studio_sync._ensure()
    if args.command == 'feed-add':
        cmd_feed_add(args)
    elif args.command == 'feed-list':
        cmd_feed_list(args)
    elif args.command == 'feed-remove':
        cmd_feed_remove(args)
    elif args.command == 'sync':
        cmd_sync(args)
    elif args.command == 'pinterest-sync':
        sync_pinterest(args.username or None)
    elif args.command == 'status':
        cmd_status(args)


if __name__ == '__main__':
    main()
