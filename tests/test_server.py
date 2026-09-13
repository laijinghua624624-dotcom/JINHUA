import unittest, tempfile, threading, json, os, subprocess, http.client
from pathlib import Path
from unittest.mock import patch
import studio_server as s

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='lance-tests-');cls.orig=s.MEDIA;s.MEDIA=Path(cls.temp.name);s.DATA=s.MEDIA
        cls.clip=s.MEDIA/('a'*32+'.mp4')
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=160x120:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libx264','-preset','ultrafast','-c:a','aac','-y',str(cls.clip)],check=True)
        cls.server=s.ThreadingHTTPServer(('127.0.0.1',0),s.Handler);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();s.MEDIA=cls.orig;cls.temp.cleanup()
    def request(self,method,path,body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        conn.request(method,path,body=body,headers=headers or {});r=conn.getresponse();status=r.status;data=r.read();conn.close();return status,data
    def test_security_and_health(self):
        with patch.dict(os.environ,{'ARK_API_KEY':'TEST-DO-NOT-EXPOSE'}):
            status,data=self.request('GET','/api/health');self.assertEqual(status,200);self.assertNotIn(b'TEST-DO-NOT-EXPOSE',data)
        for path in ['/.env','/studio_server.py','/../.env','/.lance-data/']:
            self.assertEqual(self.request('GET',path)[0],404)
        self.assertEqual(self.request('GET','/api/health',headers={'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request('GET','/api/health',headers={'Host':'evil.example'})[0],403)
        with self.assertRaises(ValueError):s.media_path('../.env')
    def test_video_contract(self):
        payload=s.build_video_body({'prompt':'test','duration':8,'ratio':'4:3'},'model-id');self.assertEqual(payload['duration'],8);self.assertEqual(payload['ratio'],'4:3')
        with self.assertRaises(ValueError):s.build_video_body({'prompt':'test','duration':13},'model')
        with self.assertRaises(ValueError):s.ark_request('/chat/completions',{},'')
    def test_upload_verify_range(self):
        status,data=self.request('POST','/api/upload',self.clip.read_bytes(),{'X-File-Name':'test.mov'});self.assertEqual(status,200);meta=json.loads(data);self.assertEqual(meta['kind'],'video');self.assertTrue(meta['localId'].endswith('.mp4'));self.assertAlmostEqual(meta['duration'],8,delta=.15)
        status,data=self.request('GET','/media/'+meta['localId'],headers={'Range':'bytes=0-31'});self.assertEqual(status,206);self.assertEqual(len(data),32)
        status,_=self.request('POST','/api/upload',b'not-an-image',{'X-File-Name':'bad.png'});self.assertEqual(status,400)
    def test_12_frames_and_25_shot_film(self):
        frames=s.extract_frames(self.clip.name);self.assertEqual(len(frames),12);self.assertEqual(frames[0]['sourceVideo'],self.clip.name);self.assertGreater(frames[-1]['timestamp'],frames[0]['timestamp'])
        with self.assertRaises(ValueError):s.assemble([{'localId':self.clip.name,'duration':2}])
        result=s.assemble([{'localId':self.clip.name,'duration':2} for _ in range(25)])
        self.assertTrue(result['hasAudio']);self.assertAlmostEqual(result['duration'],50,delta=.5)
    def test_missing_model_is_explicit_failure(self):
        with patch.dict(os.environ,{'ARK_TEXT_MODEL':''},clear=False):
            status,data=self.request('POST','/api/chat',json.dumps({'prompt':'test'}),{'Content-Type':'application/json'});self.assertEqual(status,400);self.assertIn('模型',json.loads(data)['error'])

if __name__=='__main__':unittest.main()
