(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const Cloud=window.StudioCloud;
  const QUEUE_KEY='lance_capture_queue_v1';
  const state={session:null,space:'xinxuan',kind:'text',file:null,previewUrl:'',recorder:null,chunks:[],recording:false,saving:false,timer:null,seconds:0};
  const note=$('#note'),saveBtn=$('#save'),preview=$('#preview'),statusEl=$('#status'),recent=$('#recent-list'),conn=$('#conn');
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kindLabel={text:'文字',link:'链接',voice:'语音',image:'图片',video:'视频',document:'文档'};

  function setStatus(message,kind){statusEl.textContent=message;statusEl.hidden=!message;statusEl.className='status'+(kind?' '+kind:'');}
  function setConn(){
    const online=navigator.onLine!==false;
    conn.textContent=online?'已连接':'离线';
    conn.className='conn '+(online?'ok':'off');
  }
  function friendly(error){
    const text=String(error&&error.message||error||'');
    if(/Failed to fetch|NetworkError|Load failed|network/i.test(text))return '网络不稳，稍后重试';
    if(/401|未登录|请先登录/.test(text))return '登录已过期，请重新登录';
    return text||'保存失败，请重试';
  }

  function loadQueue(){
    try{const rows=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch{return[];}
  }
  function saveQueue(rows){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(rows.slice(0,50)));}catch{}}
  function enqueue(item){const rows=loadQueue();rows.unshift(item);saveQueue(rows);setStatus('已存在本机，联网后会自动上传','ok');}

  async function flushQueue(){
    if(!state.session)return;
    const rows=loadQueue();if(!rows.length)return;
    const left=[];
    for(const item of rows){
      try{await Cloud.createInbox(item);}catch(error){left.push(item);}
    }
    saveQueue(left);
    if(left.length<rows.length){setStatus('网络恢复，本机积压的记录已上传','ok');refreshRecent();}
  }

  function showLogin(){
    $('#login').hidden=false;$('#home').hidden=true;
    try{$('#email').value=localStorage.getItem('lance_capture_email')||'';}catch{}
    setTimeout(()=>{if(document.activeElement===document.body)$('#email').focus();},50);
  }
  function showHome(){
    $('#login').hidden=true;$('#home').hidden=false;setConn();
    setTimeout(()=>{if(document.activeElement===document.body)note.focus();},60);
    flushQueue();refreshRecent();
  }

  async function signIn(){
    const email=$('#email').value.trim(),password=$('#password').value;
    const err=$('#login-error');err.hidden=true;
    if(!email||password.length<8){err.textContent='请输入邮箱和至少 8 位密码';err.hidden=false;return;}
    const button=$('#signin');button.disabled=true;button.textContent='登录中…';
    try{
      state.session=await Cloud.signIn(email,password);
      if(!state.session)throw new Error('登录失败，请检查密码');
      try{localStorage.setItem('lance_capture_email',email);}catch{}
      showHome();
    }catch(error){err.textContent=friendly(error);err.hidden=false;}
    finally{button.disabled=false;button.textContent='登录';}
  }

  function setSpace(space){
    state.space=space;
    document.querySelectorAll('.space').forEach(button=>button.classList.toggle('active',button.dataset.space===space));
  }
  function reset(){
    state.kind='text';state.file=null;
    if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);
    state.previewUrl='';preview.hidden=true;preview.innerHTML='';
    note.value='';note.focus();
    document.querySelectorAll('.quick button').forEach(button=>button.classList.remove('active'));
    setStatus('');
  }
  function clearFile(){state.file=null;if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);state.previewUrl='';preview.hidden=true;preview.innerHTML='';state.kind='text';}

  function showPreview(){
    if(!state.file){preview.hidden=true;preview.innerHTML='';return;}
    if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);
    state.previewUrl=URL.createObjectURL(state.file);
    const type=state.file.type||'';
    const media=type.startsWith('image/')?`<img src="${state.previewUrl}" alt="">`:
      type.startsWith('video/')?`<video src="${state.previewUrl}" controls playsinline></video>`:
      `<audio src="${state.previewUrl}" controls></audio>`;
    preview.innerHTML=`${media}<div class="meta"><strong>${esc(state.file.name)}</strong><br>${(state.file.size/1024/1024).toFixed(1)} MB</div><button class="remove" data-remove>移除</button>`;
    preview.hidden=false;
  }

  async function prepareImage(file){
    if(!file.type.startsWith('image/')||file.size<900*1024)return file;
    try{
      const bitmap=await createImageBitmap(file);
      const max=1600,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      bitmap.close&&bitmap.close();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
      if(!blob)return file;
      return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
    }catch{return file;}
  }

  function pickFile(file){
    if(!file)return;
    state.file=file;
    state.kind=file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'voice':file.type.startsWith('image/')?'image':'document';
    showPreview();
  }

  async function toggleVoice(){
    if(state.recording){
      try{state.recorder.stop();}catch{}
      return;
    }
    if(!navigator.mediaDevices||!window.MediaRecorder){setStatus('这个浏览器不支持录音，请用相册或文字','bad');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const types=['audio/mp4','audio/webm;codecs=opus','audio/webm'];
      const mime=types.find(type=>window.MediaRecorder.isTypeSupported&&window.MediaRecorder.isTypeSupported(type))||'';
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      state.chunks=[];state.recorder=recorder;state.recording=true;state.seconds=0;
      const button=document.querySelector('[data-act="voice"]');button.classList.add('active');button.innerHTML='<span>⏹</span>停止';
      setStatus('正在录音…再点一次停止','');
      recorder.ondataavailable=event=>{if(event.data&&event.data.size)state.chunks.push(event.data);};
      recorder.onstop=()=>{
        stream.getTracks().forEach(track=>track.stop());
        state.recording=false;
        button.classList.remove('active');button.innerHTML='<span>🎙️</span>语音';
        const blob=new Blob(state.chunks,{type:recorder.mimeType||mime||'audio/webm'});
        const ext=(blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm');
        state.file=new File([blob],'voice-'+Date.now()+'.'+ext,{type:blob.type||'audio/webm'});
        state.kind='voice';showPreview();setStatus('录音完成，点「保存到灵感」','ok');
      };
      recorder.start();
    }catch(error){setStatus('无法使用麦克风：'+friendly(error),'bad');}
  }

  function titleFor(kind,body){
    const text=(body||'').replace(/\s+/g,' ').trim();
    if(kind==='voice')return '语音灵感';
    if(kind==='image')return '图片灵感';
    if(kind==='video')return '视频灵感';
    if(kind==='link')return text.slice(0,30)||'链接收藏';
    return text.slice(0,30)||'灵感';
  }

  async function uploadFile(blob,name,space){
    if(typeof Cloud.uploadWorkbenchMedia==='function')return Cloud.uploadWorkbenchMedia(space,name,blob);
    return Cloud.uploadFile(new File([blob],name,{type:blob.type||'application/octet-stream'}));
  }

  async function save(){
    if(state.saving)return;
    const body=note.value.trim();
    if(!body&&!state.file){setStatus('写一句，或者拍/录点东西','bad');note.focus();return;}
    if(!state.session){showLogin();return;}
    state.saving=true;saveBtn.disabled=true;saveBtn.textContent='保存中…';
    const snapshot={kind:state.kind,file:state.file,space:state.space};
    try{
      let kind=snapshot.kind||'text',source_url='';
      if(!snapshot.file){
        const match=body.match(/https?:\/\/\S+/);
        if(match){kind='link';source_url=match[0];}
        else kind='text';
      }
      let file_path=null,file_name='',mime_type='';
      if(snapshot.file){
        setStatus('正在上传…');
        const upload=await prepareImage(snapshot.file);
        file_path=await uploadFile(upload,upload.name,snapshot.space);
        file_name=upload.name;mime_type=upload.type||snapshot.file.type;
      }
      const item={id:(crypto.randomUUID?crypto.randomUUID():'cap-'+Date.now()+'-'+Math.random().toString(36).slice(2)),workspace:snapshot.space,kind,title:titleFor(kind,body),body,source_url,file_path,file_name,mime_type,status:'inbox',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata:{capture:'simple'}};
      try{
        await Cloud.createInbox(item);
        reset();setStatus('已收进灵感 · Mac 上会自动出现','ok');refreshRecent();
      }catch(error){
        if(!snapshot.file){enqueue(item);reset();}
        else setStatus(friendly(error)+'，内容还在，可直接重试','bad');
      }
    }catch(error){setStatus(friendly(error)+'，内容还在，可直接重试','bad');}
    finally{state.saving=false;saveBtn.disabled=false;saveBtn.textContent='保存到灵感';}
  }

  async function refreshRecent(){
    if(!state.session)return;
    try{
      const items=await Cloud.listInbox();
      const rows=(items||[]).filter(item=>item.status!=='archived').slice(0,10);
      recent.innerHTML=rows.length?rows.map(item=>`<article class="item"><div class="row"><span>${esc(item.workspace==='personal'?'My·个人':'My·工作')} · ${esc(kindLabel[item.kind]||'记录')}</span><span class="badge">${item.status==='imported'?'已收进 Mac':'已保存'}</span></div><p>${esc(item.body||item.source_url||item.file_name||'')}</p><div class="row"><span>${esc(new Date(item.created_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}))}</span></div></article>`).join(''):'<div class="empty">还没有记录。写第一句，或拍一张。</div>';
    }catch(error){/* keep the last list */}
  }

  function init(){
    setConn();
    window.addEventListener('online',()=>{setConn();flushQueue();});
    window.addEventListener('offline',setConn);
    $('#signin').addEventListener('click',signIn);
    $('#password').addEventListener('keydown',event=>{if(event.key==='Enter')signIn();});
    document.querySelectorAll('.space').forEach(button=>button.addEventListener('click',()=>setSpace(button.dataset.space)));
    document.querySelectorAll('.quick button').forEach(button=>button.addEventListener('click',()=>{
      const act=button.dataset.act;
      document.querySelectorAll('.quick button').forEach(other=>other.classList.remove('active'));
      button.classList.add('active');
      if(act==='photo')$('#camera').click();
      if(act==='library')$('#library').click();
      if(act==='voice')toggleVoice();
      if(act==='link'){note.focus();if(navigator.clipboard&&navigator.clipboard.readText){navigator.clipboard.readText().then(text=>{if(text&&/^https?:\/\//.test(text)){note.value=text;note.focus();}}).catch(()=>{});}}
    }));
    $('#camera').addEventListener('change',event=>{pickFile(event.target.files&&event.target.files[0]);event.target.value='';});
    $('#library').addEventListener('change',event=>{pickFile(event.target.files&&event.target.files[0]);event.target.value='';});
    preview.addEventListener('click',event=>{if(event.target.closest('[data-remove]'))clearFile();});
    saveBtn.addEventListener('click',save);
    $('#refresh').addEventListener('click',refreshRecent);
    conn.addEventListener('click',async()=>{
      if(!state.session)return;
      if(!confirm('退出手机登录？'))return;
      Cloud.signOut();state.session=null;showLogin();
    });
    (async()=>{
      try{state.session=await Cloud.session();}catch{state.session=null;}
      if(state.session)showHome();else showLogin();
    })();
    setInterval(()=>{if(state.session&&document.visibilityState==='visible')refreshRecent();},20000);
  }

  document.addEventListener('DOMContentLoaded',init);
})();
