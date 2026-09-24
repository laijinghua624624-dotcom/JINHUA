/* Full workbench snapshot helpers. No network or destructive merge happens here. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.StudioWorkspaceCloud=api;})(globalThis,function(){
  'use strict';
  const MEDIA_KINDS=new Set(['image','video','audio','document']);
  function visit(value,callback,seen=new Set()){
    if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);callback(value);
    for(const child of Object.values(value))visit(child,callback,seen);
  }
  function mediaGroups(...roots){
    const groups=new Map();
    for(const root of roots)visit(root,value=>{
      if(typeof value.localId!=='string'||!value.localId||!MEDIA_KINDS.has(value.kind))return;
      if(!groups.has(value.localId))groups.set(value.localId,[]);groups.get(value.localId).push(value);
    });
    return groups;
  }
  function setCloudInfo(groups,localId,path,url){
    for(const item of groups.get(localId)||[]){item.cloudPath=path;if(url)item.cloudUrl=url;item.cloudSyncedAt=new Date().toISOString();}
  }
  function replaceLocalId(groups,oldId,next){
    const items=groups.get(oldId)||[];for(const item of items)Object.assign(item,next,{cloudPath:item.cloudPath,cloudUrl:item.cloudUrl,cloudSyncedAt:item.cloudSyncedAt});
  }
  function summary(payload){
    const data=payload?.data||{},aesthetic=payload?.aesthetic||[],trash=Array.isArray(data.projectTrash)?data.projectTrash:[];
    return {projects:(data.projects?.length||0)+trash.length,topics:(data.topics?.length||0)+trash.reduce((n,b)=>n+(b.topics?.length||0),0),reverse:(data.reverse?.length||0)+trash.reduce((n,b)=>n+(b.reverse?.length||0),0),references:aesthetic.length+(data.assets?.length||0)+trash.reduce((n,b)=>n+(b.assets?.length||0),0),media:mediaGroups(data,aesthetic).size};
  }
  function empty(payload){const s=summary(payload);return !s.projects&&!s.topics&&!s.reverse&&!s.references;}
  function valid(payload){return !!payload&&payload.version===1&&payload.data?.version===2&&Array.isArray(payload.data.topics)&&Array.isArray(payload.data.projects)&&Array.isArray(payload.aesthetic)&&Array.isArray(payload.folders);}
  function newer(remoteRevision,localRevision){return Number(remoteRevision||0)>Number(localRevision||0);}
  function syncDecision(localPayload,remoteRow,meta={}){
    const localEmpty=empty(localPayload),remotePayload=remoteRow?.payload,remoteEmpty=!remoteRow||empty(remotePayload);
    if(remoteRow&&!valid(remotePayload))return {action:'conflict',reason:'云端数据格式异常，已停止覆盖'};
    if(!remoteRow)return {action:localEmpty?'pair':'push',reason:localEmpty?'云端与本机均为空':'云端尚无数据'};
    if(localEmpty&&!remoteEmpty)return {action:'pull',reason:'当前设备为空，自动恢复云端成果'};
    if(!localEmpty&&remoteEmpty)return {action:'push',reason:'云端为空，保存本机成果'};
    if(localEmpty&&remoteEmpty)return {action:'pair',reason:'云端与本机均为空'};
    if(!meta.paired)return {action:'conflict',reason:'本机与云端都有内容，需要选择保留版本'};
    if(meta.dirtyAt&&newer(remoteRow.revision,meta.lastRevision))return {action:'conflict',reason:'本机与云端都有新修改，未自动覆盖'};
    if(meta.dirtyAt)return {action:'push',reason:'本机有新修改'};
    if(newer(remoteRow.revision,meta.lastRevision))return {action:'pull',reason:'云端版本更新'};
    return {action:'refresh',reason:'内容已经一致'};
  }
  return {mediaGroups,setCloudInfo,replaceLocalId,summary,empty,valid,newer,syncDecision};
});
