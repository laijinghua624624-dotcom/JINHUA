"""Ingest parser tests (no network)."""
import unittest
import studio_ingest

RSS = '''<?xml version="1.0"?><rss version="2.0"><channel><title>案例站</title>
<item><title>雨夜霓虹</title><link>https://example.com/a</link>
<description><![CDATA[<p>构图参考</p><img src="https://example.com/a.jpg">]]></description></item>
</channel></rss>'''

ATOM = '''<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>参考</title>
<entry><title>舞台光</title><link rel="alternate" href="https://example.com/b"/>
<summary>逆光</summary></entry></feed>'''


class IngestTest(unittest.TestCase):
    def test_rss_item(self):
        items = studio_ingest.feed_items(RSS, 'https://example.com/feed.xml')
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['title'], '雨夜霓虹')
        self.assertEqual(items[0]['url'], 'https://example.com/a')
        self.assertIn('构图参考', items[0]['body'])
        self.assertEqual(items[0]['cover'], 'https://example.com/a.jpg')

    def test_atom_item(self):
        items = studio_ingest.feed_items(ATOM, 'https://example.com/feed.xml')
        self.assertEqual(items[0]['url'], 'https://example.com/b')
        self.assertEqual(items[0]['title'], '舞台光')


if __name__ == '__main__':
    unittest.main()
