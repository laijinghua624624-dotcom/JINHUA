import unittest
import unittest.mock
import os
import studio_server as s

class ChatSamplingTests(unittest.TestCase):
    """分任务采样：发散高温、结构化低温、校验 0；只有 director 才允许开思考。"""
    def test_default_keeps_old_behaviour(self):
        self.assertEqual(s.chat_sampling('director',{}), (0.65,False,''))
        self.assertEqual(s.chat_sampling('refine',{}), (0.65,False,''))

    def test_task_maps_to_temperature(self):
        self.assertEqual(s.chat_sampling('director',{'task':'diverge'})[0], 0.9)
        self.assertEqual(s.chat_sampling('director',{'task':'structure'})[0], 0.2)
        self.assertEqual(s.chat_sampling('director',{'task':'rewrite'})[0], 0.35)
        self.assertEqual(s.chat_sampling('director',{'task':'verify'})[0], 0.0)

    def test_unknown_task_falls_back(self):
        self.assertEqual(s.chat_sampling('director',{'task':'whatever'})[0], 0.65)

    def test_explicit_temperature_wins_and_is_clamped(self):
        self.assertEqual(s.chat_sampling('director',{'task':'diverge','temperature':0.3})[0], 0.3)
        self.assertEqual(s.chat_sampling('director',{'temperature':9})[0], 1.5)
        self.assertEqual(s.chat_sampling('director',{'temperature':-2})[0], 0.0)
        self.assertEqual(s.chat_sampling('director',{'temperature':True})[0], 0.65)

    def test_thinking_only_for_director(self):
        self.assertTrue(s.chat_sampling('director',{'thinking':True})[1])
        self.assertFalse(s.chat_sampling('refine',{'thinking':True})[1])
        self.assertFalse(s.chat_sampling('director',{})[1])

    def test_thinking_gets_wider_budget(self):
        self.assertEqual(s.chat_budget('director',False), 10000)
        self.assertEqual(s.chat_budget('director',True), 16000)
        self.assertEqual(s.chat_budget('refine',True), 4000)
        self.assertLessEqual(s.chat_budget('director',True), 16000)

class VisionRoutingTests(unittest.TestCase):
    """deepseek 文本模型看不见 image_url：带图必须有视觉路由，否则要诚实回报。"""
    def test_role_only_when_images(self):
        self.assertEqual(s.chat_vision_role({'references':['a.png']}), 'vision')
        self.assertIsNone(s.chat_vision_role({'references':[]}))
        self.assertIsNone(s.chat_vision_role({}))

    def test_no_vision_model_configured(self):
        import os
        with unittest.mock.patch.dict(os.environ,{},clear=True):
            self.assertIsNone(s.vision_model_or_none())

if __name__=='__main__':
    unittest.main()
