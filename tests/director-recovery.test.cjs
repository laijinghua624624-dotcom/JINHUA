const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../studio-director'),R=require('../studio-reverse');
function setup(reply){
  const r=R.create('恢复测试');r.frames=[{localId:'frame.jpg',timestamp:1}];
  r.directorEvidence={key:D.fingerprint(r),parts:[{id:'frame.jpg',shots:[{frameIndex:0,visual:'已有画面分析'}]}]};
  let calls=0,saves=0;
  const context=vm.createContext({StudioDirector:D,document:{addEventListener(){}},stop:false,job:null,
    ensureService:async()=>{},withJob:async(title,count,fn)=>fn(),
    api:async(path,body)=>{calls++;assert.equal(path,'chat');assert.equal(body.references.length,0);return {text:reply};},
    save:()=>saves++,recordTextUsage:()=>{},progress:()=>{},notify:()=>{},render:()=>{}});
  vm.runInContext(fs.readFileSync(require.resolve('../studio-director-ui'),'utf8'),context);
  return {r,context,calls:()=>calls,saves:()=>saves};
}
function valid(){return {summary:'测试主线',relationships:'人物关系待确认',concept:'测试手法',questions:'声音未核对',beats:Array.from({length:21},()=>({title:'段落',claim:'可见画面',basis:'inferred',frameIndices:[0]}))};}
test('续整只请求一次文字AI、不重做画面分析，并解锁确认',async()=>{const x=setup(JSON.stringify(valid()));await x.context.directorAction('reverse-director-retry',{},x.r);assert.equal(x.calls(),1);assert.ok(D.current(x.r));assert.equal(x.r.director.overview.beats.length,21);assert.ok(x.r.directorResponses.overview.applied);assert.ok(x.saves()>0);});
test('真实解析失败路径先保存原文和错误，不自动循环收费',async()=>{const x=setup('{incomplete');await assert.rejects(x.context.directorAction('reverse-director-retry',{},x.r),/原始回答已保存/);assert.equal(x.calls(),1);assert.equal(x.r.directorResponses.overview.raw,'{incomplete');assert.match(x.r.error,/完整JSON/);assert.ok(D.cachedEvidence(x.r));});
test('本地重新校验不发请求，资料变化不复用旧画面',async()=>{const x=setup('unused');D.rememberResponse(x.r,'overview',JSON.stringify({overview:valid()}),D.fingerprint(x.r));await x.context.directorAction('reverse-director-recover',{dataset:{stage:'overview'}},x.r);assert.equal(x.calls(),0);assert.ok(D.current(x.r));x.r.notes='已变';await assert.rejects(x.context.directorAction('reverse-director-retry',{},x.r),/资料已变化/);assert.equal(x.calls(),0);});
test('用户停止时仍保存返回原文，但不替换故事理解',async()=>{const x=setup(JSON.stringify(valid()));x.context.stop=true;await x.context.directorResponse(x.r,'overview','test',D.fingerprint(x.r));assert.ok(x.r.directorResponses.overview.raw);assert.equal(D.current(x.r),false);assert.equal(x.r.directorResponses.overview.applied,false);});
test('只补缺失章节发一次纯文字请求，合并原有页且可导出',async()=>{
 const page={title:'已有页',section:'story',basis:'inferred',points:['画面判断'],notes:'依据待核对',frameIndices:[0]};
 const extra={pages:Object.keys(D.SECTIONS).filter(k=>k!=='story').map(section=>({...page,section,title:'补充'+section,basis:'proposal',frameIndices:[]})),review:'补充说明'};
 const x=setup(JSON.stringify(extra));D.acceptOverview(x.r,valid(),D.fingerprint(x.r));D.confirm(x.r);D.rememberResponse(x.r,'report',JSON.stringify({pages:Array.from({length:8},()=>({...page})),review:'原稿边界'}),D.confirmationKey(x.r));
 await x.context.directorAction('reverse-director-supplement',{},x.r);assert.equal(x.calls(),1);assert.ok(D.reportReady(x.r));assert.equal(x.r.director.report.pages.length,12);assert.equal(x.r.director.report.pages[0].title,'已有页');
});
test('完整缓存时报告进度只计1步，不出现4/1',async()=>{
 const reply={pages:Array.from({length:8},(_,i)=>({title:'页'+i,section:Object.keys(D.SECTIONS)[i%5],basis:'inferred',points:['要点'],notes:'讲稿',frameIndices:[0]})),review:'待核对'};
 const x=setup(JSON.stringify(reply));D.acceptOverview(x.r,valid(),D.fingerprint(x.r));D.confirm(x.r);let total,progress=0;x.context.withJob=async(t,n,fn)=>{total=n;return fn();};x.context.progress=()=>progress++;
 await x.context.directorAction('reverse-director-report',{},x.r);assert.equal(total,1);assert.equal(progress,1);assert.equal(x.calls(),1);
});
