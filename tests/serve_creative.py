"""Disposable UI sandbox. No outbound AI, cloud credentials or production data."""
import base64
import json
import tempfile
from pathlib import Path
from serve_reverse_case import TestHandler, studio


class CreativeHandler(TestHandler):
    def do_POST(self):
        if self.path == '/api/chat':
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            if '"directions"' in body.get('prompt', ''):
                data = {'directions': [
                    {'title': '布瀑中的相遇', 'premise': '由人与布料的互动展现季节转换', 'reason': '服装仍为主角', 'visual': '暖色侧光与布料肌理', 'tradeoff': '需要空间和布景'},
                    {'title': '衣服的独白', 'premise': '用一件衣服串起人物的一天', 'reason': '突出真实穿着场景', 'visual': '自然光与近景细节', 'tradeoff': '需要表演与生活空间'}]}
            else:
                data = {'reason': '隔离测试：根据反馈只修改所选章节', 'fields': {k: '测试修订 · '+k+' · 保留人物与布瀑，使用自然暖光' for k in ['outline','meaning','description','dialogue','atmosphere','camera','script','scene','art']}}
            return self.send_json({'text': json.dumps(data, ensure_ascii=False), 'model':'mock-no-charge','usage':{}})
        if self.path == '/api/image':
            self.rfile.read(int(self.headers.get('Content-Length', 0)))
            return self.send_json({'localId':'00000000000000000000000000000001.png','kind':'image','verified':True,'source':'ai'})
        return super().do_POST()


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='jinhua-creative-test-') as folder:
        studio.DATA=Path(folder);studio.MEDIA=studio.DATA/'media';studio.MEDIA.mkdir()
        (studio.MEDIA/'00000000000000000000000000000001.png').write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII='))
        server=studio.ThreadingHTTPServer(('127.0.0.1',8794),CreativeHandler)
        print('Isolated creative UI: http://127.0.0.1:8794/ — MOCK ONLY',flush=True)
        try:server.serve_forever()
        finally:server.server_close()
