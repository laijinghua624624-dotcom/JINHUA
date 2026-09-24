/* Shared domain rules. No network or UI side effects. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.StudioCore=api;})(globalThis,function(){
  'use strict';
  const QUICK=[['outline','创意大纲'],['meaning','创意寓意'],['description','创意描述'],['dialogue','台词'],['atmosphere','影像氛围参考'],['camera','摄影调性参考'],['script','完整故事脚本']];
  const SESSION=[['outline','专场创意大纲'],['description','创意描述'],['meaning','创意寓意'],['scene','场景搭建参考'],['art','美术制景参考'],['atmosphere','整体影像氛围参考'],['camera','摄影调性参考']];
  const DEEP=[['acting','表演与人物'],['location','场地与尺寸约束'],['art','美术制景'],['props','道具'],['costume','服装妆造'],['lighting','灯光'],['camera','摄影与画幅'],['sound','台词、音乐与音效'],['edit','剪辑与转场'],['budget','预算与资源'],['schedule','拍摄排期'],['risks','可行性与待确认事项']];
  const PHASES=[['opening','开场'],['middle','中间'],['ending','结尾']];
  const COST={image:0.22,videoSecond:0.60,monthlyBase:45,retryRate:0.20};
  const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const text=x=>typeof x==='string'&&x.trim().length>0;
  const assetOK=(a,kind)=>!!(a&&a.kind===kind&&a.localId&&a.verified===true);
  function selected(slot){return slot?.versions?.find(v=>v.id===slot.selectedId)||null;}
  function slot(label,prompt=''){return {id:uid(),label,prompt,versions:[],selectedId:null,locked:false,task:null,error:''};}
  function coverOption(label,angle){return {id:uid(),label,angle,headline:'',subheadline:'',description:'',image:slot(label+'封面图')};}
  function cover(){const options=[coverOption('A','情绪钩子'),coverOption('B','人物识别'),coverOption('C','信息转化')];return {recommendation:'',selectedId:options[0].id,ratio:'3:4',options};}
  function ensureCover(t){
    if(!t.quick)t.quick={};
    if(!t.quick.cover||typeof t.quick.cover!=='object')t.quick.cover=cover();
    const c=t.quick.cover;
    if(!Array.isArray(c.options))c.options=[];
    const defaults=[['A','情绪钩子'],['B','人物识别'],['C','信息转化']];
    while(c.options.length<3){const [label,angle]=defaults[c.options.length];c.options.push(coverOption(label,angle));}
    c.options=c.options.slice(0,3).map((o,i)=>{const [label,angle]=defaults[i];return {id:o?.id||uid(),label:o?.label||label,angle:o?.angle||angle,headline:o?.headline||'',subheadline:o?.subheadline||'',description:o?.description||'',image:o?.image&&typeof o.image==='object'?o.image:slot(label+'封面图')};});
    if(!text(c.recommendation))c.recommendation=c.recommendation||'';
    if(!['3:4','9:16'].includes(c.ratio))c.ratio='3:4';
    if(!c.options.some(o=>o.id===c.selectedId))c.selectedId=c.options[0].id;
    return c;
  }
  function topic(title='未命名脚本',projectId=null){return {id:uid(),title,projectId,idea:'',createdAt:new Date().toISOString(),revision:1,quick:{fields:Object.fromEntries(QUICK.map(([k])=>[k,''])),cover:cover(),images:[slot('主视觉'),slot('关键动作'),slot('结尾情绪')],videos:Object.fromEntries(PHASES.map(([k,label])=>[k,slot(label+'8秒')])),approved:null},deep:{fields:Object.fromEntries(DEEP.map(([k])=>[k,''])),shots:[],film:null,bgm:null},feedback:[],snapshots:[]};}
  function project(title){return {id:uid(),title,idea:'',date:'',targetCount:0,stage:'direction',fields:Object.fromEntries(SESSION.map(([k])=>[k,''])),topicIds:[],assetIds:[],createdAt:new Date().toISOString()};}
  // A project can be reported before any scripts are planned. Missing legacy
  // counts still preserve the former six-item starting point.
  function sessionTarget(p){return Number.isInteger(p.targetCount)&&p.targetCount>=0&&p.targetCount<=100?p.targetCount:Math.max(6,new Set(p.topicIds||[]).size);}
  function setSessionTarget(p,value){const n=Number(value);if(!Number.isInteger(n)||n<0||n>100)throw Error('计划内容数须为0–100的整数');if(n<new Set(p.topicIds||[]).size)throw Error('计划内容数不能少于已关联脚本；请先调整关联，不会自动删除脚本');p.targetCount=n;return n;}
  function projectOverviewStatus(item){
    const missing=[];
    if(!text(item?.title))missing.push('专场名称');
    for(const[k,label]of SESSION)if(!text(item?.fields?.[k]))missing.push(label);
    return {ready:missing.length===0,missing,stage:'overview'};
  }
  function directionStatus(item,kind='topic',topics=[]){
    const f=kind==='project'?item.fields:item.quick.fields,r=item.report||{},missing=[];
    if(!text(r.recommendation)&&!text(f.outline))missing.push('一句话主推方向或创意大纲');
    if(!text(r.reason)&&!text(f.meaning))missing.push('推荐理由或创意寓意');
    if(kind==='project'){
      const ids=item.topicIds||[],items=[...new Set(ids)].map(id=>topics.find(t=>t.id===id)).filter(Boolean),target=sessionTarget(item);
      if(items.length!==target||items.length!==ids.length)missing.push(`故事方向 ${items.length}/${target}（须为不同的有效脚本）`);
      items.forEach((t,i)=>{if(!text(t.title)||![t.idea,t.report?.role,t.quick.fields.outline].some(text))missing.push(`第${i+1}条故事方向与分工`);});
    }
    return {ready:missing.length===0,missing,stage:'direction'};
  }
  function quickStatus(t){
    const coverPlan=ensureCover(t);
    const missing=QUICK.filter(([k])=>!text(t.quick.fields[k])).map(([,label])=>label);
    if(!text(coverPlan.recommendation))missing.push('封面首选推荐理由');
    if(coverPlan.options.length!==3)missing.push('封面方案必须为A/B/C三套');
    let covers=0;
    coverPlan.options.forEach(o=>{if(!text(o.headline))missing.push(`封面${o.label}主标题`);if(!text(o.subheadline))missing.push(`封面${o.label}辅助文案`);if(!text(o.description))missing.push(`封面${o.label}构图与点击逻辑`);if(assetOK(selected(o.image),'image'))covers++;else missing.push(`封面${o.label}实际图片`);});
    if(!coverPlan.options.some(o=>o.id===coverPlan.selectedId))missing.push('请选择首选封面');
    const images=t.quick.images.filter(s=>assetOK(selected(s),'image')).length;
    if(t.quick.images.length<3||t.quick.images.length>5)missing.push('参考图数量必须为3–5张');
    if(images!==t.quick.images.length||images<3)missing.push(`视觉参考图 ${images}/${t.quick.images.length}`);
    const videos=PHASES.filter(([k])=>{const a=selected(t.quick.videos[k]);return assetOK(a,'video')&&a.source==='ai'&&Math.abs(a.duration-8)<=0.15;}).length;
    PHASES.forEach(([k,label])=>{const a=selected(t.quick.videos[k]);if(!assetOK(a,'video')||a.source!=='ai'||!Number.isFinite(a.duration)||Math.abs(a.duration-8)>0.15)missing.push(label+'8秒AI视频');});
    const coverText=coverPlan.options.reduce((n,o)=>n+[o.headline,o.subheadline,o.description].filter(text).length,0)+(text(coverPlan.recommendation)?1:0)+(coverPlan.options.some(o=>o.id===coverPlan.selectedId)?1:0);
    const total=QUICK.length+t.quick.images.length+3+14;
    const done=QUICK.filter(([k])=>text(t.quick.fields[k])).length+images+videos+coverText+covers;
    return {ready:missing.length===0,missing,images,videos,covers,percent:Math.min(missing.length?99:100,Math.round(done/total*100))};
  }
  function sessionStatus(p,topics){
    const items=[...new Set(p.topicIds)].map(id=>topics.find(t=>t.id===id)).filter(Boolean),target=sessionTarget(p);
    const missing=SESSION.filter(([k])=>!text(p.fields[k])).map(([,v])=>v);
    if(items.length!==target||p.topicIds.length!==items.length)missing.push(`故事脚本 ${items.length}/${target}（须为不同的有效脚本）`);
    items.forEach((t,i)=>{if(!quickStatus(t).ready)missing.push(`第${i+1}条《${t.title}》未齐备`);});
    return {ready:missing.length===0,missing,items,images:items.reduce((s,t)=>s+quickStatus(t).images,0),videos:items.reduce((s,t)=>s+quickStatus(t).videos,0),covers:items.reduce((s,t)=>s+quickStatus(t).covers,0)};
  }
  function shotFingerprint(shots){return JSON.stringify(shots.map(s=>[s.id,s.visual,s.dialogue,s.camera,s.duration,s.image.selectedId,s.video.selectedId]));}
  function deepStatus(t){
    const missing=DEEP.filter(([k])=>!text(t.deep.fields[k])).map(([,label])=>label);
    if(!t.quick.approved)missing.unshift('先确认汇报方向');
    if(t.deep.shots.length!==25)missing.push(`分镜 ${t.deep.shots.length}/25`);
    const images=t.deep.shots.filter(s=>assetOK(selected(s.image),'image')&&selected(s.image).source==='ai').length;
    const videos=t.deep.shots.filter(s=>assetOK(selected(s.video),'video')&&selected(s.video).source==='ai'&&selected(s.video).duration>=s.duration-0.15).length;
    if(images!==25)missing.push(`AI分镜参考图 ${images}/25`);
    if(t.deep.shots.some(s=>!text(s.visual)||!text(s.camera)||!(s.duration>0)))missing.push('分镜画面、摄影或时长未填写');
    const film=t.deep.film;
    if(!assetOK(film,'video')||film.source!=='ai-assembly'||!Number.isFinite(film.duration)||film.fingerprint!==shotFingerprint(t.deep.shots)||film.bgmId!==(t.deep.bgm?.localId||null))missing.push('完整AI成片参考未生成或需更新');
    if(t.deep.shots.length&&Math.abs((film?.duration||0)-t.deep.shots.reduce((a,s)=>a+Number(s.duration),0))>0.5&&!missing.includes('完整AI成片参考未生成或需更新'))missing.push('成片时长与分镜不一致');
    return {ready:missing.length===0,missing,images,videos};
  }
  function budgetPlan(value={}){
    const positive=(v,fallback)=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):fallback;
    return {monthlyCny:positive(value.monthlyCny,800),projects:Math.round(positive(value.projects,3)),scripts:Math.round(positive(value.scripts,10)),deepScripts:Math.round(positive(value.deepScripts,6))};
  }
  function costTotal(images,videoSeconds,base=0){const media=images*COST.image+videoSeconds*COST.videoSecond;return Math.round((base+media*(1+COST.retryRate))*100)/100;}
  function monthlyCostRange(value){
    const p=budgetPlan(value),images=p.scripts*7+p.deepScripts*25,quickSeconds=p.scripts*24;
    const lowSeconds=quickSeconds+p.deepScripts*25*3,highSeconds=quickSeconds+p.deepScripts*25*4;
    return {...p,images,quickSeconds,deepSeconds:[p.deepScripts*75,p.deepScripts*100],videoSeconds:[lowSeconds,highSeconds],cost:[costTotal(images,lowSeconds,COST.monthlyBase),costTotal(images,highSeconds,COST.monthlyBase)]};
  }
  function quickGenerationCost(t){
    const c=ensureCover(t),images=[...c.options.map(o=>o.image),...t.quick.images].filter(s=>!assetOK(selected(s),'image')).length;
    const videoSeconds=PHASES.reduce((n,[k])=>{const a=selected(t.quick.videos[k]);return n+(assetOK(a,'video')&&a.source==='ai'&&Math.abs(a.duration-8)<=.15?0:8);},0);
    return {images,videoSeconds,cost:costTotal(images,videoSeconds)};
  }
  function deepGenerationCost(t,kind='all'){
    const images=kind==='video'?0:t.deep.shots.filter(s=>!assetOK(selected(s.image),'image')||selected(s.image).source!=='ai').length;
    const videoSeconds=kind==='image'?0:t.deep.shots.reduce((n,s)=>{const a=selected(s.video);return n+(assetOK(a,'video')&&a.source==='ai'&&a.duration>=s.duration-.15?0:Number(s.duration)||0);},0);
    return {images,videoSeconds,cost:costTotal(images,videoSeconds)};
  }
  function putVersion(s,asset){if(s.locked)throw Error('该参考已锁定，请先解锁');s.versions.push({...asset,id:uid(),createdAt:new Date().toISOString(),prompt:s.prompt});s.selectedId=s.versions.at(-1).id;s.error='';s.task=null;}
  function parseJSON(reply){let raw=String(reply).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');try{return JSON.parse(raw);}catch{throw Error('AI未返回完整JSON，原有内容已保留，请重试');}}
  function validateFields(value,defs){if(!value||typeof value!=='object')throw Error('AI返回的策划字段缺失');for(const[k,label]of defs){if(!text(value[k]))throw Error(`AI未提供${label}，本次结果未覆盖原稿`);}return Object.fromEntries(defs.map(([k])=>[k,value[k].trim()]));}
  function validateQuick(raw,count){const fields=validateFields(raw.fields,QUICK);if(!Array.isArray(raw.imagePrompts)||raw.imagePrompts.length!==count||raw.imagePrompts.some(p=>!text(p)))throw Error('AI返回的视觉参考数量不完整');if(PHASES.some(([k])=>!text(raw.videoPrompts?.[k])))throw Error('开场、中间、结尾视频设计不完整');const c=raw.cover;if(!c||!text(c.recommendation)||!Number.isInteger(c.recommendedIndex)||c.recommendedIndex<0||c.recommendedIndex>2||!Array.isArray(c.options)||c.options.length!==3)throw Error('AI返回的视频封面推荐不完整');c.options.forEach((o,i)=>{if(!text(o.headline)||!text(o.subheadline)||!text(o.description)||!text(o.prompt))throw Error(`AI返回的封面方案${i+1}不完整`);});return {fields,imagePrompts:raw.imagePrompts,videoPrompts:raw.videoPrompts,cover:c};}
  function validateShots(raw){if(!Array.isArray(raw.shots)||raw.shots.length!==25)throw Error('必须返回25个完整分镜，原分镜已保留');return raw.shots.map((s,i)=>{if(!text(s.visual)||!text(s.camera)||!Number.isInteger(s.duration)||s.duration<2||s.duration>12)throw Error(`第${i+1}镜画面、摄影或时长不完整（2–12秒）`);return {id:uid(),number:i+1,visual:s.visual,dialogue:s.dialogue||'无台词',camera:s.camera,duration:s.duration,image:slot(`第${i+1}镜`,s.imagePrompt||s.visual),video:slot(`第${i+1}镜视频`,s.videoPrompt||s.visual)};});}
  function snapshot(t,note){const data=clone(t);delete data.snapshots;t.snapshots.push({id:uid(),time:new Date().toISOString(),note,data});t.revision++;}
  function importLegacy(old){const t=topic(old.title);const current=old.versions?.find(v=>v.version===old.currentVersion)?.data||old;const val=k=>current[k]||old[k]||'';t.id='legacy-'+old.id;t.idea=old.hook||'';t.legacyId=old.id;t.legacy=clone(old);const mapping={outline:'creativeOutline',meaning:'creativeMeaning',description:'creativeDescription',dialogue:'narrationDescription',atmosphere:'visualAtmosphere',camera:'cinematographyStyle',script:'script'};for(const[k,v]of Object.entries(mapping))t.quick.fields[k]=val(v);return t;}
  return {QUICK,SESSION,DEEP,PHASES,COST,uid,clone,text,assetOK,selected,slot,cover,ensureCover,topic,project,sessionTarget,setSessionTarget,projectOverviewStatus,directionStatus,quickStatus,sessionStatus,deepStatus,budgetPlan,monthlyCostRange,quickGenerationCost,deepGenerationCost,shotFingerprint,putVersion,parseJSON,validateFields,validateQuick,validateShots,snapshot,importLegacy};
});
