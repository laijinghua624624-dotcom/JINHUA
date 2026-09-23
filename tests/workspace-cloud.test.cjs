const test=require('node:test');
const assert=require('node:assert/strict');
const Cloud=require('../studio-workspace-cloud.js');

test('workspace summary counts reverse records and deduplicates copied media',()=>{
  const media={localId:'a.jpg',kind:'image'},payload={version:1,data:{version:2,projects:[{}],topics:[{}],reverse:[{},{}],assets:[{files:[media]}]},aesthetic:[{files:[{...media}]}],folders:[]};
  assert.deepEqual(Cloud.summary(payload),{projects:1,topics:1,reverse:2,references:2,media:1});
  assert.equal(Cloud.empty(payload),false);assert.equal(Cloud.valid(payload),true);
});

test('cloud path is written to every reference of the same local media',()=>{
  const first={localId:'same.mp4',kind:'video'},second={localId:'same.mp4',kind:'video'},groups=Cloud.mediaGroups({first},{second});
  Cloud.setCloudInfo(groups,'same.mp4','user/personal/same.mp4','https://signed');
  assert.equal(first.cloudPath,second.cloudPath);assert.equal(second.cloudUrl,'https://signed');
});

test('remote revision comparison is monotonic',()=>{assert.equal(Cloud.newer(11,10),true);assert.equal(Cloud.newer(10,10),false);});
