/* Shared domain rules. No network or UI side effects. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.StudioCore=api;})(globalThis,function(){
  'use strict';
  const QUICK=[['outline','创意大纲'],['meaning','创意寓意'],['description','创意描述'],['dialogue','台词'],['atmosphere','影像氛围参考'],['camera','摄影调性参考'],['script','完整故事脚本']];
  const SESSION=[['outline','专场创意大纲'],['description','创意描述'],['meaning','创意寓意'],['scene','场景搭建参考'],['art','美术制景参考'],['atmosphere','整体影像氛围参考'],['camera','摄影调性参考']];
  const DEEP=[['acting','表演与人物'],['location','场地与尺寸约束'],['art','美术制景'],['props','道具'],['costume','服装妆造'],['lighting','灯光'],['camera','摄影与画幅'],['sound','台词、音乐与音效'],['edit','剪辑与转场'],['budget','预算与资源'],['schedule','拍摄排期'],['risks','可行性与待确认事项']];
  const PHASES=[['opening','开场'],['middle','中间'],['ending','结尾']];
  const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const text=x=>typeof x==='string'&&x.trim().length>0;
  const assetOK=(a,kind)=>!!(a&&a.kind===kind&&a.localId&&a.verified===true);
  function selected(slot){return slot?.versions?.find(v=>v.id===slot.selectedId)||null;}
  function slot(label,prompt=''){return {id:uid(),label,prompt,versions:[],selectedId:null,locked:false,task:null,error:''};}
  function topic(title='未命名脚本',projectId=null){return {id:uid(),title,projectId,idea:'',createdAt:new Date().toISOString(),revision:1,quick:{fields:Object.fromEntries(QUICK.map(([k])=>[k,''])),images:[slot('主视觉'),slot('关键动作'),slot('结尾情绪')],videos:Object.fromEntries(PHASES.map(([k,label])=>[k,slot(label+'8秒')])),approved:null},deep:{fields:Object.fromEntries(DEEP.map(([k])=>[k,''])),shots:[],film:null,bgm:null},feedback:[],snapshots:[]};}
  function project(title){return {id:uid(),title,idea:'',date:'',fields:Object.fromEntries(SESSION.map(([k])=>[k,''])),topicIds:[],assetIds:[],createdAt:new Date().toISOString()};}
  function quickStatus(t){
    const missing=QUICK.filter(([k])=>!text(t.quick.fields[k])).map(([,label])=>label);
    const images=t.quick.images.filter(s=>assetOK(selected(s),'image')).length;
    if(t.quick.images.length<3||t.quick.images.length>5)missing.push('参考图数量必须为3–5张');
    if(images!==t.quick.images.length||images<3)missing.push(`视觉参考图 ${images}/${t.quick.images.length}`);
    const videos=PHASES.filter(([k])=>{const a=selected(t.quick.videos[k]);return assetOK(a,'video')&&a.source==='ai'&&Math.abs(a.duration-8)<=0.15;}).length;
    PHASES.forEach(([k,label])=>{const a=selected(t.quick.videos[k]);if(!assetOK(a,'video')||a.source!=='ai'||!Number.isFinite(a.duration)||Math.abs(a.duration-8)>0.15)missing.push(label+'8秒AI视频');});
    const total=QUICK.length+t.quick.images.length+3;
    const done=QUICK.filter(([k])=>text(t.quick.fields[k])).length+images+videos;
    return {ready:missing.length===0,missing,images,videos,percent:Math.min(missing.length?99:100,Math.round(done/total*100))};
  }
  function sessionStatus(p,topics){
    const items=p.topicIds.map(id=>topics.find(t=>t.id===id)).filter(Boolean);
    const missing=SESSION.filter(([k])=>!text(p.fields[k])).map(([,v])=>v);
    if(items.length!==6||new Set(p.topicIds).size!==6)missing.push(`故事脚本 ${items.length}/6`);
    items.forEach((t,i)=>{if(!quickStatus(t).ready)missing.push(`第${i+1}条《${t.title}》未齐备`);});
    return {ready:missing.length===0,missing,items,images:items.reduce((s,t)=>s+quickStatus(t).images,0),videos:items.reduce((s,t)=>s+quickStatus(t).videos,0)};
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
  function putVersion(s,asset){if(s.locked)throw Error('该参考已锁定，请先解锁');s.versions.push({...asset,id:uid(),createdAt:new Date().toISOString(),prompt:s.prompt});s.selectedId=s.versions.at(-1).id;s.error='';s.task=null;}
  function parseJSON(reply){let raw=String(reply).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');try{return JSON.parse(raw);}catch{throw Error('AI未返回完整JSON，原有内容已保留，请重试');}}
  function validateFields(value,defs){if(!value||typeof value!=='object')throw Error('AI返回的策划字段缺失');for(const[k,label]of defs){if(!text(value[k]))throw Error(`AI未提供${label}，本次结果未覆盖原稿`);}return Object.fromEntries(defs.map(([k])=>[k,value[k].trim()]));}
  function validateQuick(raw,count){const fields=validateFields(raw.fields,QUICK);if(!Array.isArray(raw.imagePrompts)||raw.imagePrompts.length!==count||raw.imagePrompts.some(p=>!text(p)))throw Error('AI返回的视觉参考数量不完整');if(PHASES.some(([k])=>!text(raw.videoPrompts?.[k])))throw Error('开场、中间、结尾视频设计不完整');return {fields,imagePrompts:raw.imagePrompts,videoPrompts:raw.videoPrompts};}
  function validateShots(raw){if(!Array.isArray(raw.shots)||raw.shots.length!==25)throw Error('必须返回25个完整分镜，原分镜已保留');return raw.shots.map((s,i)=>{if(!text(s.visual)||!text(s.camera)||!Number.isInteger(s.duration)||s.duration<2||s.duration>12)throw Error(`第${i+1}镜画面、摄影或时长不完整（2–12秒）`);return {id:uid(),number:i+1,visual:s.visual,dialogue:s.dialogue||'无台词',camera:s.camera,duration:s.duration,image:slot(`第${i+1}镜`,s.imagePrompt||s.visual),video:slot(`第${i+1}镜视频`,s.videoPrompt||s.visual)};});}
  function snapshot(t,note){const data=clone(t);delete data.snapshots;t.snapshots.push({id:uid(),time:new Date().toISOString(),note,data});t.revision++;}
  function importLegacy(old){const t=topic(old.title);const current=old.versions?.find(v=>v.version===old.currentVersion)?.data||old;const val=k=>current[k]||old[k]||'';t.id='legacy-'+old.id;t.idea=old.hook||'';t.legacyId=old.id;t.legacy=clone(old);const mapping={outline:'creativeOutline',meaning:'creativeMeaning',description:'creativeDescription',dialogue:'narrationDescription',atmosphere:'visualAtmosphere',camera:'cinematographyStyle',script:'script'};for(const[k,v]of Object.entries(mapping))t.quick.fields[k]=val(v);return t;}
  return {QUICK,SESSION,DEEP,PHASES,uid,clone,text,assetOK,selected,slot,topic,project,quickStatus,sessionStatus,deepStatus,shotFingerprint,putVersion,parseJSON,validateFields,validateQuick,validateShots,snapshot,importLegacy};
});
