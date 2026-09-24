const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function studioContext(){
  const context=vm.createContext({
    console,
    db:{inspirations:[],projects:[],topics:[]},
    scope:'xinxuan',
    C:{sessionTarget:()=>6,text:value=>typeof value==='string'&&value.trim().length>0,clone:value=>JSON.parse(JSON.stringify(value))},
    save:()=>{},render:()=>{},btn:()=>'',esc:value=>String(value??''),field:()=>'',hero:()=>'',empty:()=>'',globalAssets:()=>[],profileContext:()=>({}),withJob:async(_title,_count,task)=>task(),chat:async()=>({})
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../studio-inspiration.js'),'utf8'),context);
  return context;
}

test('创意补给兼容旧方向，并把五维评分约束在1到5分',()=>{
  const context=studioContext();
  const result=JSON.parse(vm.runInContext(`JSON.stringify(supplyUpgrade({title:'旧方向',hook:'旧切入',scores:{audience:9,business:0,visual:4,feasibility:'2',novelty:null}}))`,context));
  assert.equal(result.status,'candidate');
  assert.equal(result.oneLine,'旧切入');
  assert.deepEqual(result.scores,{audience:5,business:3,visual:4,feasibility:2,novelty:3});
  assert.equal(vm.runInContext(`supplyScore(${JSON.stringify(result)})`,context),68);
});

test('同一批候选只能有一个主推，旧主推自动转为备选',async()=>{
  const context=studioContext();
  context.db.inspirations=[
    {id:'old',title:'旧主推',hook:'A',status:'primary',scores:{}},
    {id:'next',title:'新方向',hook:'B',status:'candidate',scores:{}}
  ];
  await vm.runInContext(`supplyAction('supply-status',{dataset:{id:'next',status:'primary'}})`,context);
  assert.equal(context.db.inspirations[0].status,'backup');
  assert.equal(context.db.inspirations[1].status,'primary');
  assert.equal(context.db.inspirations[1].saved,true);
});
