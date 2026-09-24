(function(root,factory){if(typeof module==='object')module.exports=factory(require('./studio-core'));else root.StudioAesthetic=factory(root.StudioCore);})(globalThis,function(C){
  'use strict';
  const CATEGORIES=['创意文字','封面参考','AI参考','摄影参考','美术参考','舞台声光电','分镜参考','灯光设计','运镜参考','调色参考','服装造型','广告TVC','电影参考','秀场参考','音效配乐','其他'];
  function link(value){const text=String(value||'').trim();if(!text)return '';const match=text.match(/https?:\/\/[^\s<>"'，。；、【】「」]+/i);if(!match)throw Error('请填写http或https链接，也可粘贴含链接的分享文字');let candidate=match[0].replace(/[)\]）!！?？,;]+$/,'');let url;try{url=new URL(candidate);}catch{throw Error('链接格式不正确');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('不支持此链接格式或带账号密码的链接');return url.href;}
  const tags=value=>[...new Set((Array.isArray(value)?value:String(value||'').split(/[,，\n]/)).map(x=>String(x).trim()).filter(Boolean))];
  function entry(name='未命名参考'){return {id:C.uid(),name,kind:'aesthetic',category:'摄影参考',tags:[],notes:'',requirements:'',link:'',sourceSite:'',sourceUsage:'unconfirmed',files:[],coverId:null,favorite:false,usedIn:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
  function normalize(a){return {...entry(a.name||a.title||'未命名参考'),...a,kind:'aesthetic',name:a.name||a.title||'未命名参考',category:a.category||a.type||'其他',tags:tags(a.tags),notes:a.notes??a.requirements??a.note??'',files:Array.isArray(a.files)?a.files:[],usedIn:Array.isArray(a.usedIn)?a.usedIn:[]};}
  function migrate(current,old){if(!Array.isArray(current)||!Array.isArray(old))throw Error('审美库数据格式异常，原始数据已保留');const out=current.map(normalize);for(const item of old){if(!item||item.id==null||out.some(a=>a.legacyVisualId===String(item.id)))continue;const a=normalize({...entry(item.title),category:item.type||'其他',tags:item.tags,notes:item.note||item.description||'',createdAt:item.createdAt||new Date().toISOString()});a.legacyVisualId=String(item.id);a.legacy=C.clone(item);try{a.link=link(item.url);}catch{a.link='';}a.legacyImage=/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(item.image||'')?item.image:null;out.push(a);}return out;}
  function filter(items,q={}){const search=(q.search||'').toLowerCase();return items.filter(a=>(!q.category||q.category==='全部'||a.category===q.category)&&(!q.tag||q.tag==='全部'||a.tags.includes(q.tag))&&(!q.favorite||a.favorite)&&(`${a.name} ${a.category} ${a.tags.join(' ')} ${a.notes} ${a.link} ${a.sourceSite||''}`.toLowerCase().includes(search))).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
  function coverReference(a,folders=[]){const ids=new Set((folders||[]).map(folder=>folder.id));return a?.category==='封面参考'||/^历史参考｜(?:人物照片封面|纯字体模板)$/.test(a?.category||'')||(a?.folderIds||[]).some(id=>ids.has(id));}
  function categoryOf(a,folders=[]){return coverReference(a,folders)?'封面参考':a?.category||'其他';}
  function coverSubtypeMatch(a,type='全部',folders=[]){
    if(type==='全部')return coverReference(a,folders);
    const tags=new Set(a?.tags||[]),linked=(folders||[]).filter(folder=>(a?.folderIds||[]).includes(folder.id)).map(folder=>folder.name).join(' '),text=[a?.name,a?.category,linked,...tags].join(' ');
    if(type==='过往封面')return tags.has('历史封面')||/过往封面|历史参考/.test(text);
    if(type==='人物照片')return tags.has('人物照片')||/人物照片封面/.test(text);
    if(type==='纯字体')return tags.has('纯字体')||/纯字体模板/.test(text);
    if(type==='增量优化')return tags.has('增量优化')||tags.has('封面建议')||/增量优化|审美升级|新封面参考/.test(text);
    return false;
  }
  function visualWeight(a){
    const files=Array.isArray(a?.files)?a.files:[],frames=Array.isArray(a?.frames)?a.frames:[];
    if(files.some(file=>file?.localId===a?.coverId&&file.kind==='image'))return 5;
    if(files.some(file=>file?.kind==='image')||frames.some(file=>file?.kind==='image'))return 4;
    if(files.some(file=>file?.kind==='video')||frames.some(file=>file?.kind==='video'))return 3;
    if(a?.legacyImage||a?.externalPreview)return 2;
    return 0;
  }
  function viewFilter(items,q={}){const folders=q.coverFolders||[],search=(q.search||'').toLowerCase();return items.filter(a=>{
    const category=categoryOf(a,folders),categoryOK=!q.category||q.category==='全部'||category===q.category,subtypeOK=q.category!=='封面参考'||coverSubtypeMatch(a,q.coverType||'全部',folders);
    return categoryOK&&subtypeOK&&(!q.tag||q.tag==='全部'||a.tags.includes(q.tag))&&(!q.favorite||a.favorite)&&(`${a.name} ${category} ${a.category} ${a.tags.join(' ')} ${a.notes} ${a.link} ${a.sourceSite||''}`.toLowerCase().includes(search));
  }).sort((a,b)=>visualWeight(b)-visualWeight(a)||String(b.createdAt).localeCompare(String(a.createdAt)));}
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
  const lines=(pairs,source)=>pairs.map(([key,label])=>C.text(source?.[key])?`${label}\n${source[key].trim()}`:'').filter(Boolean).join('\n\n');
  function mediaFromSlots(slots){
    const seen=new Set(),files=[];
    for(const slot of slots||[]){const media=C.selected(slot);if(!C.assetOK(media,'image'))continue;const key=media.localId||media.id;if(seen.has(key))continue;seen.add(key);files.push(C.clone(media));}
    return files;
  }
  function extracted(name,category,tagsList,notes,files,sourceLabel,extractedKind){
    const item=entry(name);item.category=category;item.tags=tags(tagsList);item.notes=notes;item.requirements=notes;item.files=files;item.coverId=files[0]?.localId||null;item.folderIds=[];item.usedIn=[];item.sourceLabel=sourceLabel;item.extractedKind=extractedKind;item.extractedSignature=JSON.stringify({name,category,notes,files:files.map(file=>file.localId)});return item;
  }
  function projectReferences(project,topics=[]){
    if(!project)throw Error('缺少可提取的内容');
    const source=`工作台内容提取 · ${project.title||'未命名专场'}`,result=[],projectNotes=[C.text(project.idea)?`原始需求\n${project.idea.trim()}`:'',lines(C.SESSION,project.fields)].filter(Boolean).join('\n\n');
    if(projectNotes)result.push(extracted(`${project.title||'未命名专场'} · 整体创意文字`,'创意文字',['文字描述','创意方向','场景','美术','影像','摄影'],projectNotes,[],source,'project-text'));
    for(const topic of topics){
      const title=topic.title||'未命名脚本',topicNotes=[C.text(topic.idea)?`原始想法\n${topic.idea.trim()}`:'',lines(C.QUICK,topic.quick?.fields)].filter(Boolean).join('\n\n');
      if(topicNotes)result.push(extracted(`${title} · 创意文字`,'创意文字',['文字描述','创意大纲','台词','影像氛围','摄影调性'],topicNotes,[],source,'topic-text'));
      const cover=C.ensureCover(topic),coverNotes=[C.text(cover.referenceAdvice)?`过往封面借鉴建议\n${cover.referenceAdvice.trim()}`:'',C.text(cover.recommendation)?`首选建议\n${cover.recommendation.trim()}`:'',...cover.options.map(option=>{const body=[`${option.label} · ${option.angle}`,C.text(option.headline)?`主标题：${option.headline.trim()}`:'',C.text(option.subheadline)?`辅助文案：${option.subheadline.trim()}`:'',C.text(option.description)?`构图与信息层级：${option.description.trim()}`:'',C.text(option.image?.referenceNote)?`借鉴要点：${option.image.referenceNote.trim()}`:''].filter(Boolean);return body.length>1?body.join('\n'):'';})].filter(Boolean).join('\n\n'),coverFiles=mediaFromSlots([...(cover.references||[]),...cover.options.map(option=>option.image)]);
      if(coverNotes||coverFiles.length)result.push(extracted(`${title} · 封面样式`,'封面参考',['封面样式','标题层级','构图','视觉钩子'],coverNotes,coverFiles,source,'topic-cover'));
      const visualSlots=[...(topic.quick?.images||[]),...(topic.deep?.shots||[]).map(shot=>shot.image)],visualFiles=mediaFromSlots(visualSlots),visualNotes=(topic.quick?.images||[]).map(slot=>[slot.label,slot.referenceNote,slot.prompt].filter(C.text).join('\n')).filter(Boolean).join('\n\n');
      if(visualFiles.length)result.push(extracted(`${title} · 视觉图片`,'摄影参考',['视觉参考','摄影','画面氛围','分镜'],visualNotes,visualFiles,source,'topic-images'));
    }
    return result;
  }
  function mergeExtracted(items,candidates){
    if(!Array.isArray(items)||!Array.isArray(candidates))throw Error('审美库数据格式异常');
    const next=C.clone(items),added=[];
    for(const candidate of candidates){if(next.some(item=>item.extractedSignature===candidate.extractedSignature))continue;next.push(C.clone(candidate));added.push(candidate);}
    return {items:next,added};
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
  return {CATEGORIES,link,tags,entry,normalize,migrate,filter,coverReference,categoryOf,coverSubtypeMatch,visualWeight,viewFilter,image,forProject,trashItem,restoreItem,projectReferences,mergeExtracted,splitLegacy};
});
