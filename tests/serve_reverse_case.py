"""Isolated manual UI test server. Mock AI only; no credentials or cloud sync.
Run with the bundled Python: python tests/serve_reverse_case.py
"""
import json
import sys
import tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import studio_server as studio


class TestHandler(studio.Handler):
    def do_GET(self):
        path=self.path.split('?')[0]
        if path=='/mobile-config.js':return self.send_preview(b'window.JINHUA_MOBILE_CONFIG=Object.freeze({});','application/javascript')
        if path=='/api/profile-seed':return self.send_json({'fields':{}})
        if path=='/api/reference-sources':return self.send_json({})
        if path.startswith('/api/') and path!='/api/health' and not path.startswith('/api/jobs/'):
            return self.send_json({'error':'TEST: endpoint disabled'},404)
        return super().do_GET()

    def do_POST(self):
        if self.path=='/api/chat':
            body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
            clip=bool(body.get('references'))
            fields={'summary':'测试样片：可见蓝色背景与白色图形。','role':'测试推断：可能作为开场视觉，真实用途待确认。','visual':'测试描述：冷色画面，主体位于中央。','uncertainties':'隔离测试结果，并非对真实项目的判断。'} if clip else {'theme':'测试整场：以统一视觉串联预热与活动内容。','rhythm':'仅根据采样资料整理，发布日期与实际节奏待确认。','visual':'测试定调：蓝色背景与简洁主体。','reuse':'测试建议：可复用统一色彩，但不能推定真实传播效果。','uncertainties':'隔离测试模拟AI结果；真实预算、主创意图和音轨均未核实。'}
            return self.send_json({'text':json.dumps(fields,ensure_ascii=False),'model':'test-only','usage':{}})
        if self.path not in {'/api/upload','/api/frames','/api/verify','/api/reverse/case/pdf','/api/document/text'}:
            return self.send_json({'error':'TEST: no paid/external requests allowed'},403)
        return super().do_POST()


if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='jinhua-case-test-') as folder:
        studio.DATA=Path(folder);studio.MEDIA=studio.DATA/'media';studio.MEDIA.mkdir()
        server=studio.ThreadingHTTPServer(('127.0.0.1',8793),TestHandler)
        print('ISOLATED TEST: http://127.0.0.1:8793/ (AI mocked, cloud disabled)',flush=True)
        try:server.serve_forever()
        finally:server.server_close()
