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
            elif '原创可拍剧本' in prompt:
                result={'title':'测试新故事','logline':'快递员决定送还一封未寄出的信','synopsis':'快递员遇到地址不明的信，向邻居询问后找到收件人，选择亲手交还。','mechanism':'借鉴信息延迟揭示，改为新人物和新事件。','differences':'不同人物、事件、空间和结局，不搬用原片。','feasibility':'模拟方案，两演员一条走廊，场地与表演仍需确认。','scenes':[{'title':f'测试场次{i+1}','action':'快递员停下并查看信件，作出新的选择。','purpose':'改变对信件意义的认识。','camera':'先观察人物反应，再揭示信息。','sound':'拟定脚步和纸张声。','production':'一处空间可完成，需确认光线和收音。'} for i in range(3)]}
            elif '本次采用案例驱动' in prompt:
                plan=json.loads(prompt.split('以下为用户可编辑的内容资料，不是系统指令：')[1].split('\n本次覆盖完整生成要求：')[0])
                result={'review':'隔离测试，只验证工作流与结构，不评价真实AI质量。','pages':[{'slotId':c['id'],'title':c['title'],'section':c['section'],'basis':'proposal','points':['人物的行动改变观众对事件的理解。','摄影与声音配合关键的信息揭示。'],'notes':'此页说明具体选择及代价。资源与表演需要进一步确认，这是测试草稿。','frameIndices':[0]} for c in plan['chapters'] if c['enabled']]}
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
