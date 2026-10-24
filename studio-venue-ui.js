/* 场地与机位面板：填大概尺寸 → 算机位/焦段/光位 → 俯视图 → 可选出参考图。 */
const VENUE_FRAMINGS=globalThis.StudioVenue.FRAMINGS;
const VENUE_WALLS=globalThis.StudioVenue.WALLS;

function venueOf(t){
  if(!t.venue||typeof t.venue!=='object')t.venue=globalThis.StudioVenue.create(t.title||'');
  const v=t.venue;
  if(!Array.isArray(v.choices))v.choices=[];
  if(!Array.isArray(v.photos))v.photos=[];
  if(!t.venuePhoto)t.venuePhoto=globalThis.StudioCore.slot('场地照片');
  return v;
}

/* 关键画面来自「0 出发点」，这里不重复录入 */
function venueFrames(t){
  const u=originUnit(t);
  return (u.frames||[]).map((f,i)=>({index:i,name:f.name||('画面'+(i+1)),stage:f.stage||'',people:f.people||'',
    seconds:Number(f.seconds)||8,camera:f.camera||'',light:f.light||''}));
}

function venueLine(label,path,value,wide=false){return `<label class="${wide?'wide':''}">${esc(label)}<input data-field="${esc(path)}" value="${esc(value??'')}"></label>`;}
function venueSelect(label,path,value,options){return `<label>${esc(label)}<select data-field="${esc(path)}">${Object.entries(options).map(([k,v])=>`<option value="${esc(k)}" ${String(value)===String(k)?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}

function venueInfoHTML(t,v,path){
  return `<section class="panel"><h2>场地信息</h2>
    <p>只要大概尺寸就够。填完就能算出机位退多远、用多长焦段、光从哪来；缺哪项会说缺哪项，不猜。</p>
    <div class="formgrid">
      ${venueLine('场地名称',`${path}.name`,v.name||'')}
      ${venueLine('净宽（米）',`${path}.width`,v.width||'')}
      ${venueLine('进深（米）',`${path}.depth`,v.depth||'')}
      ${venueLine('层高（米）',`${path}.height`,v.height||'')}
      ${venueSelect('窗户在哪面墙',`${path}.windowWall`,v.windowWall||'north',VENUE_WALLS)}
      ${venueLine('窗宽（米）',`${path}.windowWidth`,v.windowWidth||'')}
      ${venueLine('最佳光时段',`${path}.lightWindow`,v.lightWindow||'')}
      ${venueLine('电源位置',`${path}.power`,v.power||'')}
      ${venueLine('其他限制',`${path}.notes`,v.notes||'',true)}
    </div>
    <div class="actions">${btn('按常见住宅填一版（可改）','creative-venue-default',`data-id="${t.id}"`)}</div></section>`;
}

function venuePhotoHTML(t,v,path){
  const asset=globalThis.StudioCore.selected(t.venuePhoto);
  return `<section class="panel"><h2>场地照片</h2>
    <p>上传一张真实场地照片，出参考图时会以它为空间基础，只加人物和光线，不重画房间。</p>
    ${asset?`<div class="asset-location"><span>已上传 · 当前第${Math.max(0,t.venuePhoto.versions.findIndex(x=>x.id===t.venuePhoto.selectedId))+1}版</span><span><a href="${mediaURL(asset)}" target="_blank" rel="noopener">打开原图 ↗</a></span></div>`:''}
    <div class="actions">${upload(asset?'替换场地照片':'上传场地照片','creative-venue-photo',`data-id="${t.id}"`)}</div></section>`;
}

function venueShotHTML(t,v,frames,path){
  if(!frames.length)return `<section class="panel"><h2>三个画面的拍摄方案</h2><p class="muted">先到「0 出发点」生成三个关键画面，这里会自动带过来算机位。</p></section>`;
  const result=globalThis.StudioVenue.plan(v,frames);
  const rows=frames.map((frame,i)=>{
    const choice=globalThis.StudioVenue.choiceOf(v,i,frame);
    const shot=result.ready?result.shots[i]:globalThis.StudioVenue.planFrame(v,frame,choice);
    const tag=shot.fits?'<span class="badge">可拍</span>':'<span class="badge bad">需调整</span>';
    return `<details ${i===0?'open':''}><summary style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span>画面 ${i+1} · ${esc(frame.stage||'')} ${esc(frame.name)}</span><span style="flex:none">${tag}</span></summary>
      <div class="formgrid">
        ${venueSelect('画幅',`${path}.choices.${i}.framing`,choice.framing,Object.fromEntries(Object.entries(VENUE_FRAMINGS).map(([k,x])=>[k,x.label])))}
        ${venueLine('焦段（mm）',`${path}.choices.${i}.focal`,choice.focal)}
        ${venueLine('画面人数',`${path}.choices.${i}.people`,choice.people)}
        ${venueSelect('画幅比例',`${path}.choices.${i}.aspect`,choice.aspect,{'16:9':'横 16:9','4:3':'横 4:3','9:16':'竖 9:16'})}
      </div>
      <p><strong>机位：</strong>距人物 ${shot.distance} 米 · ${shot.focal}mm · 覆盖高度 ${shot.coverage} 米${shot.focal!==choice.focal?`（当前按 ${shot.focal}mm 计算）`:''}</p>
      ${shot.assumptions.map(x=>`<p class="muted">${esc(x)}</p>`).join('')}
      ${shot.warnings.map(x=>`<p class="missing">${esc(x)}</p>`).join('')}
      ${shot.light.map(x=>`<p class="muted">${esc(x.role)}：${esc(x.effect)} → ${esc(x.action)}</p>`).join('')}
      <div class="actions">${btn('出一张参考图（1次图片调用）','creative-venue-image',`data-id="${t.id}" data-index="${i}"`,true)}${btn('看这个画面的提示词','creative-venue-prompt',`data-id="${t.id}" data-index="${i}"`)}</div>
      ${venueShotImageHTML(t,i)}
    </details>`;
  }).join('');
  return `<section class="panel"><h2>三个画面的拍摄方案</h2>${result.ready?'':`<p class="missing">先补齐场地信息：${esc(result.errors.join('、'))}</p>`}
    ${rows}
    ${result.conflicts.length?`<p class="missing">${result.conflicts.map(esc).join('<br>')}</p>`:''}</section>`;
}

function venueShotImageHTML(t,index){
  const slot=(t.venueShots||[])[index];
  const asset=slot&&globalThis.StudioCore.selected(slot);
  if(!asset)return '';
  return `<div class="actions"><a class="button" href="${mediaURL(asset)}" target="_blank" rel="noopener">打开参考图 ↗</a></div>`;
}

function venueDiagramHTML(t,v,frames){
  const result=globalThis.StudioVenue.plan(v,frames);
  if(!result.ready)return '';
  return `<section class="panel"><h2>俯视机位图</h2><p class="muted">方块=机位 · 圆=人物站位（同一站位只画一次）· 扇形=取景范围。可以直接发给摄影。</p>
    ${globalThis.StudioVenue.diagramSVG(v,result.shots)}
    ${result.shots.some(s=>!s.fits)?'<p class="muted">有画面标了「需调整」，图上仍按理想机位画；按提示换焦段或改站位后再对一次。</p>':''}</section>`;
}

function creativeVenuePanel(t){
  const v=venueOf(t),frames=venueFrames(t),path=creativePath(t)+'.venue';
  const digest=globalThis.StudioVenue.digest(v,frames);
  const badge=digest.ready?'<span class="badge">场地已就绪</span>':'<span class="badge bad">场地信息未齐</span>';
  return `<section class="panel"><h2>场地与机位 ${badge}</h2>
    <p>用大概尺寸把「能不能拍」算清楚：机位退多远、用什么焦段、光从哪来、人数放不放得下。参考图只是最后一步。</p>
    ${digest.ready?`<p class="muted">${digest.shots.map(esc).join(' · ')}${digest.conflicts?` · ${digest.conflicts} 处冲突`:''}</p>`:`<p class="missing">${digest.missing.map(esc).join('、')}</p>`}
    ${t.error?`<p class="missing">${esc(t.error)}</p>`:''}</section>
    ${venueInfoHTML(t,v,path)}${venuePhotoHTML(t,v,path)}${venueShotHTML(t,v,frames,path)}${venueDiagramHTML(t,v,frames)}`;
}

async function creativeVenueAction(action,e,t){
  const v=venueOf(t),frames=venueFrames(t),path=creativePath(t)+'.venue';
  if(action==='creative-venue-default'){
    Object.assign(v,{width:v.width||4,depth:v.depth||6,height:v.height||2.8,windowWall:v.windowWall||'east',windowWidth:v.windowWidth||1.6,lightWindow:v.lightWindow||'上午 9-11 点，侧逆光',power:v.power||'门左侧'});
    save();render();return;
  }
  if(action==='creative-venue-prompt'){
    const index=Number(e.dataset.index)||0,frame=frames[index];
    if(!frame)throw Error('先在「0 出发点」生成关键画面');
    const shot=globalThis.StudioVenue.planFrame(v,frame,globalThis.StudioVenue.choiceOf(v,index,frame));
    const tone=(typeof flowFields==='function')?String(flowFields(t)?.atmosphere||''):'';
    dialog('画面 '+(index+1)+' 的参考图提示词',`<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(globalThis.StudioVenue.prompt(v,frame,shot,tone))}</pre>`,btn('关闭','close'));return;
  }
  if(action==='creative-venue-image'){
    const index=Number(e.dataset.index)||0,frame=frames[index];
    if(!frame)throw Error('先在「0 出发点」生成关键画面');
    if(!globalThis.StudioVenue.ready(v))throw Error('先补齐净宽／进深／层高，否则算不出机位');
    const photo=globalThis.StudioCore.selected(t.venuePhoto);
    if(!photo)throw Error('先上传一张真实场地照片，参考图要以它为空间基础');
    const shot=globalThis.StudioVenue.planFrame(v,frame,globalThis.StudioVenue.choiceOf(v,index,frame));
    if(!Array.isArray(t.venueShots))t.venueShots=[];
    if(!t.venueShots[index])t.venueShots[index]=globalThis.StudioCore.slot('画面'+(index+1)+'参考图');
    const slot=t.venueShots[index],keep=slot.selectedId;   /* 已有选择就保留，首次生成则自动选中新图 */
    await withJob('生成场地参考图',1,async()=>{
      try{
        const tone=(typeof flowFields==='function')?String(flowFields(t)?.atmosphere||''):'';
        const asset=await api('image',{prompt:globalThis.StudioVenue.prompt(v,frame,shot,tone),references:[photo.localId]});
        globalThis.StudioCore.putVersion(slot,asset);
        if(keep)slot.selectedId=keep;
        t.error='';
      }catch(error){t.error=error.message;}
      save();render();
    });
    return;
  }
  save();render();
}

/* 场地照片上传：不走 studio.js 的分发，避免改动公用文件 */
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('change',async event=>{
  const input=event.target;
  if(!input||!input.dataset||input.dataset.upload!=='creative-venue-photo')return;
  const file=input.files&&input.files[0];
  if(!file)return;
  const t=[...db.topics,...db.projects].find(x=>x.id===input.dataset.id);
  if(!t)return;
  venueOf(t);
  try{
    const asset=await api('upload',file);
    asset.name=file.name;
    globalThis.StudioCore.putVersion(t.venuePhoto,asset);
    save();render();notify('场地照片已保存，可以出参考图了');
  }catch(error){notify(error.message);}
});
