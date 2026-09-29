const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const RC=require('../studio-reverse-case'),C=require('../studio-core');
function environment(){
  const p=RC.create('隔离项目'),clips=RC.makeClips(p,{kind:'video',localId:'clip.mp4',duration:1200},'signature');
  clips.forEach(c=>{c.caseFrames=[1,2,3].map(n=>({kind:'image',localId:'f'+n,verified:true,timestamp:c.segment.start+n}));});
  const calls=[],ctx={StudioReverseCase:RC,C,db:{reverse:[p,...clips]},stop:false,job:null,flushPendingFieldSave(){},save(){},progress(){},
    chat:async(prompt,refs,purpose)=>{calls.push({refs,purpose});return Object.fromEntries(Object.keys(refs.length?RC.CLIP_LABELS:RC.LABELS).map(k=>[k,'mock '+k]));},
    withJob:async(title,total,fn)=>{ctx.job={ownerIds:[]};try{await fn();}finally{ctx.job=null;}},
  };vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../studio-reverse-case-ui.js'),'utf8'),ctx);return {p,clips,ctx,calls};
}
test('概览重试只调用未完成单条，汇总失败不会丢已付费结果',async()=>{const {ctx,p,clips,calls}=environment(),original=ctx.chat;ctx.chat=async(...args)=>{if(args[1].length===0)throw Error('模拟汇总失败');return original(...args);};await assert.rejects(()=>ctx.reverseCaseAnalyze(p),/模拟汇总失败/);assert.ok(clips.every(RC.clipReady));assert.equal(calls.length,2);ctx.chat=original;await ctx.reverseCaseAnalyze(p);assert.equal(calls.length,3);assert.equal(calls[2].refs.length,0);assert.equal(RC.status(p,clips).ready,true);});
test('生成中修改说明，不覆盖新输入，也不接受基于旧输入的概览',async()=>{const {ctx,p,clips}=environment(),original=ctx.chat;let first=true;ctx.chat=async(...args)=>{if(first){first=false;clips[0].notes='用户的新说明';}return original(...args);};await ctx.reverseCaseAnalyze(p);assert.equal(clips[0].notes,'用户的新说明');assert.equal(clips[0].caseSummary,null);assert.match(clips[0].caseError,/资料已修改/);assert.equal(RC.status(p,clips).pending,1);});
test('停止保留本次已完成单条，下一次接着未完成条目',async()=>{const {ctx,p,clips,calls}=environment(),original=ctx.chat;ctx.chat=async(...args)=>{const result=await original(...args);ctx.stop=true;return result;};await ctx.reverseCaseAnalyze(p);assert.equal(calls.length,1);assert.ok(RC.clipReady(clips[0]));assert.equal(p.overview,null);ctx.stop=false;ctx.chat=original;await ctx.reverseCaseAnalyze(p);assert.equal(calls.length,3);assert.equal(RC.status(p,clips).ready,true);});
