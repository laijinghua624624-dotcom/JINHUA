const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const C=require('../studio-core'),WC=require('../studio-workspace-cloud'),A=require('../studio-aesthetic'),Capture=require('../studio-capture');
const blank=()=>({version:1,data:{version:2,topics:[],projects:[],assets:[],reverse:[],fragments:[],exports:[]},aesthetic:[],folders:[],trash:[],usage:''});

function appHarness(){
  const store=new Map(),rows=new Map(),calls={puts:0,renders:0},doc={querySelector:()=>null,addEventListener(){},activeElement:null};
  const ctx={StudioCore:C,StudioReverse:{},StudioWorkspaceCloud:WC,URL,URLSearchParams,Date,console,crypto:{randomUUID:()=> 'fixture-device'},
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:doc,window:{addEventListener(){}},location:{hostname:'localhost',protocol:'http:',search:''},
    setTimeout:()=>1,clearTimeout(){},setInterval(){},fragmentRecording:false,fragmentPending:false,fetch:async()=>({ok:true,blob:async()=>new Blob(['image'])}),Blob,
    StudioCloud:{session:async()=>({user:{id:'fixture'}}),getWorkbench:async space=>structuredClone(rows.get(space)||null),signedWorkbenchMedia:async()=> 'https://example.test/signed',uploadWorkbenchMedia:async(space,id)=>space+'/'+id,backupWorkbench:async()=>{},putWorkbench:async(space,payload,revision)=>{calls.puts++;const row={workspace:space,payload,revision};rows.set(space,structuredClone(row));return row;}}
  };
  vm.createContext(ctx);const source=fs.readFileSync(require.resolve('../studio.js'),'utf8');
  vm.runInContext(source.slice(0,source.lastIndexOf('\ntry{\n  db=read(scope)')),ctx);
  ctx.fixture=blank().data;ctx.calls=calls;
  vm.runInContext("db=fixture;workspaceReady=true;upgradeReverse=x=>x;render=()=>calls.renders++;notify=()=>{};cloudState.session={user:{id:'fixture'}};",ctx);
  return {ctx,store,rows,calls,run:code=>vm.runInContext(code,ctx)};
}

test('sync display never treats fetched remote data or a previous success as current success',()=>{
  const meta={paired:true,lastSyncedAt:new Date().toISOString()};
  assert.equal(WC.presentation({session:{},status:'正在核对云端'},meta).tone,'pending');
  assert.equal(WC.presentation({session:{},status:'云端已同步',error:'素材缺失'},meta).tone,'warn');
  assert.equal(WC.presentation({session:{},status:'云端已同步'},{...meta,dirtyAt:'new edit'}).tone,'pending');
  assert.equal(WC.presentation({session:{},status:'云端已同步'},meta).tone,'ok');
  assert.notEqual(WC.presentation({session:null,status:'云端已同步'},meta).tone,'ok');
});

test('notes, recoverable trash, exports and folders are content, not empty workspaces',()=>{
  for(const apply of [p=>p.data.fragments.push({text:'idea'}),p=>p.data.exports.push({id:'ppt'}),p=>p.trash.push({id:'r'}),p=>p.folders.push({id:'f'}),p=>p.data.preferences='my style']){const p=blank();apply(p);assert.equal(WC.empty(p),false);}
});

test('upload keeps edits made during transfer and retains live generation objects',async()=>{
  const h=appHarness();h.run("db.topics=[{id:'t',title:'before'}];setCloudMeta({paired:true,dirtyAt:'now'});originalTopic=db.topics[0];");
  let edited=false;
  h.ctx.StudioCloud.backupWorkbench=async()=>{if(!edited){edited=true;h.run("db.topics[0].title='edited while uploading';save();");}};
  await h.run('uploadWorkspace()');
  assert.equal(h.rows.get('xinxuan').payload.data.topics[0].title,'before');
  assert.equal(h.run('db.topics[0]===originalTopic'),true);
  assert.equal(h.run('db.topics[0].title'),'edited while uploading');
  assert.ok(h.run('cloudMeta().dirtyAt'));
  await h.run('uploadWorkspace()');
  assert.equal(h.rows.get('xinxuan').payload.data.topics[0].title,'edited while uploading');
  assert.equal(h.run('cloudMeta().dirtyAt'),null);
});

test('a remote revision change during upload stops the write',async()=>{
  const h=appHarness(),payload=blank();payload.data.topics.push({id:'t',title:'initial'});
  h.rows.set('xinxuan',{workspace:'xinxuan',revision:10,payload});
  h.run("db.topics=[{id:'t',title:'local'}];setCloudMeta({paired:true,lastRevision:10,dirtyAt:'now'});");
  h.ctx.StudioCloud.backupWorkbench=async()=>{h.rows.get('xinxuan').revision=11;};
  await assert.rejects(h.run('uploadWorkspace()'),/另一台设备/);assert.equal(h.calls.puts,0);assert.equal(h.run('db.topics[0].title'),'local');
});

test('restore defers when new local edits happen during media signing',async()=>{
  const h=appHarness(),payload=blank();payload.data.topics=[{id:'cloud',title:'cloud'}];payload.aesthetic=[{files:[{localId:'a.jpg',kind:'image',cloudPath:'saved/a.jpg'}]}];
  h.ctx.row={revision:20,payload};h.ctx.StudioCloud.signedWorkbenchMedia=async()=>{h.run("db.topics.push({id:'new',title:'just typed'});save();");return 'https://example.test/image';};
  await assert.rejects(h.run('restoreWorkspaceRow(scope,row)'),e=>e.code==='SYNC_EDITING');assert.equal(h.run('db.topics[0].title'),'just typed');
});

