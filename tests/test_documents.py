import unittest,tempfile,zipfile
from unittest import mock
from pathlib import Path
import studio_server as s
from io import BytesIO
try:
    from studio_pdf import reverse_story_pdf
    from pypdf import PdfReader
    PDF_RUNTIME=True
except ModuleNotFoundError:
    PDF_RUNTIME=False
class DocumentTests(unittest.TestCase):
    def test_text_and_docx_actual_content_and_invalid_paths(self):
        old=s.MEDIA
        with tempfile.TemporaryDirectory(prefix='lance-doc-tests-') as tmp:
            s.MEDIA=Path(tmp)
            try:
                path=s.MEDIA/('a'*32+'.txt');path.write_text('测试履历：摄影和纪录片',encoding='utf8');self.assertEqual(s.describe(path)['kind'],'text');self.assertIn('纪录片',s.document_text(path.name)['text'])
                path=s.MEDIA/('b'*32+'.docx')
                with zipfile.ZipFile(path,'w') as archive:archive.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>真实正文测试</w:t></w:r></w:p></w:body></w:document>')
                self.assertEqual(s.document_text(path.name)['text'],'真实正文测试')
                with self.assertRaises(ValueError):s.document_text('../../.env')
            finally:s.MEDIA=old

    def test_scanned_pdf_uses_ocr_and_labels_manual_review(self):
        old=s.MEDIA
        with tempfile.TemporaryDirectory(prefix='lance-pdf-tests-') as tmp:
            s.MEDIA=Path(tmp);path=s.MEDIA/('c'*32+'.pdf');path.write_bytes(b'%PDF-test')
            completed=mock.Mock(returncode=0,stdout=b'')
            try:
                with mock.patch.object(s.shutil,'which',return_value='/mock/tool'),mock.patch.object(s.subprocess,'run',return_value=completed),mock.patch.object(s,'pdf_ocr',return_value=('扫描件识别文字',1)):
                    result=s.document_text(path.name)
                self.assertEqual(result['text'],'扫描件识别文字');self.assertIn('OCR前1页',result['notice']);self.assertIn('人工核对',result['notice'])
            finally:s.MEDIA=old

    @unittest.skipUnless(PDF_RUNTIME,'PDF runtime dependencies are optional in the default test interpreter')
    def test_reverse_story_pdf_contains_source_frame_and_full_report(self):
        fields={key:'测试内容：'+label for key,label in (
            ('origin','创意来源与推导链'),('fit','内容目标与创意贴合度'),('intent','创作意图'),('concept','核心概念'),('audience','观众钩子'),('outline','创意大纲'),
            ('meaning','创意寓意'),('description','起承转合'),('script','开场、发展、转折、高潮和收束的完整脚本'),
            ('dialogue','声音待核对'),('scene','场景'),('art','美术'),('atmosphere','氛围'),('camera','摄影'),
            ('editing','剪辑'),('music','音乐'),('costume','造型'),('landing','从故事到落地的执行路径'),('production','执行'),('reuse','可复用机制'),
            ('archive','归档'),('uncertainties','抽帧不等于逐镜识别'))}
        shot={'frameIndex':0,'timestamp':1.25,'story':'人物从犹豫走向决定','narrativeRole':'开场建立动机','action':'抬头','emotion':'从压抑到坚定','visual':'可见人物','camera':'中景','cameraMovement':'缓慢推近，待原片核对','editThinking':'用动作变化作为切换点','dialogue':'待核对','transition':'顺接','evidence':'动作可见，动机为推测','note':'仅依据抽帧'}
        fixture=Path(__file__).resolve().parent.parent/'test-output'/'fixture.png'
        payload={'title':'视频反推PDF测试','purpose':'archive','type':'预热片','frames':[{'localId':'frame.png','timestamp':1.25}],'analysis':{'fields':fields,'shots':[shot],'basis':'原片关键帧'}}
        data=reverse_story_pdf(payload,lambda _:fixture)
        self.assertTrue(data.startswith(b'%PDF-'));reader=PdfReader(BytesIO(data));self.assertGreaterEqual(len(reader.pages),8)
        text=''.join(page.extract_text() or '' for page in reader.pages)
        self.assertIn('3分钟汇报摘要',text);self.assertIn('完整故事脚本',text);self.assertIn('逐段详细脚本',text);self.assertIn('运镜思考',text);self.assertIn('不含新生成图片',text)
