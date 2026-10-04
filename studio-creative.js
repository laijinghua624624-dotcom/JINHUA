/* Creative decisions are proposals until explicitly accepted. No IO. */
(function(root,factory){const api=factory(typeof module==='object'?require('./studio-core'):root.StudioCore);if(typeof module==='object')module.exports=api;else root.StudioCreative=api;})(globalThis,function(C){
  'use strict';
  const ROLES={identity:'人物／服装',light:'色彩／灯光',composition:'构图',movement:'运镜／节奏',layout:'封面／版式',concept:'创意机制'};
  const fields=t=>t.quick?t.quick.fields:t.fields;
  const labels=t=>t.quick?C.QUICK:C.SESSION;
  function ensure(t){
    const w=t.creative||(t.creative={});
    for(const k of ['references','directions','history','requests'])if(!Array.isArray(w[k]))w[k]=[];
    if(!w.visual)w.visual=C.slot('关键视觉');
    if(!Array.isArray(w.referenceSlots))w.referenceSlots=['identity','light','composition'].map(role=>({...C.slot(ROLES[role]),role}));
    w.feedback=w.feedback||'';w.preserve=w.preserve||'';
    return w;
  }
  function visual(t){return t.quick?t.quick.images[0]:ensure(t).visual;}
  function stamp(t){const w=ensure(t);return JSON.stringify({fields:fields(t),idea:t.idea,refs:w.references,uploads:w.referenceSlots.map(s=>({role:s.role,selectedId:s.selectedId})),selected:w.selectedId,preserve:w.preserve});}
  function directionCurrent(t){return ensure(t).approval?.stamp===stamp(t);}
  function visualCurrent(t){const a=ensure(t).visualApproval;return !!a&&a.id===C.selected(visual(t))?.id&&a.stamp===stamp(t);}
  function remember(t,note){const w=ensure(t);w.history.push({id:C.uid(),time:new Date().toISOString(),note,fields:C.clone(fields(t)),selectedId:w.selectedId||'',report:C.clone(t.report||{}),visualId:C.selected(visual(t))?.id||''});}
  function directions(result){
    if(!Array.isArray(result?.directions)||result.directions.length<2||result.directions.length>3)throw Error('需要2–3个可比较的创意方向；现有方案未改动');
    const out=result.directions.map(d=>{for(const k of ['title','premise','reason','visual','tradeoff'])if(!C.text(d[k]))throw Error('方向比较缺少必要信息，现有方案未改动');return {id:C.uid(),...Object.fromEntries(['title','premise','reason','visual','tradeoff'].map(k=>[k,d[k]]))};});
    if(new Set(out.map(d=>d.premise.trim())).size!==out.length)throw Error('方向重复，请重试；现有方案未改动');
    return out;
  }
  function proposal(t,result,base,keys){
    const valid=new Set(labels(t).map(([k])=>k)),changes={};
    if(!result?.fields||typeof result.fields!=='object')throw Error('修改结果缺少方案字段，原稿已保留');
    for(const k of keys){if(!valid.has(k)||!C.text(result.fields[k]))throw Error('修改结果缺少所选章节，原稿已保留');changes[k]=result.fields[k];}
    return {id:C.uid(),base,changes,reason:C.text(result.reason)?result.reason:'请逐项核对后采用',time:new Date().toISOString()};
  }
  function accept(t){const w=ensure(t),p=w.proposal;if(!p)throw Error('没有待采用的修改');if(stamp(t)!==p.base)throw Error('生成期间原稿或参考已修改。建议已保留，请重新生成后再采用，避免覆盖你的编辑');remember(t,'采用修改前');Object.assign(fields(t),p.changes);w.proposal=null;w.approval=null;t.directionApproved=null;if(t.quick)t.quick.approved=null;}
  function choose(t,id){const w=ensure(t),d=w.directions.find(x=>x.id===id);if(!d)throw Error('方向已失效，请重新选择');remember(t,'切换方向前');w.selectedId=id;w.approval=null;t.directionApproved=null;if(t.quick)t.quick.approved=null;Object.assign(fields(t),{outline:d.premise,meaning:d.reason,description:d.premise+'\n取舍：'+d.tradeoff,atmosphere:d.visual});}
  function approve(t){if(!C.text(fields(t).outline))throw Error('请先写下或选择核心创意');const w=ensure(t);remember(t,'确认当前方向');w.approval={stamp:stamp(t),time:new Date().toISOString()};t.directionApproved={time:w.approval.time,fields:C.clone(fields(t)),report:C.clone(t.report||{})};}
  function approveVisual(t){if(!directionCurrent(t))throw Error('请先确认当前文字方向');const a=C.selected(visual(t));if(!C.assetOK(a,'image'))throw Error('先上传或生成一张关键视觉');ensure(t).visualApproval={id:a.id,stamp:stamp(t),time:new Date().toISOString()};}
  function catalog(db,shared){
    const reverse=db.reverse||[],frames=a=>[...(a.frames||[]),...(a.caseFrames||[])];
    return [...shared.map(a=>({id:'aesthetic:'+a.id,name:a.name,notes:a.notes||'',link:a.link||'',files:a.files||[],category:a.category||'收藏',externalPreview:a.externalPreview,previewDirect:a.previewDirect})),...(db.assets||[]).map(a=>({id:'asset:'+a.id,name:a.name,notes:[a.requirements,a.analysis].filter(Boolean).join('\n'),files:[...(a.files||[]),...(a.frames||[])],category:a.kind==='wardrobe'?'人物／服装':'场景',link:''})),...reverse.filter(a=>!a.caseRemovedAt).map(a=>({id:'reverse:'+a.id,name:a.title,notes:JSON.stringify(a.analysis?.fields||a.overview||a.caseSummary||a.analysis||{})+'\n'+(a.notes||''),files:[...frames(a),...(a.supportingFiles||[]),...(a.kind==='collection'?reverse.filter(c=>c.caseId===a.id&&!c.caseRemovedAt).flatMap(frames):[])],link:a.sourceLink||'',category:a.kind==='collection'?'项目反推':'单条反推'}))];
  }
  function references(t,catalog){const w=ensure(t);return [...w.references.map(ref=>{const a=catalog.find(a=>a.id===ref.id);return a?{...a,role:ROLES[ref.role]?ref.role:'concept',note:ref.note||''}:{...ref,name:'来源已移除',missing:true,files:[]};}),...w.referenceSlots.filter(s=>C.assetOK(C.selected(s),'image')).map(s=>({id:'upload:'+s.id,name:s.label,role:s.role,note:s.referenceNote||'',files:[C.selected(s)]}))];}
  function imagePlan(t,refs,mode='edit',limit=4){
    const input=[],seen=new Set();const add=(a,role,name,note='')=>{if(C.assetOK(a,'image')&&!seen.has(a.localId)){seen.add(a.localId);input.push({asset:a,role,name,note});}};
    if(mode==='edit')add(C.selected(visual(t)),'当前版本','只修改明确提出的部分');
    for(const r of refs)for(const a of r.files||[]){if(C.assetOK(a,'image')){add(a,ROLES[r.role],r.name,r.note);break;}}
    return {sent:input.slice(0,limit),omitted:input.slice(limit)};
  }
  return {ROLES,fields,labels,ensure,visual,stamp,directionCurrent,visualCurrent,remember,directions,proposal,accept,choose,approve,approveVisual,catalog,references,imagePlan};
});
