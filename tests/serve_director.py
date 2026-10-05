"""Isolated director flow: synthetic fixtures, mock AI, no cloud or credentials."""
import json
import re
import shutil
import tempfile
from pathlib import Path
from serve_reverse_case import TestHandler,studio

class DirectorHandler(TestHandler):
    def do_POST(self):
        if self.path=='/api/chat':
            body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))));prompt=body.get('prompt','')
            if '本次只处理随请求发送' in prompt:
                data=json.loads(prompt.split('资料：')[1].split('\n格式：')[0]);manifest=data['visualInputManifest']
                result={'shots':[{'frameIndex':f['frameIndex'],'visual':'测试图形画面','camera':'静帧构图，运镜未知','story':'测试段落','evidence':'可见测试图形'} for f in manifest]}
            elif '暂不写长报告' in prompt:
                result={'summary':'测试主线：测试图形随时间变化。','relationships':'没有可核对人物身份，不推断关系。','concept':'重复画面建立节奏，这是测试解读。','questions':'没有核对音轨，声音和原作者意图待确认。','beats':[{'title':'图形段落','claim':'可见测试图形，叙事意义为推测。','basis':'inferred','frameIndices':[0]}]}
            else:
                result={'review':'模拟提案，仅验证流程。人物关系、声音和执行建议尚待人工核对。','pages':[{'title':f'测试提案第{i+1}页','section':['story','mechanism','execution','decisions','limits'][i%5],'basis':'proposal' if i%5==2 else 'inferred','points':['从具体原片证据解释判断。','执行选择仍需与团队核对。'],'notes':'这一页先解释观众感受，再回到画面依据。这里是模拟分析，不代表真实原片事实或作者意图。','frameIndices':[0]} for i in range(10)]}
            return self.send_json({'text':json.dumps(result,ensure_ascii=False),'model':'mock-no-charge','usage':{}})
        if self.path=='/api/reverse/evidence':return studio.Handler.do_POST(self)
        return super().do_POST()

if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='jinhua-director-test-') as folder:
        studio.DATA=Path(folder);studio.MEDIA=studio.DATA/'media';studio.MEDIA.mkdir()
        server=studio.ThreadingHTTPServer(('127.0.0.1',8795),DirectorHandler)
        print('MOCK ONLY: http://127.0.0.1:8795/ — upload synthetic test-output/fixture.mp4',flush=True)
        try:server.serve_forever()
        finally:server.server_close()
