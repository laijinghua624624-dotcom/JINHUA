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
    const data=payload?.data||{},aesthetic=payload?.aesthetic||[];
    return {projects:data.projects?.length||0,topics:data.topics?.length||0,reverse:data.reverse?.length||0,references:aesthetic.length+(data.assets?.length||0),media:mediaGroups(data,aesthetic).size};
  }
  function empty(payload){const s=summary(payload);return !s.projects&&!s.topics&&!s.reverse&&!s.references;}
  function valid(payload){return !!payload&&payload.version===1&&payload.data?.version===2&&Array.isArray(payload.data.topics)&&Array.isArray(payload.data.projects)&&Array.isArray(payload.aesthetic)&&Array.isArray(payload.folders);}
  function newer(remoteRevision,localRevision){return Number(remoteRevision||0)>Number(localRevision||0);}
  return {mediaGroups,setCloudInfo,replaceLocalId,summary,empty,valid,newer};
});
