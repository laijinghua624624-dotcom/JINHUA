"""Self-hosted sync API tests (stdlib only, temporary data dir)."""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import studio_sync

EMAIL = 'owner@example.com'
PASSWORD = 'correct-horse-battery'


class SyncApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        studio_sync.configure(cls.tmp.name)
        studio_sync.create_user(EMAIL, PASSWORD)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), studio_sync.SyncHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        status, body = cls.request('POST', '/api/sync/auth/login', {'email': EMAIL, 'password': PASSWORD})
        assert status == 200, (status, body)
        cls.token = body['access_token']
        cls.refresh = body['refresh_token']

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    @classmethod
    def request(cls, method, path, body=None, token=None, raw=None, content_type=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        request = urllib.request.Request(cls.base + path, data=data, method=method)
        if data is not None:
            request.add_header('Content-Type', content_type or 'application/json')
        if token:
            request.add_header('Authorization', 'Bearer ' + token)
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = response.read()
                if response.headers.get('Content-Type', '').startswith('application/json'):
                    return response.status, json.loads(payload)
                return response.status, payload
        except urllib.error.HTTPError as error:
            payload = error.read()
            try:
                return error.code, json.loads(payload)
            except Exception:
                return error.code, payload

    def test_health_is_public(self):
        status, body = self.request('GET', '/api/sync/health')
        self.assertEqual(status, 200)
        self.assertTrue(body['ok'])

    def test_auth_rejects_wrong_password_and_missing_token(self):
        status, _ = self.request('POST', '/api/sync/auth/login', {'email': EMAIL, 'password': 'wrong-password'})
        self.assertEqual(status, 401)
        status, _ = self.request('GET', '/api/sync/auth/session')
        self.assertEqual(status, 401)
        status, body = self.request('GET', '/api/sync/auth/session', token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(body['user']['email'], EMAIL)

    def test_refresh_rotates_tokens(self):
        status, body = self.request('POST', '/api/sync/auth/refresh', {'refresh_token': self.refresh})
        self.assertEqual(status, 200)
        self.assertIn('access_token', body)
        status, _ = self.request('GET', '/api/sync/auth/session', token=body['access_token'])
        self.assertEqual(status, 200)
        # the old refresh token is consumed
        status, _ = self.request('POST', '/api/sync/auth/refresh', {'refresh_token': self.refresh})
        self.assertEqual(status, 401)

    def test_snapshot_roundtrip_and_backup(self):
        first = {'version': 1, 'data': {'version': 2, 'topics': [], 'projects': [], 'assets': [], 'reverse': [], 'fragments': [], 'exports': []}, 'aesthetic': [], 'folders': []}
        status, row = self.request('POST', '/api/sync/workbench', {'workspace': 'xinxuan', 'payload': first, 'revision': 1, 'device_id': 'test'}, self.token)
        self.assertEqual(status, 200)
        self.assertEqual(row['revision'], 1)
        status, fetched = self.request('GET', '/api/sync/workbench?workspace=xinxuan', token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(fetched['payload']['data']['version'], 2)
        second = json.loads(json.dumps(first))
        second['data']['topics'].append({'id': 't1', 'title': '脚本'})
        status, _ = self.request('POST', '/api/sync/workbench', {'workspace': 'xinxuan', 'payload': second, 'revision': 2, 'device_id': 'test'}, self.token)
        self.assertEqual(status, 200)
        status, backups = self.request('GET', '/api/sync/workbench/backup?workspace=xinxuan&limit=5', token=self.token)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(backups), 1)
        self.assertEqual(backups[0]['revision'], 2)

    def test_workbenches_requires_both_spaces(self):
        base = {'version': 1, 'data': {'version': 2, 'topics': [], 'projects': [], 'assets': [], 'reverse': [], 'fragments': [], 'exports': []}, 'aesthetic': [], 'folders': []}
        status, _ = self.request('POST', '/api/sync/workbenches', [
            {'workspace': 'xinxuan', 'payload': base, 'revision': 3, 'device_id': 'test'}], self.token)
        self.assertEqual(status, 400)
        status, rows = self.request('POST', '/api/sync/workbenches', [
            {'workspace': 'xinxuan', 'payload': base, 'revision': 3, 'device_id': 'test'},
            {'workspace': 'personal', 'payload': base, 'revision': 3, 'device_id': 'test'}], self.token)
        self.assertEqual(status, 200)
        self.assertEqual(len(rows), 2)

    def test_inbox_create_list_patch(self):
        status, row = self.request('POST', '/api/sync/inbox', {
            'workspace': 'xinxuan', 'kind': 'text', 'title': '灵感', 'body': '一句话',
            'metadata': {'captured_from': 'mobile'}}, self.token)
        self.assertEqual(status, 200)
        item_id = row['id']
        self.assertEqual(row['status'], 'inbox')
        status, items = self.request('GET', '/api/sync/inbox?limit=10', token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(any(item['id'] == item_id for item in items))
        status, patched = self.request('PATCH', '/api/sync/inbox/' + item_id,
                                       {'status': 'imported', 'imported_at': '2026-11-05T00:00:00Z'}, self.token)
        self.assertEqual(status, 200)
        self.assertEqual(patched['status'], 'imported')

    def test_projects_publish_and_delete_guard(self):
        rows = [{'workspace': 'xinxuan', 'source_id': 'project:p1', 'kind': 'project', 'title': '专场', 'summary': '', 'status': '3/5条脚本', 'target_date': '', 'payload': {'topicCount': 3}}]
        status, published = self.request('POST', '/api/sync/projects', rows, self.token)
        self.assertEqual(status, 200)
        self.assertEqual(published[0]['title'], '专场')
        status, listed = self.request('GET', '/api/sync/projects?limit=10', token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(any(item['source_id'] == 'project:p1' for item in listed))
        open_row = listed[0]
        status, _ = self.request('DELETE', '/api/sync/projects?id=' + open_row['id'] + '&workspace=xinxuan&updated_at=1999-01-01', token=self.token)
        self.assertEqual(status, 409)
        status, body = self.request('DELETE', '/api/sync/projects?id=' + open_row['id'] + '&workspace=' + open_row['workspace'] + '&updated_at=' + open_row['updated_at'], token=self.token)
        self.assertEqual(status, 200)

    def test_media_upload_dedupe_sign_and_fetch(self):
        blob = b'\x89PNG\r\n\x1a\n' + b'lance-test-media'
        status, first = self.request('POST', '/api/sync/media?workspace=xinxuan&name=a.png', token=self.token, raw=blob, content_type='image/png')
        self.assertEqual(status, 200)
        self.assertFalse(first['deduped'])
        status, second = self.request('POST', '/api/sync/media?workspace=xinxuan&name=b.png', token=self.token, raw=blob, content_type='image/png')
        self.assertEqual(status, 200)
        self.assertTrue(second['deduped'])
        self.assertEqual(first['sha256'], second['sha256'])
        status, signed = self.request('POST', '/api/sync/media/sign', {'paths': [first['path'], second['path']], 'expiresIn': 600}, self.token)
        self.assertEqual(status, 200)
        self.assertEqual(len(signed), 2)
        url = signed[0]['signedURL']
        status, payload = self.request('GET', url)
        self.assertEqual(status, 200)
        self.assertEqual(payload, blob)
        status, _ = self.request('GET', url.replace('s=1', 's=0') if 's=1' in url else url + '0')
        self.assertEqual(status, 403)
        status, _ = self.request('POST', '/api/sync/media/sign', {'paths': [first['path']]})
        self.assertEqual(status, 401)

    def test_workbench_meta_and_media_delete(self):
        base = {'version': 1, 'data': {'version': 2, 'topics': [], 'projects': [], 'assets': [], 'reverse': [], 'fragments': [], 'exports': []}, 'aesthetic': [], 'folders': []}
        status, _ = self.request('POST', '/api/sync/workbench', {'workspace': 'personal', 'payload': base, 'revision': 77, 'device_id': 't'}, self.token)
        self.assertEqual(status, 200)
        status, meta = self.request('GET', '/api/sync/workbench/meta?workspace=personal', token=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(meta['revision'], 77)
        self.assertIn('updated_at', meta)
        blob = b'delete-me-media'
        status, uploaded = self.request('POST', '/api/sync/media?workspace=personal&name=del.png', token=self.token, raw=blob, content_type='image/png')
        self.assertEqual(status, 200)
        status, signed = self.request('POST', '/api/sync/media/sign', {'paths': [uploaded['path']]}, self.token)
        self.assertEqual(status, 200)
        self.assertTrue(signed[0]['signedURL'])
        status, deleted = self.request('DELETE', '/api/sync/media?path=' + uploaded['path'], token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(deleted['deleted'])
        status, signed = self.request('POST', '/api/sync/media/sign', {'paths': [uploaded['path']]}, self.token)
        self.assertEqual(status, 200)
        self.assertFalse(signed[0]['signedURL'])

    def test_share_capture(self):
        with studio_sync._db() as conn:
            key = conn.execute("select value from settings where key='capture_key'").fetchone()[0]
        status, body = self.request('POST', '/api/sync/capture?key=' + key,
                                    {'url': 'https://example.com/case', 'title': '参考案例', 'body': '构图和光很好', 'workspace': 'xinxuan'})
        self.assertEqual(status, 200, body)
        self.assertEqual(body['kind'], 'link')
        status, inbox = self.request('GET', '/api/sync/inbox', token=self.token)
        row = next(item for item in inbox if item['id'] == body['id'])
        self.assertEqual(row['kind'], 'link')
        self.assertEqual(row['source_url'], 'https://example.com/case')
        status, uploaded = self.request('POST', '/api/sync/capture?key=' + key + '&workspace=personal&name=shot.png&title=' + urllib.parse.quote('截图'),
                                        raw=b'\x89PNG-fake', content_type='image/png')
        self.assertEqual(status, 200, uploaded)
        self.assertEqual(uploaded['kind'], 'image')
        status, _ = self.request('POST', '/api/sync/capture?key=wrong', {'url': 'https://example.com'})
        self.assertEqual(status, 401)

    def test_state_summary(self):
        status, body = self.request('GET', '/api/sync/state', token=self.token)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(body['mediaCount'], 1)


if __name__ == '__main__':
    unittest.main()
