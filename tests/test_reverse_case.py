import unittest
from pathlib import Path
from unittest.mock import patch
import studio_server as server


class SamplingTests(unittest.TestCase):
    def test_legacy_twelve_and_bounded_three(self):
        def describe(path,source=None):
            return {'kind':'video','duration':1300} if str(path)=='original.mp4' else {'kind':'image','verified':True}
        with patch.object(server,'media_path',return_value=Path('original.mp4')),patch.object(server,'describe',side_effect=describe),patch.object(server.subprocess,'run') as run:
            self.assertEqual(len(server.extract_frames('original.mp4')),12)
            frames=server.extract_frames('original.mp4',3,1200,1300)
            self.assertEqual([f['timestamp'] for f in frames],[1216.67,1250,1283.33])
            self.assertEqual(run.call_count,15)
            for count,start,end in [(13,0,1),(True,0,1),(3,-1,3),(3,4,4),(3,0,1400),(3,float('nan'),3)]:
                with self.assertRaises(ValueError):server.extract_frames('original.mp4',count,start,end)

    def test_case_pdf_validation(self):
        try:from studio_pdf import reverse_case_pdf
        except ImportError:self.skipTest('reportlab unavailable')
        with self.assertRaises(ValueError):reverse_case_pdf({'title':'空项目'},lambda _:None)

    def test_case_pdf_has_real_frames_and_chinese_text(self):
        try:
            from studio_pdf import reverse_case_pdf
            from pypdf import PdfReader
        except ImportError:self.skipTest('PDF QA libraries unavailable')
        from io import BytesIO
        sample=Path(__file__).resolve().parents[1]/'test-output'/'fixture.png'
        if not sample.is_file():self.skipTest('run npm test to generate fixture first')
        payload={'title':'隔离测试 · 双十一项目','caseStatus':{'ready':True,'done':1},'overview':{key:'测试文字，仅供版面检查；不代表真实项目。' for key in ('theme','rhythm','visual','reuse','uncertainties')},'clips':[{'title':'开场预热视频','caseSummary':{'summary':'原片采样可见测试图形。','role':'可能用于开场，待核对。','visual':'色彩与主体描述。','uncertainties':'没有完整分析音轨。'},'caseFrames':[{'localId':'fixture.png','timestamp':n} for n in (1,4,7)]}]}
        pdf=reverse_case_pdf(payload,lambda _:sample)
        reader=PdfReader(BytesIO(pdf))
        self.assertEqual(len(reader.pages),9)
        self.assertIn('双十一',reader.pages[0].extract_text())
        self.assertTrue(reader.pages[1].images)
        self.assertTrue(reader.pages[7].images)
        import os
        if os.environ.get('JINHUA_CASE_QA_DIR'):
            (Path(os.environ['JINHUA_CASE_QA_DIR'])/'project-case.pdf').write_bytes(pdf)


if __name__=='__main__':unittest.main()
