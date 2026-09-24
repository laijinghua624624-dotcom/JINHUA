import os
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import studio_server as s

class DeploymentTests(unittest.TestCase):
    def test_nonlocal_requires_protected_proxy(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(s.server_binding(), ('127.0.0.1', 8787))
            os.environ['LANCE_BIND_HOST']='0.0.0.0'
            with self.assertRaises(ValueError): s.server_binding()
            os.environ['LANCE_PUBLIC_ORIGIN']='https://studio.example.com'
            with self.assertRaises(ValueError): s.server_binding()
            os.environ['LANCE_TRUSTED_PROXY']='1'
            self.assertEqual(s.server_binding(), ('0.0.0.0', 8787))
            for invalid in ['http://studio.example.com', 'https://user:pass@example.com', 'https://example.com/path']:
                os.environ['LANCE_PUBLIC_ORIGIN']=invalid
                with self.assertRaises(ValueError): s.server_binding()

    def test_render_runtime_uses_https_url_and_explicit_internal_port(self):
        env={'RENDER_EXTERNAL_URL':'https://lance-content-studio.onrender.com','LANCE_BIND_HOST':'0.0.0.0','LANCE_TRUSTED_PROXY':'1','LANCE_PORT':'8000','PORT':'10000'}
        with patch.dict(os.environ,env,clear=True):
            self.assertEqual(s.server_binding(),('0.0.0.0',8000))

    def test_public_service_accepts_only_its_own_and_owner_pages_origins(self):
        handler=object.__new__(s.Handler)
        handler.server=SimpleNamespace(server_port=8000)
        with patch.dict(os.environ,{'LANCE_PUBLIC_ORIGIN':'https://lance-content-studio.onrender.com'},clear=True):
            handler.headers={'Host':'lance-content-studio.onrender.com','Origin':'https://laijinghua624624-dotcom.github.io'}
            self.assertTrue(handler.allowed())
            handler.headers={'Host':'lance-content-studio.onrender.com','Origin':'https://evil.example.com'}
            self.assertFalse(handler.allowed())
