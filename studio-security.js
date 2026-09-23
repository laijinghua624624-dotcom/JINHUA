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
})();
