import unittest,tempfile,zipfile
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
