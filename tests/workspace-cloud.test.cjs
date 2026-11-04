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

test('a deliberate clean reset is still a paired cloud version, not an unknown empty device',()=>{
  const reset=blank();reset.data.cleanResetAt='2026-09-28T20:00:00.000Z';
  assert.equal(Cloud.summary(reset).projects,0);
  assert.equal(Cloud.empty(reset),false);
  assert.equal(Cloud.syncDecision(filled(),{revision:20,payload:reset},{paired:true,lastRevision:10}).action,'pull');
});

test('coverage counts cloud media and reports the missing ones',()=>{
  const uploaded={localId:'a.jpg',kind:'image',cloudPath:'user/xinxuan/a.jpg',cloudSize:1200};
  const missing={localId:'b.jpg',kind:'image'};
  const payload={version:1,data:{version:2,projects:[],topics:[],reverse:[],assets:[{files:[uploaded,missing]}]},aesthetic:[],folders:[]};
  assert.deepEqual(Cloud.coverage(payload),{uploaded:1,verified:1,missing:1,total:2});
});

test('transport metadata never changes the content stamp',()=>{
  const bare={version:1,data:{version:2,projects:[],topics:[],reverse:[],assets:[{files:[{localId:'a.jpg',kind:'image'}]}]},aesthetic:[],folders:[]};
  const stamped=JSON.parse(JSON.stringify(bare));
  Object.assign(stamped.data.assets[0].files[0],{cloudPath:'u/a.jpg',cloudUrl:'https://signed',cloudSyncedAt:'now',cloudSize:1024,cloudSha256:'abc',cloudVerifiedAt:'now'});
  assert.equal(Cloud.contentStamp(bare),Cloud.contentStamp(stamped));
});

test('a read-only dialog does not block automatic restore',()=>{
  assert.equal(Cloud.restoreBlocked({dialogOpen:true,dialogHasInput:false,editing:false}),false);
  assert.equal(Cloud.restoreBlocked({dialogOpen:true,dialogHasInput:true,editing:false}),true);
  assert.equal(Cloud.restoreBlocked({dialogOpen:false,dialogHasInput:false,editing:true}),true);
  assert.equal(Cloud.restoreBlocked({dialogOpen:false,dialogHasInput:false,editing:false}),false);
});

test('presentation never reports "checking" once ready',()=>{
  const ready=Cloud.presentation({session:{},phase:'ready',error:''},{paired:true,lastSyncedAt:'2026-11-05T01:12:00.000Z',dirtyAt:null});
  assert.equal(ready.tone,'ok');
  assert.equal(ready.label,'已同步至云端');
  assert.ok(!ready.label.includes('正在核对云端'));
});

test('every sync phase has a human readable label',()=>{
  for(const phase of ['signedout','checking','pulling','pushing','waiting','offline','conflict','error','ready','dirty','pull-needed','working']){
    const state={session:phase==='signedout'?null:{},phase,error:phase==='error'?'boom':'',progress:{done:12,total:278}};
    const view=Cloud.presentation(state,{});
    assert.equal(typeof view.label,'string');
    assert.ok(view.label.length>0,phase);
  }
});

test('presentation shows restore progress counts',()=>{
  const view=Cloud.presentation({session:{},phase:'pulling',error:'',progress:{done:12,total:278}},{});
  assert.match(view.label,/12\/278/);
  assert.equal(view.tone,'pending');
});

test('presentation prefers conflict wording over a generic error',()=>{
  const view=Cloud.presentation({session:{},phase:'conflict',error:'本机与云端都有新修改'},{});
  assert.equal(view.label,'需要选择保留版本');
});
