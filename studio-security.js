/* Remove only obsolete credential settings; never erase creative records. */
(function(){
  'use strict';
  const sensitive=/^(apiKey|api_key|secretKey|secret_key|serviceRoleKey|service_role|jimengAK|jimengSK|accessToken|accessKey|secretAccessKey|token)$/i;
  function clean(value){
    if(!value||typeof value!=='object')return value;
    for(const key of Object.keys(value)){
      if(sensitive.test(key))delete value[key];else clean(value[key]);
    }
    return value;
  }
  for(const key of ['xuan_ti_ku_settings','xuan_ti_ku_cloud','lance_studio_settings']){
    try{const raw=localStorage.getItem(key);if(!raw)continue;const value=clean(JSON.parse(raw));if(key==='xuan_ti_ku_cloud'){delete value.key;value.enabled=false;}localStorage.setItem(key,JSON.stringify(value));}catch{/* Preserve malformed storage for manual recovery. */}
  }
  if(location.pathname.endsWith('/legacy.html'))document.addEventListener('DOMContentLoaded',()=>{
    for(const id of ['apiKey','cloudKey','cloudEnabled']){const field=document.getElementById(id);if(field){field.value='';field.disabled=true;field.placeholder='旧版已停用密钥配置，请使用新工作台服务端环境变量';}}
    const note=document.createElement('div');note.textContent='旧版仅用于本地查看、整理和导出资料。为保护凭据，云同步及直接模型调用已停用；生成请返回新工作台。';note.style.cssText='padding:14px;background:#452916;color:#fff;position:relative;z-index:9999';document.body.prepend(note);
  });
})();
