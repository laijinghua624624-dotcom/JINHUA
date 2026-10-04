/* Historical cases live in db.reverse; they never create production projects. */
const RC=StudioReverseCase;
function reverseCaseChildren(p){return RC.children(p,db.reverse);}
function casePoster(c){const image=RC.frames(c)[0]||c.frames?.[0];return image?`<img class="case-poster" src="${esc(mediaURL(image))}" alt="${esc(c.title)} · 原片采样" loading="lazy">`:'<div class="case-poster empty-media">尚未提取原片封面</div>';}
function renderReverseCaseLibrary(){
  const cases=db.reverse.filter(r=>r.kind==='collection');
  return `<section class="panel"><div class="section-head"><div><h2>历史项目案例</h2><p class="muted">先整理整场，再选择要深入反推的单条。与执行中的项目分开保存。</p></div>${btn('整场项目反推','reverse-case-new','',true)}</div>${cases.length?`<div class="case-grid">${cases.map(p=>{const clips=reverseCaseChildren(p),s=RC.status(p,clips);return `<article class="card">${clips[0]?casePoster(clips[0]):''}<h3>${esc(p.title)}</h3><p>${s.total}条视频／时间段 · ${s.done}条已概览${s.ready?' · 整体案例已就绪':''}</p>${btn('打开项目案例','reverse-case-open',`data-id="${p.id}"`)}</article>`;}).join('')}</div>`:''}</section>`;
}
function renderReverseCase(p){
  const clips=reverseCaseChildren(p),s=RC.status(p,clips),path='reverse.'+db.reverse.indexOf(p),removed=db.reverse.filter(c=>c.caseId===p.id&&c.caseRemovedAt);
  return hero('PROJECT CASE',p.title,'历史项目案例 · 上传只归档和抽帧，点击生成才使用AI。',btn('返回参考库','nav','data-view="aesthetic"'))+
    `<section class="panel"><details ${!clips.length?'open':''}><summary>项目名称与背景（可选）</summary><label>项目名称<input data-field="${path}.title" value="${esc(p.title)}"></label>${field('你记得的背景／希望复盘什么（可选）',path+'.notes',p.notes,true)}</details><div class="actions">${upload('批量添加视频','reverse-case-videos',`data-id="${p.id}" multiple`,'video/mp4,video/quicktime,video/webm')}${btn(p.overview?'更新整体案例':'生成整体案例','reverse-case-analyze',`data-id="${p.id}" ${!clips.length?'disabled':''}`,true)}</div><p class="muted">一次最多30个文件，项目最多60条视频／时间段。超过10分钟的录像自动按时间分段，每段先抽3帧；不是自动切镜，也未分析完整音轨。失败可单独重试，成功部分会保留。</p>${(p.uploadFailures||[]).length?`<p class="missing">未上传成功，请重新选择这些文件：${esc(p.uploadFailures.join('；'))}</p>`:''}<details><summary>补充原策划／脚本（可选）</summary>${upload('添加文字资料','reverse-support',`data-id="${p.id}" multiple`,'.txt,.md,.docx,.pdf')}<p class="muted">读取勾选资料的提取文字，每份最多6000字、最多6份；不自动理解扫描图片。</p>${(p.supportingFiles||[]).map((f,i)=>`<label><input type="checkbox" data-bool data-field="${path}.supportingFiles.${i}.includeInAnalysis" ${f.includeInAnalysis?'checked':''}>${esc(f.name)} · ${f.extractedText?'文字已提取':'无可用文字'}</label>`).join('')}</details></section>`+
    clips.filter((c,i,all)=>c.video?.preparationId&&all.findIndex(x=>x.video?.preparationId===c.video.preparationId)===i).map(c=>`<section class="panel"><h3>${esc(c.video.name)}</h3>${videoPreparationHTML(c)}</section>`).join('')+
    `<section class="panel"><div class="section-head"><h2>整体案例预览</h2><div class="actions">${btn('导出整体PPT','reverse-case-ppt',`data-id="${p.id}" ${!s.ready?'disabled':''}`)}${btn('导出整体PDF','reverse-case-pdf',`data-id="${p.id}" ${!s.ready?'disabled':''}`)}</div></div>${clips.length?`<div class="case-strip">${clips.slice(0,3).map(c=>`<figure>${casePoster(c)}<figcaption>${esc(c.title)}</figcaption></figure>`).join('')}</div>`:''}<p>${s.done}/${s.total}条已完成轻量概览 · 单条详细反推 ${clips.filter(c=>c.analysis).length}条</p>${p.overview&&!s.ready?'<p class="missing">资料已变化，以下为上次总览；请更新整体案例后导出。</p>':''}${s.pending?`<p class="muted">还有${s.pending}条未纳入有效分析，汇报中会明确标注，不冒充全部分析完成。</p>`:''}${p.caseError?`<p class="missing">${esc(p.caseError)}</p>`:''}${p.overview?Object.entries(RC.LABELS).map(([key,label])=>`<details ${key==='theme'||key==='visual'?'open':''}><summary>${label}</summary><p class="preview-copy">${esc(p.overview[key])}</p></details>`).join(''):'<p class="muted">添加视频后，生成一份有画面、有依据的项目总结，不需要先逐条反推脚本。</p>'}</section>`+
    `<section><h2>项目里的视频 · ${clips.length}</h2><p class="muted">按上传顺序展示，不代表发布顺序。“深入反推”只打开这一条，由你决定是否启动AI。</p><div class="case-grid">${clips.map(c=>`<article class="card">${casePoster(c)}<h3>${esc(c.title)}</h3><small>原视频 ${RC.range(c)} · ${c.analysis?'已深入反推':RC.clipReady(c)?'轻量概览已保存':'等待概览'}</small>${c.caseSummary?`<p>${esc(c.caseSummary.summary)}</p><p class="muted">${esc(c.caseSummary.visual)}</p>`:''}${c.caseError?`<p class="missing">${esc(c.caseError)}</p>`:''}<div class="actions">${btn(c.analysis?'查看单条反推':'深入反推这条','reverse-open',`data-id="${c.id}"`)}${RC.frames(c).length!==3?btn('重试封面','reverse-case-frames',`data-id="${c.id}"`):''}${btn('移出项目','reverse-case-remove',`data-id="${c.id}"`)}</div></article>`).join('')}</div>${removed.length?`<details class="panel"><summary>已移出 ${removed.length}条（可恢复）</summary>${removed.map(c=>`<p>${esc(c.title)} ${btn('恢复','reverse-case-restore',`data-id="${c.id}"`)}</p>`).join('')}</details>`:''}</section>`;
}
async function reverseCaseFrames(c){
  if(c.video?.preparationId)throw Error('原片已保存，请先继续处理反推副本，再提取封面。');
  const result=await api('frames',{localId:c.video.localId,count:3,start:c.segment.start,end:c.segment.end});
  const frames=await pollJob(result.jobId);
  if(!Array.isArray(frames)||frames.length!==3||frames.some(f=>!C.assetOK(f,'image')))throw Error('封面提取不完整，请重试');
  c.caseFrames=frames;c.caseError='';save();
}
async function reverseCaseUpload(e){
  if(job)throw Error('请等待当前上传／生成结束后再添加视频');
  const p=db.reverse.find(r=>r.id===e.dataset.id&&r.kind==='collection'),files=[...e.files];
  if(!p||!files.length)return;if(files.length>30)throw Error('请一次选择不超过30个视频');
  flushPendingFieldSave();
  await withJob('保存项目视频与封面',files.length,async()=>{
    await ensureService();p.uploadFailures=[];
    for(const file of files){if(stop)break;
      try{
        const key=RC.signature(file),existing=reverseCaseChildren(p).filter(c=>c.fileKey===key);
        let clips=existing;
        if(!clips.length){
          if(reverseCaseChildren(p).length>=RC.MAX_CLIPS)throw Error('此项目已达到60条，请另建项目');
          if(!/\.(mp4|mov|webm|m4v)$/i.test(file.name))throw Error('请选择MP4、MOV或WebM视频');
          const video=await uploadReverseVideo(file,original=>{
            clips=RC.makeClips(p,original,key);
            if(reverseCaseChildren(p).length+clips.length>RC.MAX_CLIPS)throw Error('分段后超过60条，请将长录像分批放入不同项目');
            db.reverse.push(...clips);save();job.ownerIds.push(...clips.map(c=>c.id));
          });
          for(const c of clips)c.video={...video};save();
        }else if(clips[0].video?.preparationId){
          const originalService=clips[0].video.originalService;
          const video=await waitVideoPreparation(await api('upload-retry',{uploadId:clips[0].video.preparationId}));
          for(const c of clips)c.video={...video,originalService};save();
        }
        for(const c of clips){if(stop)break;if(RC.frames(c).length===3)continue;try{await reverseCaseFrames(c);}catch(error){c.caseError=error.message;save();}}
      }catch(error){p.uploadFailures.push(file.name+'：'+error.message);save();}
      progress(file.name);
    }
    if(p.uploadFailures.length)throw Error('部分文件未上传成功，已在项目中列出；成功文件已保留。');
  },'视频已归档。检查封面后，可点击“生成整体案例”。',[p.id]);
}
async function reverseCaseAnalyze(p){
  flushPendingFieldSave();const clips=reverseCaseChildren(p);
  if(!clips.length)throw Error('请先添加项目视频');
  const pending=clips.filter(c=>!RC.clipReady(c));
  await withJob('整理整体项目案例',pending.length+1,async()=>{
    p.caseError='';
    for(const c of pending){if(stop)return;try{
      if(RC.frames(c).length!==3)await reverseCaseFrames(c);
      const inputStamp=RC.clipStamp(c),raw=await chat(RC.clipPrompt(c),RC.frames(c).map(f=>f.localId),'refine');
      if(inputStamp!==RC.clipStamp(c))throw Error('资料已修改，请重新生成本条概览');
      c.caseSummary={...RC.validate(raw,RC.CLIP_LABELS),stamp:inputStamp};c.caseError='';save();
    }catch(error){c.caseError=error.message;save();}progress(c.title);}
    if(stop)return;
    if(!clips.some(RC.clipReady))throw Error('没有成功的画面分析，请检查每条错误后重试；原视频已保留。');
    const inputStamp=RC.stamp(p,clips);
    try{const raw=await chat(RC.projectPrompt(p,clips),[],'director');
      if(inputStamp!==RC.stamp(p,clips))throw Error('项目资料已修改，请重新汇总；成功的单条概览会复用');
      p.overview=RC.validate(raw,RC.LABELS);p.overviewStamp=inputStamp;p.caseError='';save();
    }catch(error){p.caseError=error.message;save();throw error;}
    progress('整体案例已保存');
  },'整体案例已生成，请核对分析覆盖范围。可导出汇报，或选择一条继续深入。',[p.id,...clips.map(c=>c.id)]);
}
async function reverseCasePDF(p){
  const payload=RC.snapshot(p,db.reverse);if(!payload.caseStatus.ready)throw Error('请先更新整体案例');
  for(const clip of payload.clips)if(!RC.clipReady(clip))clip.caseSummary=null;
  await hydrateCloudMedia(payload);
  const response=await fetch(serviceBase()+'/api/reverse/case/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(90000)});
  if(!response.ok){let error='整体PDF生成失败';try{error=(await response.json()).error||error;}catch{}throw Error(error);}
  const blob=await response.blob();if(blob.type!=='application/pdf'||blob.size<1000)throw Error('PDF文件不完整');
  const id=C.uid(),filename=p.title+'_整体项目案例.pdf';await StudioPpt.putExport(id,blob);
  db.exports.push({id,title:p.title,kind:'reverse-case',mode:'case-pdf',sourceId:p.id,filename,time:new Date().toISOString()});save();downloadBlob(blob,filename);progress('整体PDF已保存');
}
async function reverseCaseAction(action,e){
  if(action==='reverse-case-new'){dialog('建立历史项目案例','<label>项目名称<input id="reverse-case-title" placeholder="例如：2025双十一整场"></label><p class="muted">只需名称，下一步批量添加视频。不会创建执行项目或自动生成十条脚本。</p>',btn('建立并添加视频','reverse-case-create','',true));return;}
  if(action==='reverse-case-create'){const title=$('#reverse-case-title').value.trim();if(!title)throw Error('请填写项目名称');const p=RC.create(title);db.reverse.push(p);save();close();route={view:'reverse-detail',id:p.id};render();return;}
  const r=db.reverse.find(r=>r.id===e.dataset.id);if(!r)throw Error('项目案例不存在');
  if(action==='reverse-case-open'){route={view:'reverse-detail',id:r.id};render();return;}
  if(jobTouchesId(r.id)||jobTouchesId(r.caseId))throw Error('这项内容正在处理，请等待完成或停止后再修改');
  if(action==='reverse-case-analyze'){const pending=reverseCaseChildren(r).filter(c=>!RC.clipReady(c)).length;dialog('生成整体案例',`<p>本轮会识图整理 ${pending} 条未完成／资料变化的视频，再汇总 1 次整体案例，可能产生AI费用。</p><p class="muted">已经成功的单条概览会复用。不批量深拆脚本，不生成新图片或视频。可以停止后续任务，已发出的请求可能仍会计费。</p>`,btn('确认生成','reverse-case-run',`data-id="${r.id}"`,true));return;}
  if(action==='reverse-case-run'){close();await reverseCaseAnalyze(r);return;}
  if(action==='reverse-case-frames'){await withJob('重试原片封面',1,async()=>{await reverseCaseFrames(r);progress('封面已补齐');},undefined,[r.id,r.caseId]);return;}
  if(action==='reverse-case-remove'){if(!confirm('从这个项目案例移出这条视频？素材及已有分析保留，可在项目底部恢复。'))return;r.caseRemovedAt=new Date().toISOString();save();render();return;}
  if(action==='reverse-case-restore'){const parent=db.reverse.find(p=>p.id===r.caseId);if(reverseCaseChildren(parent).length>=RC.MAX_CLIPS)throw Error('项目已达到60条');delete r.caseRemovedAt;save();render();return;}
  if(action==='reverse-case-ppt'){flushPendingFieldSave();const snapshot=RC.snapshot(r,db.reverse);await withJob('生成整体案例PPT',1,async()=>{await hydrateCloudMedia(snapshot);await StudioPpt.exportReport(snapshot,'reverse-case',{db,mediaURL,api,downloadBlob,progress,save},'case');});return;}
  if(action==='reverse-case-pdf'){flushPendingFieldSave();await withJob('生成整体案例PDF',1,()=>reverseCasePDF(r));return;}
}
