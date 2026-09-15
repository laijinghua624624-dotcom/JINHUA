const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const F=require('../studio-folders'),A=require('../studio-aesthetic');
function harness(){
  const storage=new Map(),inputs={},cards=[];let serial=0,shared=[{...A.entry('隧道光路'),id:'a',folderIds:['older'],notes:'喜欢光线，不是要照搬布景'},{...A.entry('海边'),id:'b',folderIds:[]}];
  const c={StudioFolders:F,A,C:{uid:()=> 'new-'+(++serial),selected:()=>null},scope:'xinxuan',
    db:{projects:[{id:'p',title:'双十一',folderIds:['older']}],topics:[{id:'t',title:'单片'}],assets:[{id:'s',name:'原场地',kind:'scene',dimensions:'6米',files:[],folderIds:[]}]},
    route:{view:'project',id:'p'},aestheticQuery:{},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},ensureScopedLibraries(){},folderStoreKey:()=> 'lance_studio_folders_xinxuan',
    document:{addEventListener(){},querySelectorAll:s=>s==='[data-folder-pick]'?cards:s==='[name="folder-member"]:checked'?(inputs.checked||[]):[]},
    $:s=>inputs[s],globalAssets:()=>structuredClone(shared),saveAesthetic:x=>{shared=x;},
    save(){},close(){},render(){},notify(){},esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    btn:(l,a,e)=>'<button '+e+'>'+l+'</button>',aestheticCover:()=>'<img alt="fixture">',dialog:(title,body,actions)=>{c.dialogResult={title,body,actions};}
  };
  vm.createContext(c);vm.runInContext(fs.readFileSync(require.resolve('../studio-folders-ui.js'),'utf8'),c);
  return {c,inputs,cards,getShared:()=>shared};
}
test('项目内新建可从完整总库挑选，自动关联且不搬走素材，取消不会写入',async()=>{
  const {c,inputs,getShared}=harness(),before=JSON.stringify(c.db);
  await c.folderAction('folder-new',{dataset:{ownerKind:'project',ownerId:'p'}});
  assert.equal(JSON.stringify(c.db),before);
  assert.match(c.dialogResult.body,/隧道光路/);assert.match(c.dialogResult.body,/海边/);assert.match(c.dialogResult.body,/原场地/);
  assert.match(c.dialogResult.actions,/data-owner-id="p"/);
  inputs['#folder-name']={value:'双十一我冠是军'};inputs['#folder-description']={value:'只参考光路与节奏'};
  inputs.checked=[{value:'aesthetic:a'},{value:'asset:s'}];
  await c.folderAction('folder-save',{dataset:{ownerKind:'project',ownerId:'p'}});
  assert.equal(c.route.view,'project');assert.equal(c.db.projects[0].folderIds.join(','),'older,new-1');
  assert.equal(getShared().length,2);assert.equal(getShared()[0].notes,'喜欢光线，不是要照搬布景');assert.equal(getShared()[0].folderIds.join(','),'older,new-1');
  assert.equal(c.db.assets[0].dimensions,'6米');assert.equal(c.db.assets[0].folderIds[0],'new-1');
  assert.equal(c.referenceFolders()[0].description,'只参考光路与节奏');
  inputs.checked=[];await c.folderAction('folder-save',{dataset:{id:'new-1'}});
  assert.equal(getShared().length,2);assert.equal(getShared()[0].folderIds.join(','),'older');
  assert.equal(c.db.assets.length,1);assert.equal(c.db.assets[0].folderIds.length,0);
});
test('单片深化中创建保留所在页面，重复名称不会创建或关联',async()=>{
  const {c,inputs}=harness();c.route={view:'topic',id:'t',tab:'deep'};
  inputs['#folder-name']={value:'单片参考'};inputs['#folder-description']={value:''};inputs.checked=[];
  await c.folderAction('folder-save',{dataset:{ownerKind:'topic',ownerId:'t'}});
  assert.equal(c.db.topics[0].folderIds[0],'new-1');assert.equal(c.route.tab,'deep');
  await assert.rejects(c.folderAction('folder-save',{dataset:{ownerKind:'project',ownerId:'p'}}),/同名/);
  assert.equal(c.referenceFolders().length,1);assert.equal(c.db.projects[0].folderIds.join(','),'older');
});
test('关键词、分类与收藏筛选保留被隐藏的勾选并更新计数',()=>{
  const {c,inputs,cards}=harness(),selected={checked:true};
  cards.push({dataset:{name:'隧道',category:'摄影',tags:'逆光',notes:'金色',link:'',favorite:'true'},querySelector:()=>selected},
    {dataset:{name:'海边',category:'美术',tags:'蓝色',notes:'',link:'',favorite:'false'},querySelector:()=>({checked:false})});
  inputs['#folder-picker-search']={value:'海边'};inputs['#folder-picker-category']={value:''};inputs['#folder-picker-favorite']={checked:false};
  inputs['#folder-picker-count']={};inputs['#folder-picker-empty']={};
  c.updateFolderPicker();assert.equal(cards[0].hidden,true);assert.equal(selected.checked,true);assert.match(inputs['#folder-picker-count'].textContent,/已选 1 项 · 当前显示 1/);
  inputs['#folder-picker-search'].value='隧道 逆光';inputs['#folder-picker-category'].value='摄影';inputs['#folder-picker-favorite'].checked=true;
  c.updateFolderPicker();assert.equal(cards[0].hidden,false);assert.equal(cards[1].hidden,true);
  inputs['#folder-picker-category'].value='美术';c.updateFolderPicker();assert.equal(inputs['#folder-picker-empty'].hidden,false);
});
