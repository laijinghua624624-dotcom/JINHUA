/* One authorized clean-start migration, followed by ongoing credential cleanup. */
(function(){
  'use strict';
  const cleanStart='2026-09-23-clean-start';
  if(localStorage.getItem('jinhua_clean_start')!==cleanStart){
    const exact=new Set(['lance_ai_usage_v1','lance_studio_aesthetic','lance_studio_folders','lance_studio_scope_split_v1','jinhua_mobile_radar_saved','jinhua_mobile_radar_seen','jinhua_mobile_radar_last_viewed']);
    for(const name of Object.keys(localStorage))if(exact.has(name)||name.startsWith('lance_studio_v2_')||name.startsWith('lance_studio_aesthetic_')||name.startsWith('lance_studio_folders_')||name.startsWith('xuan_ti_ku_'))localStorage.removeItem(name);
    if(typeof indexedDB!=='undefined')for(const name of ['lance_studio_files','jinhua_mobile_queue'])try{indexedDB.deleteDatabase(name);}catch{}
    localStorage.setItem('jinhua_clean_start',cleanStart);
  }
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