test('refreshing the sync panel preserves actionable errors and cloud read failures never trigger uploads',async()=>{
  const h=appHarness();h.run("cloudState.error='素材缺失，未上传';");
  await h.run('refreshCloudState()');assert.equal(h.run('cloudState.error'),'素材缺失，未上传');
  h.ctx.StudioCloud.getWorkbench=async()=>{throw Error('network offline');};
  await h.run('runWorkbenchSync()');assert.equal(h.calls.puts,0);assert.match(h.run('cloudState.error'),/网络/);
});

test('status-only changes do not re-render the editor or dialog',()=>{
  const h=appHarness();h.run('refreshSyncUI();save();');assert.equal(h.calls.renders,0);
});

test('missing media blocks synchronization without clearing pending changes',async()=>{
  const h=appHarness();h.run("db.assets=[{files:[{kind:'video',localId:'missing.mp4'}]}];setCloudMeta({paired:true,dirtyAt:'now'});");h.ctx.fetch=async()=>({ok:false});
  await h.run('runWorkbenchSync()');assert.equal(h.calls.puts,0);assert.ok(h.run('cloudMeta().dirtyAt'));assert.match(h.run('cloudState.error'),/本机无法读取/);
});

test('metadata supplements a placeholder title but preserves custom notes, requirements and edits',()=>{
  const record={name:'链接收藏',link:'https://example.test/work',notes:'我后来补的具体判断',requirements:'我的拍摄要求',category:'自定义',tags:['自己的标签']};
  Capture.applyMetadata(record,{title:'Original official title',description:'Source description',previewImage:'https://example.test/cover.jpg'},'',{category:'摄影参考'});
  assert.equal(record.name,'Original official title');assert.match(record.notes,/我后来补的具体判断/);assert.equal(record.requirements,'我的拍摄要求');assert.equal(record.category,'自定义');assert.ok(record.tags.includes('自己的标签'));
  Capture.applyMetadata(record,null,'network failure');assert.equal(record.name,'Original official title');assert.ok(record.externalPreview);assert.match(record.captureError,/暂时读取失败/);
});

test('default reference list retains text-only records and shows newly saved links first',()=>{
  const old={id:'image',createdAt:'2026-01-01',files:[{kind:'image'}]},recent={id:'text',createdAt:'2026-09-28',files:[]};
  assert.deepEqual(A.browseItems([old,recent]).map(x=>x.id),['text','image']);assert.deepEqual(A.browseItems([old,recent],'visual').map(x=>x.id),['image']);assert.deepEqual(A.browseItems([old,recent],'text').map(x=>x.id),['text']);
});

test('project landing includes standalone work and report export is not gated by a 25-shot film',()=>{
  const h=appHarness();h.run("simpleTopicCard=t=>'<article>'+t.title+'</article>';isPersonalProject=()=>false;db.topics=[{id:'t',title:'A single idea',idea:''}];");
  assert.match(h.run('renderProjectsHub()'),/A single idea/);
  h.ctx.testTopic=C.topic('Direction');for(const [key]of C.QUICK)h.ctx.testTopic.quick.fields[key]='Ready';
  const html=h.run('workflowSteps(testTopic,1)');assert.match(html,/data-step="4"\s+class=/);assert.match(html,/单条汇报/);
});

test('an in-flight link import stays in its original workspace and deduplicates retries',async()=>{
  const libs={xinxuan:[{id:'same',name:'链接收藏',link:'https://example.test/one',notes:'工作笔记',files:[],tags:[]}],personal:[{id:'same',name:'个人收藏',link:'https://example.test/two',notes:'不要动',files:[],tags:[]}]};
  let finish,calls=0;const ctx={scope:'xinxuan',URL,Date,console,route:{view:'home'},document:{activeElement:null},$:()=>null,render(){},notify(){},aestheticStoreKey:x=>x,
    localStorage:{getItem:x=>JSON.stringify(libs[x])},globalAssets:()=>structuredClone(libs[ctx.scope]),saveAesthetic:(items,space)=>{libs[space]=items;},api:()=>{calls++;return new Promise(resolve=>finish=resolve);}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../studio-capture.js'),'utf8'),ctx);
  const first=ctx.StudioCapture.enrich('same'),second=ctx.StudioCapture.enrich('same');assert.equal(first,second);assert.equal(calls,1);
  ctx.scope='personal';finish({title:'原作品名',previewImage:'https://example.test/one.jpg'});await first;
  assert.equal(libs.xinxuan[0].name,'原作品名');assert.equal(libs.xinxuan[0].notes,'工作笔记');assert.equal(libs.personal[0].name,'个人收藏');assert.equal(libs.personal[0].notes,'不要动');
});

test('deleting a card while metadata loads does not recreate it',async()=>{
  let entries=[{id:'one',link:'https://example.test',files:[],tags:[]}],finish;
  const ctx={scope:'xinxuan',URL,Date,route:{view:'home'},document:{activeElement:null},$:()=>null,render(){},notify(){},globalAssets:()=>structuredClone(entries),saveAesthetic:items=>entries=items,api:()=>new Promise(resolve=>finish=resolve)};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../studio-capture.js'),'utf8'),ctx);
  const task=ctx.StudioCapture.enrich('one');entries=[];finish({title:'Too late'});await task;assert.equal(entries.length,0);
});

test('download recovery points to the correct source and export format',()=>{
  const h=appHarness();h.run("db.topics=[{id:'t',title:'Single'}];db.projects=[{id:'p',title:'Project'}];");
  assert.match(h.run("archiveSourceButton({sourceId:'t',mode:'decision'})"),/data-kind="topic" data-mode="decision"/);
  assert.match(h.run("archiveSourceButton({sourceId:'p',mode:'overview-pdf'})"),/data-action="project-pdf"/);
  assert.equal(h.run("archiveSourceButton({sourceId:'missing'})"),'');
});
