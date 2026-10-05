import unittest
import subprocess
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch,Mock
import studio_server as s

class DirectorSamplingTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'ffmpeg required')
    def test_real_scene_detection_and_focus(self):
        with tempfile.TemporaryDirectory(prefix='director-scenes-') as folder,patch.object(s,'MEDIA',Path(folder)):
            video=Path(folder)/('a'*32+'.mp4')
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=black:s=160x90:d=10:r=10','-f','lavfi','-i','color=white:s=160x90:d=10:r=10','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-y',str(video)],check=True,capture_output=True)
            result=s.extract_reverse_evidence(video.name)
            self.assertIn('场景变化',result['notice']);self.assertGreater(len(result['frames']),12)
            self.assertTrue(any(abs(f['timestamp']-10)<.1 for f in result['frames']))
            focused=s.extract_reverse_evidence(video.name,focus=10)
            self.assertEqual(len(focused['frames']),6)
            self.assertTrue(all(f['verified'] for f in focused['frames']))

    def test_coverage_and_cuts_are_bounded_and_deterministic(self):
        times=s.reverse_evidence_times(10,400,list(range(10,400)))
        self.assertGreater(len(times),12);self.assertLessEqual(len(times),36)
        self.assertEqual(times,sorted(times));self.assertTrue(all(10<=t<400 for t in times))
        self.assertEqual(len(s.reverse_evidence_times(10,20,[float('nan'),-1,21])),12)

    def test_scan_fallback_focus_and_ranges(self):
        def describe(p,source=None):return {'kind':'video','duration':100} if str(p)=='source.mp4' else {'kind':'image','verified':True}
        def run(args,**kw):
            if 'showinfo' in ' '.join(args):raise subprocess.TimeoutExpired(args,180)
            return Mock()
        with patch.object(s,'media_path',return_value=Path('source.mp4')),patch.object(s,'describe',side_effect=describe),patch.object(s.subprocess,'run',side_effect=run):
            result=s.extract_reverse_evidence('source.mp4',10,50)
            self.assertEqual(len(result['frames']),12);self.assertIn('回退',result['notice'])
            result=s.extract_reverse_evidence('source.mp4',10,50,focus=10)
            self.assertEqual(len(result['frames']),6);self.assertTrue(all(10<=f['timestamp']<=13 for f in result['frames']))
            for focus in (-1,51,float('nan'),float('inf')):
                with self.assertRaises(ValueError):s.extract_reverse_evidence('source.mp4',10,50,focus)
            with self.assertRaises(ValueError):s.extract_reverse_evidence('source.mp4',20,10)

    def test_scene_pts_offset_for_segments(self):
        def describe(p,source=None):return {'kind':'video','duration':100} if str(p)=='source.mp4' else {'kind':'image','verified':True}
        with patch.object(s,'media_path',return_value=Path('source.mp4')),patch.object(s,'describe',side_effect=describe),patch.object(s.subprocess,'run',return_value=Mock(stderr=b'pts_time:2.5 pts_time:4.0')):
            frames=s.extract_reverse_evidence('source.mp4',30,60)['frames']
            self.assertTrue(any(f['timestamp']==32.5 for f in frames));self.assertTrue(all(30<=f['timestamp']<60 for f in frames))

if __name__=='__main__':unittest.main()
