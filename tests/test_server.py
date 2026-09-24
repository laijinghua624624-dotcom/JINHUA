import unittest, tempfile, threading, json, os, subprocess, http.client, urllib.parse
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
        for name in ['deliverables/Lance专场整体汇报模板_v1.pptx','deliverables/Lance单条剧本汇报模板_v1.pptx']:
            target=s.ROOT/name
            if target.is_file():self.assertEqual(self.request('GET','/'+urllib.parse.quote(name))[0],200)
        self.assertEqual(self.request('GET','/studio-security.js')[0],200)
    def test_client_cannot_supply_credentials_or_override_model(self):
        with patch.dict(os.environ,{'ARK_API_KEY':'server-test-key','ARK_DIRECTOR_MODEL':'director-test','ARK_REFINE_MODEL':'refine-test'}),patch.object(s,'ark_request',return_value={'choices':[{'message':{'content':'{}'}}]}) as call:
            status,data=self.request('POST','/api/chat',json.dumps({'prompt':'test','purpose':'refine','model':'client-model'}),{'Authorization':'Bearer client-secret','Content-Type':'application/json'})
            self.assertEqual(status,200);self.assertEqual(call.call_args.args[1]['model'],'refine-test');self.assertEqual(call.call_args.args[1]['thinking'],{'type':'disabled'});self.assertEqual(call.call_args.args[1]['max_tokens'],4000);self.assertEqual(call.call_args.args[2],'server-test-key')
            self.assertNotIn(b'server-test-key',data);self.assertNotIn(b'client-secret',data)
            status,_=self.request('POST','/api/chat',json.dumps({'purpose':'embedding'}));self.assertEqual(status,400)
    def test_video_contract(self):
        payload=s.build_video_body({'prompt':'test','duration':8,'ratio':'4:3'},'model-id');self.assertEqual(payload['duration'],8);self.assertEqual(payload['ratio'],'4:3')
        with self.assertRaises(ValueError):s.build_video_body({'prompt':'test','duration':13},'model')
        with self.assertRaises(ValueError):s.ark_request('/chat/completions',{},'')
    def test_image_sizes_include_portrait_covers(self):
        self.assertEqual(s.image_size({}),'2304x1728')
        self.assertEqual(s.image_size({'size':'1728x2304'}),'1728x2304')
        self.assertEqual(s.image_size({'size':'1440x2560'}),'1440x2560')
        with self.assertRaises(ValueError):s.image_size({'size':'999x999'})
    def test_upload_verify_range(self):
        status,data=self.request('POST','/api/upload',self.clip.read_bytes(),{'X-File-Name':'test.mov'});self.assertEqual(status,200);meta=json.loads(data);self.assertEqual(meta['kind'],'video');self.assertTrue(meta['localId'].endswith('.mp4'));self.assertAlmostEqual(meta['duration'],8,delta=.15)
        linked=s.save_public_video(self.clip.read_bytes(),'video/mp4','https://media.example/work.mp4');self.assertEqual(linked['source'],'link');self.assertEqual(linked['kind'],'video');self.assertAlmostEqual(linked['duration'],8,delta=.15)
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
    def test_public_link_metadata_and_endpoint(self):
        page=b'<html><head><meta property="og:title" content="Public Work"><meta name="description" content="Verified page summary"><title>Fallback</title></head></html>'
        with patch.object(s,'public_url',side_effect=lambda value:value),patch.object(s,'read_public',return_value=(page,'text/html','https://example.com/work','utf-8')),patch.object(s,'download_public_video',side_effect=ValueError('无公开视频')):
            parsed=s.parse_public_link('https://example.com/work')
        self.assertEqual(parsed['title'],'Public Work');self.assertEqual(parsed['description'],'Verified page summary');self.assertIsNone(parsed['asset']);self.assertIn('手动上传',parsed['notice'])
        with self.assertRaises(ValueError):s.public_url('https://127.0.0.1/private.mp4')
        mocked={'url':'https://example.com/work','finalUrl':'https://example.com/work','title':'Mock','description':'','siteName':'example.com','asset':None,'notice':'已解析页面信息'}
        with patch.object(s,'parse_public_link',return_value=mocked):
            status,data=self.request('POST','/api/link/import',json.dumps({'url':'https://example.com/work'}),{'Content-Type':'application/json'})
        self.assertEqual(status,200);self.assertEqual(json.loads(data)['title'],'Mock')

    def test_metadata_only_link_keeps_preview_without_downloading_video(self):
        page=b'<html><head><meta property="og:title" content="Visual Work"><meta property="og:image" content="https://cdn.example/cover.jpg"><meta property="og:video" content="https://cdn.example/movie.mp4"></head></html>'
        with patch.object(s,'public_url',side_effect=lambda value:value),patch.object(s,'read_public',return_value=(page,'text/html','https://example.com/work','utf-8')):
            parsed=s.parse_public_metadata('https://example.com/work')
        self.assertEqual(parsed['previewImage'],'https://cdn.example/cover.jpg');self.assertEqual(parsed['mediaKind'],'video');self.assertIsNone(parsed['asset'])

    def test_pinterest_status_never_exposes_credentials(self):
        with patch.dict(os.environ,{'PINTEREST_APP_ID':'app','PINTEREST_APP_SECRET':'DO-NOT-EXPOSE','PINTEREST_ACCESS_TOKEN':''},clear=False),patch.object(s,'pinterest_token',return_value=None):
            status=s.pinterest_status()
        self.assertTrue(status['oauthConfigured']);self.assertFalse(status['connected']);self.assertNotIn('DO-NOT-EXPOSE',json.dumps(status))

    def test_pinterest_sync_normalizes_saved_pins(self):
        response={'items':[{'id':'42','title':'Stage Light','description':'A moving spotlight','link':'https://example.com/work','media':{'media_type':'image','images':{'600x':{'url':'https://cdn.example/42.jpg'}}}}]}
        def pinterest(path,token,params=None):return {'items':[{'id':'board','name':'My Saves'}]} if path=='/boards' else response
        with patch.object(s,'pinterest_token',return_value={'access_token':'token'}),patch.object(s,'pinterest_request',side_effect=pinterest):
            result=s.pinterest_sync(10)
        self.assertEqual(result['count'],1);self.assertEqual(result['items'][0]['previewImage'],'https://cdn.example/42.jpg');self.assertEqual(result['items'][0]['boardName'],'My Saves');self.assertNotIn('token',json.dumps(result))

    def test_radar_preview_is_image_only_and_not_an_open_proxy(self):
        image=b'preview-bytes'
        with patch.object(s,'public_url',side_effect=lambda value:value),patch.object(s,'read_public',return_value=(image,'image/jpeg','https://images.ctfassets.net/example.jpg','utf-8')):
            data,content_type=s.radar_preview('https://images.ctfassets.net/example.jpg')
        self.assertEqual(data,image);self.assertEqual(content_type,'image/jpeg')
        with self.assertRaises(ValueError):s.radar_preview('https://example.com/private.jpg')
        with patch.object(s,'public_url',side_effect=lambda value:value),patch.object(s,'read_public',return_value=(b'<svg/>','image/svg+xml','https://images.ctfassets.net/example.svg','utf-8')):
            with self.assertRaises(ValueError):s.radar_preview('https://images.ctfassets.net/example.svg')

    def test_reference_download_only_serves_public_raster_images(self):
        with patch.object(s,'read_public',return_value=(b'image','image/jpeg','https://cdn.example/cover.jpg','utf-8')):
            status,data=self.request('GET','/api/reference-download?url='+urllib.parse.quote('https://cdn.example/cover.jpg'))
        self.assertEqual(status,200);self.assertEqual(data,b'image')
        with patch.object(s,'read_public',return_value=(b'<html>','text/html','https://example.com/','utf-8')):
            status,_=self.request('GET','/api/reference-download?url='+urllib.parse.quote('https://example.com/'))
        self.assertEqual(status,400)

if __name__=='__main__':unittest.main()
