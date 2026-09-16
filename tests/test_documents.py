import unittest,tempfile,zipfile
from unittest import mock
from pathlib import Path
import studio_server as s
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
