const {test}=require('node:test');
const assert=require('node:assert/strict');
const Capture=require('../studio-capture');

test('快速收藏会从一句直觉中自动给出初始分类',()=>{
  assert.equal(Capture.heuristic('喜欢舞台大屏与追光形成的空间层次','https://example.com').category,'舞台声光电');
  assert.equal(Capture.heuristic('这个推进运镜很有力量','https://frameset.app/search').category,'运镜参考');
  assert.equal(Capture.heuristic('喜欢人物服装的色块关系','https://pinterest.com/pin/1').category,'服装造型');
});

test('收藏助手只传当前来源、标题和用户选中文字',()=>{
  const code=Capture.bookmarklet();
  assert.match(code,/location\.href/);assert.match(code,/og:title/);assert.match(code,/og:image/);assert.match(code,/video\[poster\]/);assert.match(code,/capturePreview/);assert.match(code,/getSelection/);assert.match(code,/lance-content-studio\.onrender\.com/);
  assert.doesNotMatch(code,/password|cookie|localStorage/i);
});

test('只有AI需要读取媒体时才提示补原文件',()=>{
  assert.match(Capture.mediaAdvice('video',false),/视频反推/);
  assert.match(Capture.mediaAdvice('audio',false),/转写/);
  assert.match(Capture.mediaAdvice('webpage',false),/之后要让AI读取/);
});
