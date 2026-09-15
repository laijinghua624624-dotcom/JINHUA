import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import studio_server as s

class ModelRoutesTests(unittest.TestCase):
    def test_routes_and_secrets(self):
        with patch.dict(os.environ,{'ARK_DIRECTOR_MODEL':'director-test','ARK_REFINE_MODEL':'turbo-test','ARK_API_KEY':'private-test-value'},clear=True):
            self.assertEqual(s.route_model('director'),'director-test')
            self.assertEqual(s.route_model('refine'),'turbo-test')
            with self.assertRaises(ValueError):s.route_model('embedding')
            self.assertNotIn('private-test-value',json.dumps(s.model_routes()))
            self.assertNotIn('private-test-value',s.safe_error('failed private-test-value'))
            self.assertNotIn('secret=123',s.safe_error('failed https://example.com/?secret=123'))

    def test_speech_auth_is_separate_and_no_credentials_in_results(self):
        with patch.dict(os.environ,{'ARK_API_KEY':'ark-only'},clear=True):
            with self.assertRaises(ValueError):s.speech_headers()
        with patch.dict(os.environ,{'SPEECH_API_KEY':'speech-test'},clear=True):
            headers=s.speech_headers();self.assertEqual(headers['X-Api-Key'],'speech-test')
            self.assertEqual(headers['X-Api-Resource-Id'],'volc.bigasr.auc_turbo')
            self.assertNotIn('X-Api-Access-Key',headers)

    def test_semantic_cache_separates_scopes_and_invalidates_content_and_model(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(s,'DATA',Path(folder)),patch.dict(os.environ,{'ARK_EMBEDDING_MODEL':'embed-test','ARK_API_KEY':'test'},clear=True),patch.object(s,'ark_request',return_value={'data':{'embedding':[3.,4.]}}) as call:
            self.assertEqual(s.cached_embedding('personal','暖光'),[.6,.8]);self.assertEqual(call.call_count,1)
            s.cached_embedding('personal','暖光');self.assertEqual(call.call_count,1)
            s.cached_embedding('xinxuan','暖光');self.assertEqual(call.call_count,2)
            s.cached_embedding('personal','冷光');self.assertEqual(call.call_count,3)
            with patch.dict(os.environ,{'ARK_EMBEDDING_MODEL':'embed-new'}):s.cached_embedding('personal','暖光')
            self.assertEqual(call.call_count,4)
            result=s.semantic_search({'scope':'personal','query':'暖光','items':[{'id':'p1','text':'暖光'}]})
            self.assertEqual(result['matches'][0]['id'],'p1');self.assertEqual(result['scope'],'personal')
            with self.assertRaises(ValueError):s.semantic_search({'scope':'../work','query':'暖光','items':[]})
            with self.assertRaises(ValueError):s.semantic_search({'scope':'personal','query':'','items':[]})

    def test_invalid_embedding_fails_without_cached_success(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(s,'DATA',Path(folder)),patch.dict(os.environ,{'ARK_EMBEDDING_MODEL':'test'},clear=True):
            for raw in [None,[],[0,0],[float('nan'),1]]:
                with patch.object(s,'ark_request',return_value={'data':{'embedding':raw}}),self.assertRaises(ValueError):s.cached_embedding('personal','test')
            self.assertEqual(list(Path(folder).rglob('*.json')),[])

if __name__=='__main__':unittest.main()
