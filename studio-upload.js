/* Upload transport and policy; never retries a paid request or silently resends a file. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.StudioUpload=api;})(globalThis,function(){
  const FALLBACK_LIMIT=250*1024*1024;
  const size=n=>n>=1024**3?(n/1024**3).toFixed(1)+' GiB':(n/1024**2).toFixed(1)+' MiB';
  function validate(file,limits,reverse=false){
    const limit=(reverse?limits?.reverseVideoBytes:limits?.fileBytes)||FALLBACK_LIMIT;
    if(!file.size)throw Error('文件为空，请重新选择原视频。');
    if(reverse&&!/\.(mp4|mov|webm)$/i.test(file.name))throw Error('反推支持 MP4、MOV、WebM 视频。');
    if(file.size>limit)throw Error(`${file.name}：${size(file.size)}，超过当前入口 ${size(limit)} 上限。${limits?.localLargeVideo?'请选择更小的文件或分段原片。':'大视频请使用已更新的本地工作台。'}文件尚未上传。`);
    return limit;
  }
  function responseError(status,result){
    if(result?.error)return result.error;
    if(status===413)return '当前服务拒绝了文件大小（413），可能超过公网代理限制。大视频请使用本地工作台；不是生成服务未启动。';
    if(status===507)return '磁盘空间不足，请预留原片与副本空间后重试。';
    return `上传服务返回异常（HTTP ${status}），本次尚未确认上传完成，请检查后重试。`;
  }
  function send({url,file,progress=()=>{},xhrFactory=()=>new XMLHttpRequest()}){
    return new Promise((resolve,reject)=>{
      const xhr=xhrFactory();xhr.open('POST',url);xhr.timeout=60*60*1000;
      xhr.setRequestHeader('X-File-Name',encodeURIComponent(file.name));
      xhr.setRequestHeader('Content-Type','application/octet-stream');
      xhr.upload.onprogress=e=>{if(e.lengthComputable)progress({percent:Math.min(100,Math.floor(e.loaded/e.total*100)),loaded:e.loaded,total:e.total,stage:'upload'});};
      xhr.upload.onload=()=>progress({percent:100,loaded:file.size,total:file.size,stage:'received'});
      xhr.onerror=()=>reject(Error('上传连接中断或被浏览器阻止；本次尚未确认保存成功。请检查工作台地址与网络后重试，不要重新启动付费反推。'));
      xhr.ontimeout=()=>reject(Error('上传或核验等待超时；服务可能仍在处理。请保留页面并检查原片记录，勿连续重复上传。'));
      xhr.onabort=()=>reject(Error('上传已取消；尚未确认文件完整保存。'));
      xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText);}catch{reject(Error(responseError(xhr.status)));return;}if(xhr.status<200||xhr.status>=300||result.error)reject(Error(responseError(xhr.status,result)));else resolve(result);};
      xhr.send(file);
    });
  }
  return {size,validate,responseError,send};
});

if(typeof document!=='undefined'){
  globalThis.videoUploadHint=function(){const limits=health?.uploadLimits;return limits?`单个反推视频上限 ${StudioUpload.size(limits.reverseVideoBytes)}。原片保留在上传服务，自动生成轻量副本；压缩不调用AI。原片不随云同步，请另行备份。`:'选择文件后先核对服务与大小上限，再开始上传；原片保留，自动制作反推副本。';};
  globalThis.uploadStatus=function(state){if(!job)return;job.transfer=state;job.detail=state.stage==='upload'?`正在上传 ${StudioUpload.size(state.loaded)} / ${StudioUpload.size(state.total)}（${state.percent}%）`:state.stage==='received'?'上传字节发送完毕，等待服务确认接收与核验…':state.stage==='queued'?'原片已保存，排队生成反推副本…':`原片已保存，生成反推副本 ${state.percent}%（不调用AI）`;refreshJobDisplay();};
  globalThis.uploadFile=async function(file,reverse=false){
    health=await api('health',undefined,{timeout:10000});
    if(reverse&&!health.uploadLimits?.reversePreparation)throw Error('当前服务尚未加载大视频上传功能，请重启更新后的工作台服务；文件尚未上传。');
    StudioUpload.validate(file,health.uploadLimits,reverse);
    uploadStatus({stage:'upload',percent:0,loaded:0,total:file.size});
    return StudioUpload.send({url:serviceBase()+'/api/'+(reverse?'upload-reverse':'upload'),file,progress:uploadStatus});
  };
  globalThis.waitVideoPreparation=async function(record){
    const uid=record.uploadId;
    for(let i=0;i<21600;i++){
      if(record.status==='succeeded')return record.result;
      if(['failed','interrupted'].includes(record.status))throw Error((record.error||'反推副本处理失败')+' 原片已保留，点击“继续／重试处理副本”，无需重新上传。');
      uploadStatus({stage:record.status==='queued'?'queued':'processing',percent:record.progress||0});
      if(stop)throw Error('已停止等待；原片与后台压缩任务保留。稍后点击“继续／重试处理副本”取回结果，无需重传。');
      await delay(1000);
      try{record=await api('upload-status/'+uid,undefined,{timeout:15000});}catch{throw Error('暂时无法查询处理状态；原片已保存。服务恢复后点击“继续／重试处理副本”，不要重新上传。');}
    }
    throw Error('后台处理耗时较长；原片已保留，可稍后继续查询。');
  };
  globalThis.uploadReverseVideo=async function(file,onSaved){
    const record=await uploadFile(file,true);
    const original={...record.original,preparationId:record.uploadId,originalService:new URL(serviceBase()||location.origin,location.href).origin};
    onSaved(original);save();
    return {...await waitVideoPreparation(record),originalService:original.originalService};
  };
  globalThis.videoPreparationHTML=function(r){const v=r.video;if(!v||!v.preparationId&&!v.reverseProxy)return '';const origin=v.originalService||'';const local=!origin||origin===new URL(serviceBase()||location.origin,location.href).origin;const originalId=v.originalLocalId||(v.preparationId?v.localId:'');return `<p class="muted">${v.reverseProxy?`已使用轻量副本 ${StudioUpload.size(v.bytes)}；原片 ${StudioUpload.size(v.originalBytes)} 保留在上传服务。`:'原片已接收，反推副本尚待处理。'} 原片不随云同步，请另行备份。</p>${originalId&&local?`<a href="${esc(serviceBase()+'/media/'+encodeURIComponent(originalId))}" target="_blank" rel="noopener" download>下载本服务保存的原片</a>`:''}${v.preparationId?btn('继续／重试处理副本','reverse-upload-retry',`data-id="${r.id}"`):''}${!local?'<p class="muted">原片仅保存在原上传的工作台；请回那里下载或继续处理。</p>':''}`;};
  globalThis.retryVideoPreparation=async function(r){
    if(!r.video?.preparationId)throw Error('没有待处理原片');
    if(r.video.originalService&&r.video.originalService!==new URL(serviceBase()||location.origin,location.href).origin)throw Error('请回到原上传的工作台继续处理，无需再次上传。');
    const uid=r.video.preparationId;
    await withJob('继续处理反推副本',1,async()=>{
      const result=await waitVideoPreparation(await api('upload-retry',{uploadId:uid}));
      for(const item of db.reverse)if(item.video?.preparationId===uid){item.video={...result,originalService:item.video.originalService};item.error='';item.caseError='';}
      save();progress('副本已核验保存，可继续提取关键帧');
    },'轻量副本已就绪，原片仍保留。',db.reverse.filter(x=>x.video?.preparationId===uid).map(x=>x.id));
  };
}
