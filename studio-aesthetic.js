(function(root,factory){if(typeof module==='object')module.exports=factory(require('./studio-core'));else root.StudioAesthetic=factory(root.StudioCore);})(globalThis,function(C){
  'use strict';
  const CATEGORIES=['AI参考','摄影参考','美术参考','舞台声光电','分镜参考','灯光设计','运镜参考','调色参考','服装造型','广告TVC','电影参考','秀场参考','音效配乐','其他'];
  function link(value){const text=String(value||'').trim();if(!text)return '';const match=text.match(/https?:\/\/[^\s<>"'，。；、【】「」]+/i);if(!match)throw Error('请填写http或https链接，也可粘贴含链接的分享文字');let candidate=match[0].replace(/[)\]）!！?？,;]+$/,'');let url;try{url=new URL(candidate);}catch{throw Error('链接格式不正确');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('不支持此链接格式或带账号密码的链接');return url.href;}
  const tags=value=>[...new Set((Array.isArray(value)?value:String(value||'').split(/[,，\n]/)).map(x=>String(x).trim()).filter(Boolean))];
  function entry(name='未命名参考'){return {id:C.uid(),name,kind:'aesthetic',category:'摄影参考',tags:[],notes:'',requirements:'',link:'',sourceSite:'',sourceUsage:'unconfirmed',files:[],coverId:null,favorite:false,usedIn:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
  function normalize(a){return {...entry(a.name||a.title||'未命名参考'),...a,kind:'aesthetic',name:a.name||a.title||'未命名参考',category:a.category||a.type||'其他',tags:tags(a.tags),notes:a.notes??a.requirements??a.note??'',files:Array.isArray(a.files)?a.files:[],usedIn:Array.isArray(a.usedIn)?a.usedIn:[]};}
  function migrate(current,old){if(!Array.isArray(current)||!Array.isArray(old))throw Error('审美库数据格式异常，原始数据已保留');const out=current.map(normalize);for(const item of old){if(!item||item.id==null||out.some(a=>a.legacyVisualId===String(item.id)))continue;const a=normalize({...entry(item.title),category:item.type||'其他',tags:item.tags,notes:item.note||item.description||'',createdAt:item.createdAt||new Date().toISOString()});a.legacyVisualId=String(item.id);a.legacy=C.clone(item);try{a.link=link(item.url);}catch{a.link='';}a.legacyImage=/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(item.image||'')?item.image:null;out.push(a);}return out;}
  function filter(items,q={}){const search=(q.search||'').toLowerCase();return items.filter(a=>(!q.category||q.category==='全部'||a.category===q.category)&&(!q.tag||q.tag==='全部'||a.tags.includes(q.tag))&&(!q.favorite||a.favorite)&&(`${a.name} ${a.category} ${a.tags.join(' ')} ${a.notes} ${a.link} ${a.sourceSite||''}`.toLowerCase().includes(search))).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
  function image(a){return a.files.find(f=>f.localId===a.coverId&&f.kind==='image')||a.files.find(f=>f.kind==='image')||null;}
  function forProject(items,scope,id){return id?items.filter(a=>a.usedIn.some(p=>p.scope===scope&&p.id===id)):[];}
  function trashItem(items,id,deletedAt=new Date().toISOString()){
    if(!Array.isArray(items))throw Error('审美库数据格式异常');
    const active=C.clone(items),index=active.findIndex(item=>item.id===id);if(index<0)throw Error('参考不存在');
    const [deleted]=active.splice(index,1);deleted.deletedAt=deletedAt;return {items:active,deleted};
  }
  function restoreItem(items,trash,id,uid=C.uid){
    if(!Array.isArray(items)||!Array.isArray(trash))throw Error('审美库或回收站数据格式异常');
    const active=C.clone(items),bin=C.clone(trash),index=bin.findIndex(item=>item.id===id);if(index<0)throw Error('回收站中没有这条参考');
    const [restored]=bin.splice(index,1);if(active.some(item=>item.id===restored.id))restored.id=uid();delete restored.deletedAt;restored.updatedAt=new Date().toISOString();active.push(restored);return {items:active,trash:bin,restored};
  }
  function splitLegacy(items,folders,dataByScope={}){
    const scopes=['xinxuan','personal'],folderScopes=new Map((folders||[]).map(f=>[f.id,new Set()]));
    for(const scope of scopes)for(const item of [...(dataByScope[scope]?.projects||[]),...(dataByScope[scope]?.topics||[]),...(dataByScope[scope]?.assets||[])])
      for(const id of item.folderIds||[])if(folderScopes.has(id))folderScopes.get(id).add(scope);
    for(const item of items||[])for(const use of item.usedIn||[])if(scopes.includes(use.scope))for(const id of item.folderIds||[])if(folderScopes.has(id))folderScopes.get(id).add(use.scope);
    for(const owners of folderScopes.values())if(!owners.size)owners.add('personal');
    const result=Object.fromEntries(scopes.map(scope=>[scope,{items:[],folders:[]}]));
    for(const folder of folders||[])for(const scope of folderScopes.get(folder.id)||['personal'])result[scope].folders.push(C.clone(folder));
    for(const raw of items||[]){
      const item=normalize(raw),owners=new Set((item.usedIn||[]).map(x=>x.scope).filter(x=>scopes.includes(x)));
      for(const id of item.folderIds||[])for(const scope of folderScopes.get(id)||[])owners.add(scope);
      if(!owners.size)owners.add('personal');
      for(const scope of owners){const copy=C.clone(item);copy.folderIds=(copy.folderIds||[]).filter(id=>result[scope].folders.some(f=>f.id===id));copy.usedIn=(copy.usedIn||[]).filter(x=>x.scope===scope);result[scope].items.push(copy);}
    }
    return result;
  }
  return {CATEGORIES,link,tags,entry,normalize,migrate,filter,image,forProject,trashItem,restoreItem,splitLegacy};
});
