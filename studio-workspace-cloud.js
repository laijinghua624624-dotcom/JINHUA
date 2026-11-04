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
      if(value.localOnly||typeof value.localId!=='string'||!value.localId||!MEDIA_KINDS.has(value.kind))return;
      if(!groups.has(value.localId))groups.set(value.localId,[]);groups.get(value.localId).push(value);
    });
    return groups;
  }
  function setCloudInfo(groups,localId,path,url,extra){
    for(const item of groups.get(localId)||[]){
      item.cloudPath=path;if(url)item.cloudUrl=url;
      if(extra){if(extra.cloudSize!=null)item.cloudSize=Number(extra.cloudSize)||0;if(extra.cloudSha256)item.cloudSha256=extra.cloudSha256;}
      item.cloudSyncedAt=new Date().toISOString();
    }
  }
  function replaceLocalId(groups,oldId,next){
    const items=groups.get(oldId)||[];for(const item of items)Object.assign(item,next,{cloudPath:item.cloudPath,cloudUrl:item.cloudUrl,cloudSyncedAt:item.cloudSyncedAt});
  }
  function summary(payload){
    const data=payload?.data||{},aesthetic=payload?.aesthetic||[],trash=Array.isArray(data.projectTrash)?data.projectTrash:[];
    return {projects:(data.projects?.length||0)+trash.length,topics:(data.topics?.length||0)+trash.reduce((n,b)=>n+(b.topics?.length||0),0),reverse:(data.reverse?.length||0)+trash.reduce((n,b)=>n+(b.reverse?.length||0),0),references:aesthetic.length+(data.assets?.length||0)+trash.reduce((n,b)=>n+(b.assets?.length||0),0),media:mediaGroups(data,aesthetic).size};
  }
  // A clean reset deliberately carries a marker. It has no visible creative
  // content, but is not an "unknown empty device" that an older tab may use to
  // resurrect its stale local workspace over the clean cloud snapshot.
  function empty(payload){const s=summary(payload),d=payload?.data||{};return !d.cleanResetAt&&!s.projects&&!s.topics&&!s.reverse&&!s.references&&!d.fragments?.length&&!d.exports?.length&&!String(d.preferences||'').trim()&&!payload?.folders?.length&&!payload?.trash?.length;}
  // Transport metadata may change while signing/uploading, but creative content must not.
  // Keep this list in sync with every field written after an upload, otherwise the next
  // sync round sees a "changed" payload and schedules itself again (endless sync loop).
  const TRANSPORT_KEYS=new Set(['cloudPath','cloudUrl','cloudSyncedAt','cloudAudioPath','cloudAudioUrl','cloudSize','cloudSha256','cloudVerifiedAt']);
  function contentStamp(payload){return JSON.stringify(payload,(key,value)=>TRANSPORT_KEYS.has(key)?undefined:value);}
  function copyMediaInfo(target,uploaded){
    const source=mediaGroups(uploaded.data,uploaded.aesthetic,uploaded.trash),dest=mediaGroups(target.data,target.aesthetic,target.trash);
    for(const [id,items]of dest){const info=source.get(id)?.find(item=>item.cloudPath);if(info)for(const item of items)for(const key of ['cloudPath','cloudUrl','cloudSyncedAt','cloudSize','cloudSha256'])if(info[key]!=null)item[key]=info[key];}
    for(const note of target.data.fragments||[]){const info=(uploaded.data.fragments||[]).find(item=>note.audioKey&&item.audioKey===note.audioKey);if(info?.cloudAudioPath){note.cloudAudioPath=info.cloudAudioPath;note.cloudAudioUrl=info.cloudAudioUrl;}}
    return target;
  }
  // How much of the media actually exists in the cloud snapshot. Counts are always
  // derived from the payload, never guessed: this is what the panel shows as X/Y.
  function coverage(payload){
    const groups=mediaGroups(payload?.data,payload?.aesthetic,payload?.trash);
    let uploaded=0,verified=0,missing=0;
    for(const items of groups.values()){
      const item=items.find(value=>value.cloudPath);
      if(!item){missing++;continue;}
      uploaded++;
      if(item.cloudSize!=null)verified++;
    }
    return {uploaded,verified,missing,total:groups.size};
  }
  // A read-only dialog (no form fields) must never block an automatic restore; only a
  // real edit or a form still open should defer it.
  function restoreBlocked({dialogOpen=false,dialogHasInput=false,editing=false}={}){
    return !!(editing||(dialogOpen&&dialogHasInput));
  }
  function presentation(state,meta={}){
    const progress=state.progress||{},phase=state.phase||({'云端已同步':'ready','待同步':'dirty','未登录':'signedout','同步需处理':'error'}[state.status]||'checking');
    if(!state.session)return {label:'仅本机 · 未登录同步',tone:'warn',phase:'signedout',detail:'尚未登录云同步；其他设备暂时看不到这里的新内容。'};
    if(phase==='conflict')return {label:'需要选择保留版本',tone:'warn',phase,detail:state.error||'本机与云端都有新修改，系统已停止覆盖。'};
    if(state.error)return {label:'同步未完成 · 查看原因',tone:'warn',phase:'error',detail:state.error};
    if(phase==='pulling'){
      const total=Number(progress.total)||0;
      return {label:total?`正在恢复云端成果 ${Math.min(progress.done||0,total)}/${total}`:'正在恢复云端成果…',tone:'pending',phase,detail:'正在取回素材地址并写回本机；完成后会显示“已同步至云端”。请保持页面打开。'};
    }
    if(phase==='pushing'){
      const total=Number(progress.total)||0;
      return {label:total?`正在上传本机修改 ${Math.min(progress.done||0,total)}/${total}`:'正在上传本机修改…',tone:'pending',phase,detail:'正在上传素材并保存云端快照；中断后会自动续传。'};
    }
    if(phase==='checking')return {label:'正在核对云端…',tone:'pending',phase,detail:'正在读取云端版本信息，通常 3–5 秒。'};
    if(phase==='waiting')return {label:'等待编辑结束',tone:'pending',phase,detail:'检测到编辑或未保存的表单，10 秒后自动继续。'};
    if(phase==='offline')return {label:'待联网 · 本机已保存',tone:'warn',phase,detail:'本机内容已保存；联网后会自动重试。'};
    if(phase==='working')return {label:'正在同步本机与云端…',tone:'pending',phase,detail:'请保留此页面，完成后会自动更新状态。'};
    if(phase==='pull-needed')return {label:'云端有新版本 · 待恢复',tone:'pending',phase,detail:'本机为空或落后于云端，点击“立即检查保存”即可开始恢复。'};
    if(phase==='dirty'||meta.dirtyAt)return {label:'本机已保存 · 待同步',tone:'pending',phase:'dirty',detail:'有新修改尚未传到云端，暂时不要在另一台设备接着修改。'};
    if(phase==='ready')return {label:'已同步至云端',tone:'ok',phase,detail:'最近成功同步：'+new Date(meta.lastSyncedAt||Date.now()).toLocaleString('zh-CN')};
    return {label:'正在确认同步状态',tone:'pending',phase:'checking',detail:'正在确认本机与云端是否一致。'};
  }
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
  return {mediaGroups,setCloudInfo,replaceLocalId,summary,coverage,empty,valid,newer,syncDecision,contentStamp,copyMediaInfo,restoreBlocked,presentation};
});
