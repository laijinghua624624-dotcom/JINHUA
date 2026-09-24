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

test('a project in the recoverable trash is still cloud content, not an empty workspace',()=>{
  const payload=blank(),media={localId:'trash.jpg',kind:'image'};
  payload.data.projectTrash=[{project:{id:'p-trash'},topics:[{id:'t-trash'}],assets:[{id:'a-trash',files:[media]}],reverse:[{id:'r-trash'}]}];
  assert.deepEqual(Cloud.summary(payload),{projects:1,topics:1,reverse:1,references:1,media:1});
  assert.equal(Cloud.empty(payload),false);
});

test('remote revision comparison is monotonic',()=>{assert.equal(Cloud.newer(11,10),true);assert.equal(Cloud.newer(10,10),false);});

const blank=()=>({version:1,data:{version:2,projects:[],topics:[],reverse:[],assets:[]},aesthetic:[],folders:[]});
const filled=()=>({version:1,data:{version:2,projects:[{id:'p1'}],topics:[],reverse:[],assets:[]},aesthetic:[],folders:[]});

test('an empty new device automatically restores a populated cloud workspace',()=>{
  assert.equal(Cloud.syncDecision(blank(),{revision:20,payload:filled()},{}).action,'pull');
});

test('an empty device can never be chosen to overwrite populated cloud data',()=>{
  assert.equal(Cloud.syncDecision(blank(),{revision:20,payload:filled()},{paired:true,dirtyAt:'now',lastRevision:10}).action,'pull');
});

test('local-only work automatically becomes the first cloud copy',()=>{
  assert.equal(Cloud.syncDecision(filled(),null,{}).action,'push');
});

test('unpaired populated copies stop instead of guessing which one wins',()=>{
  assert.equal(Cloud.syncDecision(filled(),{revision:20,payload:filled()},{}).action,'conflict');
});

test('paired stale local changes do not overwrite a newer cloud revision',()=>{
  assert.equal(Cloud.syncDecision(filled(),{revision:20,payload:filled()},{paired:true,dirtyAt:'now',lastRevision:10}).action,'conflict');
});
