import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import types
import unittest
from unittest.mock import patch

import studio_server as s
import studio_upload as u


class UploadTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='lance-upload-test-')
        self.old=(s.DATA,s.MEDIA)
        s.DATA=Path(self.temp.name);s.MEDIA=s.DATA/'media';s.MEDIA.mkdir()
    def tearDown(self):
        s.DATA,s.MEDIA=self.old
        self.temp.cleanup()
    def clip(self):
        p=s.MEDIA/('a'*32+'.mp4')
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:size=320x180:rate=24','-f','lavfi','-i','sine=frequency=440','-t','1','-c:v','libx264','-c:a','aac','-y',str(p)],check=True)
        return p
    def test_local_limit_cannot_be_enabled_by_forwarded_header(self):
        h=types.SimpleNamespace(headers={'Host':'localhost:8787'},client_address=('127.0.0.1',5))
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(u.limits(h)['reverseVideoBytes'],4*1024**3)
            h.client_address=('10.0.0.4',5);h.headers['X-Forwarded-For']='127.0.0.1'
            self.assertEqual(u.limits(h)['reverseVideoBytes'],u.FILE_LIMIT)
            h.client_address=('127.0.0.1',5);h.headers['Origin']='https://laijinghua624624-dotcom.github.io'
            self.assertFalse(u.limits(h)['localLargeVideo'])
            h.headers.pop('Origin')
            os.environ['LANCE_PUBLIC_ORIGIN']='https://example.com'
            self.assertFalse(u.limits(h)['localLargeVideo'])
    def test_streamed_receipt_is_exact_and_incomplete_files_are_not_published(self):
        class Bounded(io.BytesIO):
            def read(self,n=-1):
                if n<0 or n>1024**2:raise AssertionError('unbounded read')
                return super().read(n)
        raw=b'x'*(3*1024**2+4);target=s.MEDIA/'test.mp4'
        u.receive(Bounded(raw),len(raw),target)
        self.assertEqual(target.read_bytes(),raw)
        broken=s.MEDIA/'broken.mp4'
        with self.assertRaisesRegex(u.UploadError,'中断'):u.receive(Bounded(b'x'),100,broken)
        self.assertFalse(broken.exists());self.assertFalse(broken.with_suffix('.mp4.part').exists())
        with patch.object(u.shutil,'disk_usage',return_value=types.SimpleNamespace(free=1)):
            with self.assertRaisesRegex(u.UploadError,'磁盘'):u.receive(io.BytesIO(b'x'),1,broken)
    def test_prepare_preserves_original_audio_duration_and_result_survives_restart(self):
        source=self.clip();digest=hashlib.sha256(source.read_bytes()).digest()
        original=s.describe(source);original.update(bytes=source.stat().st_size,name='中文.mp4')
        record={'uploadId':source.stem,'status':'uploaded','original':original}
        u.prepare(s,record)
        saved=u.status(s,source.stem)
        self.assertEqual(saved['status'],'succeeded',saved.get('error'))
        proxy=s.media_path(saved['result']['localId'])
        self.assertNotEqual(proxy,source)
        self.assertEqual(hashlib.sha256(source.read_bytes()).digest(),digest)
        self.assertTrue(saved['result']['hasAudio'])
        self.assertLess(abs(saved['result']['duration']-original['duration']),.2)
        self.assertFalse(saved['result'].get('localOnly',False))
        self.assertEqual(u.start(s,source.stem)['result'],saved['result'])
    def test_failed_processing_keeps_source_and_interrupted_record_is_retryable(self):
        source=self.clip();original=s.describe(source);original.update(name='clip.mp4',bytes=source.stat().st_size)
        record={'uploadId':source.stem,'status':'uploaded','original':original}
        with patch.object(u.subprocess,'Popen',side_effect=OSError('decoder unavailable')):
            u.prepare(s,record)
        self.assertTrue(source.exists());self.assertEqual(u.status(s,source.stem)['status'],'failed')
        record['status']='processing';u.write_record(s,record)
        self.assertEqual(u.status(s,source.stem)['status'],'interrupted')
        with self.assertRaises(u.UploadError):u.status(s,'../secret')
    def test_http_accepts_and_tracks_preparation_without_waiting_for_transcode(self):
        source=self.clip();raw=source.read_bytes()
        server=s.ThreadingHTTPServer(('127.0.0.1',0),s.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        uid=None
        try:
            conn=http.client.HTTPConnection('127.0.0.1',server.server_port)
            conn.request('POST','/api/upload-reverse',raw,{'X-File-Name':'clip.mp4'})
            response=conn.getresponse();record=json.loads(response.read());conn.close()
            self.assertEqual(response.status,202);uid=record['uploadId']
            self.assertTrue(record['original']['localOnly'])
            for _ in range(100):
                record=u.status(s,uid)
                if record['status'] in {'succeeded','failed'}:break
                time.sleep(.05)
            self.assertEqual(record['status'],'succeeded',record.get('error'))
            conn=http.client.HTTPConnection('127.0.0.1',server.server_port)
            conn.request('GET','/api/upload-status/'+uid);response=conn.getresponse()
            self.assertEqual(json.loads(response.read())['status'],'succeeded');conn.close()
        finally:
            server.shutdown();server.server_close()
            while uid in u.ACTIVE:time.sleep(.05)

if __name__=='__main__':unittest.main()
