(function(root,factory){if(typeof module==='object')module.exports=factory(require('./studio-core.js'));else root.StudioPpt=factory(root.StudioCore);})(globalThis,function(C){
  'use strict';
  const THEME={bg:'14121A',ink:'F6F2E9',muted:'B7AE9F',accent:'C4A96B'};
  const MODES={decision:'老板决策版',full:'完整策划版',execution:'单条执行版',reverse:'视频反推报告'};
  const REPORT_FIELDS=[['recommendation','一句话主推方向'],['reason','推荐理由／为什么适合这个人物与项目'],['confirmed','已确认事实（只填写已核实的信息）'],['pending','待确认信息与假设'],['alternatives','备选方向及取舍（可留空）'],['production','拍摄安排、预算与资源边界'],['decisions','本次需要拍板的事项']];
  const ensureReport=item=>{if(!item.report||typeof item.report!=='object')item.report={};for(const[k]of REPORT_FIELDS)if(typeof item.report[k]!=='string')item.report[k]='';return item.report;};
  const modeFor=(kind,mode)=>mode||(kind==='deep'?'execution':'full');
  const excerpt=(value,max=90)=>{const s=String(value||'').trim().replace(/\s+/g,' ');return s.length>max?s.slice(0,max-1)+'…':s;};
  const chunks=(items,size)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
  // Paginate by visual lines as well as characters, including pasted scripts with short lines.
  function splitText(value,max=280){
    const result=[];let page='',units=0;const limit=8,width=36;
    for(const line of String(value||'').replace(/\r/g,'').split('\n')){
      let part='',n=0;
      const push=()=>{if(units>=limit||page.length+part.length>max){if(page.trim())result.push(page.trim());page='';units=0;}page+=(page?'\n':'')+part;units++;part='';n=0;};
      for(const char of line){const size=/[\x00-\xff]/.test(char)?.55:1;if(n+size>width)push();part+=char;n+=size;}push();
    }
    if(page.trim())result.push(page.trim());return result;
  }
  function approvedTopic(t){
    const a=t.quick.approved;if(!a)return null;
    return {...t,report:a.report||t.report,quick:{...a,fields:a.fields||{},videos:a.videos||{},images:(a.images||[]).map((image,i)=>image?.versions?image:{id:'approved-'+i,referenceNote:image?.referenceNote||'',versions:image?[image]:[],selectedId:image?.id}),cover:a.cover||C.cover()}};
  }
  function reverseStatus(item){
    const missing=[];
    if(!C.text(item?.title))missing.push('视频标题');
    if(!item?.analysis?.fields)missing.push('反推分析');
    else for(const key of ['intent','concept','outline','description','script','reuse'])if(!C.text(item.analysis.fields[key]))missing.push('反推分析：'+key);
    const evidence=(item?.analysis?.shots||[]).filter(shot=>C.assetOK(item.frames?.[shot.frameIndex],'image'));
    if(!evidence.length)missing.push('至少1张可核对的关键画面证据');
    return {ready:missing.length===0,missing,evidence:evidence.length};
  }
  function planReverseDeck(source){
    const item=C.clone(source),status=reverseStatus(item),f=item.analysis?.fields||{},slides=[];
    const overview=(title,sections)=>{const rows=sections.filter(section=>C.text(section.body));if(rows.length)slides.push({type:'summary',title,sections:rows.map(section=>({...section,display:excerpt(section.body,88)}))});};
    const textPage=(title,body,subtitle='')=>splitText(body).forEach((text,i)=>slides.push({type:'text',title:title+(i?'（续）':''),body:text,subtitle}));
    slides.push({type:'cover',title:item.title,subtitle:MODES.reverse,body:excerpt(f.concept||f.intent||'从原片证据重建创作方法',110)});
    overview('创意结论',[{label:'创作意图',body:f.intent},{label:'核心概念',body:f.concept},{label:'创意寓意',body:f.meaning}]);
    overview('叙事结构',[{label:'创意大纲',body:f.outline},{label:'叙事与表达',body:f.description},{label:'台词依据',body:f.dialogue||item.transcript}]);
    textPage('重建故事脚本',f.script,item.title);
    const seen=new Set(),evidence=[];
    for(const shot of item.analysis?.shots||[]){
      const frame=item.frames?.[shot.frameIndex];
      if(!C.assetOK(frame,'image')||seen.has(shot.frameIndex))continue;
      seen.add(shot.frameIndex);evidence.push({frame,shot});if(evidence.length===12)break;
    }
    for(const [i,entries]of chunks(evidence,3).entries())slides.push({type:'evidence',title:'关键画面证据'+(evidence.length>3?' '+(i+1):''),entries});
    overview('场景与美术',[{label:'场景',body:f.scene},{label:'场地',body:f.location},{label:'美术与道具',body:[f.art,f.props].filter(C.text).join('\n')}]);
    overview('影像与声音',[{label:'影像氛围',body:f.atmosphere},{label:'摄影调性',body:f.camera},{label:'配乐与声音',body:f.music},{label:'服装造型',body:f.costume}]);
    overview('可复用方法',[{label:'可借鉴机制',body:f.reuse},{label:'资料沉淀',body:f.archive}]);
    overview('依据与未确认事项',[{label:'分析依据',body:item.analysis?.basis||'依据原视频关键帧与已补充资料进行推断'},{label:'待核对',body:f.uncertainties||'未确认信息需结合原始策划、完整音轨与主创访谈继续核对'}]);
    return {mode:'reverse',label:MODES.reverse,draft:false,status,slides,overviewCount:slides.length};
  }
  function reportStatus(item,kind,topics=[],mode){
    if(kind==='reverse'||mode==='reverse')return reverseStatus(item);
    mode=modeFor(kind,mode);if(!MODES[mode])throw Error('未知PPT版本');
    if(mode==='execution'){
      if(kind==='project')return {ready:false,missing:['请进入一条脚本，再导出单条执行版']};
      const deep=C.deepStatus(item),approved=approvedTopic(item);
      const missing=[...deep.missing,...(approved?C.quickStatus(approved).missing.map(s=>'确认版本：'+s):[])];
      return {...deep,missing,ready:missing.length===0};
    }
    const full=kind==='project'?C.sessionStatus(item,topics):C.quickStatus(item);
    if(mode==='full')return full;
    return {...C.directionStatus(item,kind,topics),draft:!full.ready,deliveryMissing:full.missing};
  }
  function planDeck(source,kind,topics=[],mode){
    if(kind==='reverse'||mode==='reverse')return planReverseDeck(source);
    mode=modeFor(kind,mode);
    const item=C.clone(source),all=C.clone(topics),status=reportStatus(item,kind,all,mode);
    if(mode==='execution'&&item.quick?.approved?.report)item.report=C.clone(item.quick.approved.report);
    const r=ensureReport(item);
    const list=kind==='project'?item.topicIds.map(id=>all.find(t=>t.id===id)).filter(Boolean):[mode==='execution'&&item.quick.approved?approvedTopic(item):item];
    const f=kind==='project'?item.fields:list[0].quick.fields,slides=[];
    const fullStatus=kind==='project'?C.sessionStatus(item,all):C.quickStatus(list[0]);
    const draft=mode==='decision'&&!fullStatus.ready;
    const textPage=(title,body,subtitle='')=>splitText(body).forEach((text,i)=>slides.push({type:'text',title:title+(i?'（续）':''),body:text,subtitle}));
    const overview=(title,sections)=>{const rows=sections.filter(s=>C.text(s.body));if(rows.length)slides.push({type:'summary',title,sections:rows.map(s=>({...s,display:excerpt(s.body,88)}))});};
    const coverOf=t=>{const c=C.ensureCover(t);return {topic:t.title,option:c.options.find(o=>o.id===c.selectedId),ratio:c.ratio,recommendation:c.recommendation};};
    const coverReferences=list.flatMap(t=>{const c=C.ensureCover(t);return c.references.map(slot=>({topic:t.title,asset:C.selected(slot),note:slot.referenceNote||'',advice:c.referenceAdvice})).filter(entry=>C.assetOK(entry.asset,'image'));});
    const coverReferenceAdvice=list.map(t=>({topic:t.title,body:C.ensureCover(t).referenceAdvice})).filter(x=>C.text(x.body));
    const recommendation=r.recommendation||f.outline;
    slides.push({type:'cover',title:item.title,subtitle:MODES[mode],body:excerpt(recommendation,110)});
    overview('本次主张',[{label:'主推方向',body:recommendation},{label:'推荐依据',body:r.reason||f.meaning},{label:'需要决定',body:r.decisions||'待明确本轮需要确认的方向、资源与时间'}]);
    overview('需求与待确认事项',[{label:'已确认事实',body:r.confirmed||'尚未填写，请在汇报要点中核实人物、日期与业务信息'},{label:'需求记录',body:item.idea||'需求待补充'},{label:'待确认',body:r.pending||'预算、场地和拍摄日尚未在汇报要点中确认'}]);
    if(C.text(r.alternatives))overview('方向取舍',[{label:'主推',body:recommendation},{label:'备选与取舍',body:r.alternatives}]);
    overview('创意概念与寓意',[{label:'创意大纲',body:f.outline},{label:'创意描述',body:f.description},{label:'创意寓意',body:f.meaning}]);
    if(kind==='project'){
      for(const [i,group]of chunks(list,6).entries())slides.push({type:'matrix',title:'故事脚本分工'+(i?'（续）':''),rows:group.map((t,j)=>[String(i*6+j+1).padStart(2,'0'),t.title,t.report?.role||t.idea||t.quick.fields.outline||'内容任务待补充'])});
      if(!list.length)overview('故事脚本分工',[{label:'待规划',body:`本专场尚未关联故事脚本，计划${C.sessionTarget(item)}条。`}]);
      overview('场景搭建与美术',[{label:'场景搭建',body:f.scene||'待补充场地与搭建方向'},{label:'美术制景',body:f.art||'待补充美术与材质方向'}]);
    }else overview('故事与人物表达',[{label:'故事摘要',body:f.script||f.description},{label:'关键台词摘要',body:f.dialogue}]);
    overview('影像与摄影方向',[{label:'影像氛围',body:f.atmosphere||'待补充影像氛围'},{label:'摄影调性',body:f.camera||'待补充摄影方向'}]);
    const mainReference=list.flatMap(t=>t.quick.images||[]).find(slot=>C.assetOK(C.selected(slot),'image'));
    if(mainReference)slides.push({type:'image',title:'主视觉参考',asset:C.selected(mainReference),caption:mainReference.referenceNote||mainReference.label||'借鉴要点待补充'});
    if(coverReferences.length)slides.push({type:'cover-reference',title:'过往封面参考（建议）',entries:coverReferences.slice(0,3),advice:coverReferenceAdvice.map(x=>(kind==='project'?x.topic+'：':'')+x.body).join('\n')||coverReferences.map(x=>x.note).filter(C.text).join('\n')||'仅借鉴人物、文案、构图、色彩或情绪表达，不照搬具体内容。'});
    if(kind==='project'){
      for(const [i,group]of chunks(list,3).entries())slides.push({type:'covers',title:'专场首选封面'+(list.length>3?' '+(i+1):''),entries:group.map(coverOf),preferred:true});
    }else{
      const t=list[0],c=C.ensureCover(t);
      slides.push({type:'covers',title:'A/B/C封面比较',entries:c.options.map(o=>({topic:t.title,option:o,ratio:c.ratio,selected:o.id===c.selectedId})),preferred:false});
      overview('首选封面与选择依据',[{label:'首选方案',body:coverOf(t).option.headline||'封面主标题待补充'},{label:'推荐理由',body:c.recommendation||'待补充推荐理由'}]);
    }
    overview('制作安排与资源边界',[{label:'拍摄与制作',body:r.production||'拍摄日、人员、场地、设备和预算待确认'},{label:'限制与假设',body:r.pending||'尚未填写执行限制'}]);
    overview('本次需要拍板',[{label:'决策事项',body:r.decisions||'主推方向、人物表达、场景规模与拍摄安排待确认'},{label:'后续交付',body:mode==='execution'?'按已确认方向执行，逐镜审查表演、声音、剪辑和连续性':'方向确认后补齐媒体参考，并进入25镜深化与AI成片参考'}]);
    if(draft)overview('素材待办',[{label:'当前状态',body:'方向讨论稿。完整快速汇报的素材尚未齐备。'},{label:'缺项摘要',body:fullStatus.missing.join('、')}]);
    const overviewCount=slides.length;
    if(mode==='decision')return {mode,label:MODES[mode],draft,status,slides,overviewCount};
    slides.push({type:'divider',title:'完整策划附件',body:kind==='project'?'整体方案及每条故事的脚本、封面与媒体参考':'完整故事、封面推荐、视觉与三段8秒AI视频'});
    for(const[k,label]of REPORT_FIELDS)textPage(label,r[k],'汇报要点全文');
    if(kind==='project')for(const[k,label]of C.SESSION)textPage(label,item.fields[k],item.title);
    for(const [index,t]of list.entries()){
      if(kind==='project')slides.push({type:'divider',title:(index+1)+' / '+list.length+'  '+t.title,body:excerpt(t.report?.role||t.idea,150)});
      for(const[k,label]of C.QUICK)textPage(label,t.quick.fields[k],t.title);
      const c=C.ensureCover(t);
      if(kind==='project')slides.push({type:'covers',title:'A/B/C封面比较',subtitle:t.title,entries:c.options.map(o=>({topic:t.title,option:o,ratio:c.ratio,selected:o.id===c.selectedId}))});
      for(const o of c.options){
        const body='主标题：'+o.headline+'\n辅助文案：'+o.subheadline+'\n构图与点击逻辑：'+o.description+(o.id===c.selectedId?'\n首选理由：'+c.recommendation:'');
        slides.push({type:'image',title:'封面'+o.label+(o.id===c.selectedId?' 首选':''),subtitle:t.title,asset:C.selected(o.image),cover:{option:o,ratio:c.ratio},caption:excerpt(o.description,100),notes:body});
        textPage('封面'+o.label+' 文案与推荐逻辑',body,t.title);
      }
      for(const [i,slot]of t.quick.images.entries())slides.push({type:'image',title:'视觉参考 '+(i+1),subtitle:t.title,asset:C.selected(slot),caption:slot.referenceNote||slot.label||'借鉴要点待补充',notes:slot.referenceNote||''});
      for(const[k,label]of C.PHASES)slides.push({type:'video',title:label+'8秒AI视频',subtitle:t.title,asset:C.selected(t.quick.videos[k]),poster:C.selected(t.quick.images[k==='ending'?t.quick.images.length-1:k==='middle'?1:0]),caption:t.quick.videos[k]?.referenceNote||'验证'+label+'的动作、镜头与节奏'});
    }
    if(mode==='execution'){
      slides.push({type:'divider',title:'拍摄执行与25镜',body:'以已确认的故事版本为依据'});
      for(const[k,label]of C.DEEP)textPage(label,item.deep.fields[k],item.title);
      item.deep.shots.forEach((shot,i)=>{
        const body='画面：'+shot.visual+'\n台词与声音：'+shot.dialogue+'\n摄影：'+shot.camera;
        slides.push({type:'image',title:'镜 '+String(i+1).padStart(2,'0')+'  '+shot.duration+'秒',subtitle:item.title,asset:C.selected(shot.image),caption:excerpt(shot.visual,90),notes:body});
        textPage('镜 '+String(i+1).padStart(2,'0')+' 执行说明',body,item.title);
      });
      slides.push({type:'video',title:'完整AI成片参考',subtitle:item.title,asset:item.deep.film,poster:C.selected(item.deep.shots[0]?.image),caption:Number(item.deep.film?.duration||0).toFixed(2)+'秒，按25镜顺序合成，待人工审片'});
    }
    return {mode,label:MODES[mode],draft,status,slides,overviewCount};
  }
  // The same plan drives the export outline and the existing browser PPT renderer.
  async function buildDeck(PptxGenJS,item,kind,topics,getData,mode){
    const status=reportStatus(item,kind,topics,mode);
    if(!status.ready)throw Error('不能导出，仍缺少：'+status.missing.join('、'));
    const plan=planDeck(item,kind,topics,mode),ppt=new PptxGenJS();
    ppt.layout='LAYOUT_WIDE';ppt.author='Lance';ppt.company='Lance';ppt.title=item.title+' · '+plan.label;ppt.subject=plan.label;ppt.lang='zh-CN';
    ppt.theme={headFontFace:'Microsoft YaHei',bodyFontFace:'Microsoft YaHei',lang:'zh-CN'};
    const txt=(s,text,x,y,w,h,size=21,color=THEME.ink,bold=false)=>s.addText(String(text||''),{x,y,w,h,fontFace:'Microsoft YaHei',fontSize:size,color,bold,margin:0,breakLine:false,valign:'top',paraSpaceAfterPt:8});
    const fit=(a,x,y,w,h)=>{const ratio=a?.width>0&&a?.height>0?a.width/a.height:4/3;const iw=Math.min(w,h*ratio),ih=iw/ratio;return {x:x+(w-iw)/2,y:y+(h-ih)/2,w:iw,h:ih};};
    async function addImage(s,a,box){if(!C.assetOK(a,'image')){txt(s,'图片待补充',box.x,box.y+box.h/2-.2,box.w,.5,18,THEME.muted);return;}s.addImage({data:await getData(a),...fit(a,box.x,box.y,box.w,box.h)});}
    async function drawCover(s,entry,x,y,w,h){
      const a=C.selected(entry.option.image),ratio=entry.ratio==='9:16'?9/16:3/4,cw=Math.min(w,h*ratio),ch=cw/ratio,box={x:x+(w-cw)/2,y:y+(h-ch)/2,w:cw,h:ch};
      if(C.assetOK(a,'image')){const data=await getData(a);s.addImage({data,x:box.x,y:box.y,w:a.width>0&&a.height>0?a.width/a.height:4/3,h:1,sizing:{type:'cover',w:box.w,h:box.h}});}else txt(s,'封面图片待补充',box.x,box.y+box.h/2-.2,box.w,.5,18,THEME.muted);
      s.addText(excerpt(entry.option.headline,26),{x:box.x+.12,y:box.y+box.h-.92,w:box.w-.24,h:.57,fontSize:19,color:'FFFFFF',bold:true,margin:.04,fill:{color:'000000',transparency:25},fit:'shrink'});s.addText(excerpt(entry.option.subheadline,38),{x:box.x+.12,y:box.y+box.h-.32,w:box.w-.24,h:.25,fontSize:10,color:'FFFFFF',margin:.03,fill:{color:'000000',transparency:25},fit:'shrink'});
    }
    for(const [index,p]of plan.slides.entries()){
      const s=ppt.addSlide();s.background={color:THEME.bg};
      txt(s,'LANCE  内容策划',.6,.28,7,.25,10,THEME.accent);
      txt(s,plan.draft?'方向讨论稿 · 素材待补齐':plan.label,9,.28,3.7,.25,10,THEME.muted);
      txt(s,String(index+1).padStart(2,'0'),12.1,7.07,.65,.22,10,THEME.muted);
      const title=excerpt(p.title,48),size=title.length>27?27:32;
      txt(s,title,.65,.86,12.05,1.12,size,THEME.ink,true);
      if(p.subtitle&&p.type!=='cover')txt(s,excerpt(p.subtitle,70),.68,2.04,11.95,.34,13,THEME.muted);
      let notes=p.notes||'';
      if(p.type==='cover'||p.type==='divider'){
        txt(s,p.subtitle||'',.7,2.6,11.8,.5,23,THEME.accent);
        txt(s,p.body,.7,3.5,10.8,2.65,30,THEME.ink);
      }else if(p.type==='summary'){
        const rowHeight=4.35/Math.max(p.sections.length,1);
        p.sections.forEach((v,i)=>{const y=2.46+i*rowHeight;txt(s,v.label,.7,y,2.1,.58,19,THEME.accent,true);txt(s,v.display,3,y,9.5,rowHeight-.15,21);});
        notes=p.sections.map(v=>v.label+'\n'+v.body).join('\n\n');
      }else if(p.type==='text')txt(s,p.body,.7,2.48,11.9,4.32,22);
      else if(p.type==='matrix'){
        s.addTable([['序号','片名','内容任务摘要'],...p.rows.map(r=>[r[0],excerpt(r[1],26),excerpt(r[2],58)])],{x:.7,y:2.45,w:11.9,h:4.25,colW:[.65,3.3,7.95],rowH:.6,fontFace:'Microsoft YaHei',fontSize:16,color:THEME.ink,fill:THEME.bg,border:{type:'solid',pt:.5,color:'514838'},margin:.055,bold:false,autoPage:false});
        notes=p.rows.map(r=>r.join('\n')).join('\n\n');
      }else if(p.type==='covers'){
        for(const [i,entry]of p.entries.entries()){
          const x=.75+i*4.15;txt(s,p.preferred?excerpt(entry.topic,18):entry.option.label+'  '+entry.option.angle+(entry.selected?'  首选':''),x,2.44,3.7,.5,18,THEME.accent,true);
          await drawCover(s,entry,x,3.02,3.5,3.6);
          notes+='\n'+entry.topic+'\n'+entry.option.label+' '+entry.option.headline+'\n'+entry.option.subheadline+'\n'+entry.option.description+'\n'+(entry.recommendation||'');
        }
      }else if(p.type==='cover-reference'){
        const count=p.entries.length;
        if(count){const areaW=7.7,gap=.25,w=(areaW-gap*(count-1))/count;for(const [i,entry]of p.entries.entries()){const x=.72+i*(w+gap);txt(s,excerpt(entry.topic,18),x,2.42,w,.34,12,THEME.muted);await addImage(s,entry.asset,{x,y:2.85,w,h:3.9});}}
        txt(s,'建议',8.75,2.5,3.8,.4,17,THEME.accent,true);txt(s,p.advice,8.75,3.05,3.75,3.55,21,THEME.ink);
        notes='过往封面仅作为参考建议，不等同于高点击结论。\n'+p.advice+p.entries.map(entry=>'\n'+entry.topic+'：'+(entry.note||'未填写单图借鉴要点')+'\n素材来源：'+(entry.asset.source||'上传')).join('');
      }else if(p.type==='evidence'){
        const gap=.3,w=(11.9-gap*(p.entries.length-1))/Math.max(p.entries.length,1);
        for(const [i,entry]of p.entries.entries()){
          const x=.7+i*(w+gap),shot=entry.shot;
          await addImage(s,entry.frame,{x,y:2.42,w,h:2.75});
          txt(s,Number(shot.timestamp??entry.frame.timestamp??0).toFixed(2)+'秒',x,5.31,w,.3,13,THEME.accent,true);
          txt(s,excerpt(shot.visual,42),x,5.68,w,.62,16,THEME.ink,true);
          txt(s,excerpt(shot.camera,55),x,6.34,w,.48,13,THEME.muted);
          notes+='\n证据 '+(i+1)+' · '+Number(shot.timestamp??entry.frame.timestamp??0).toFixed(2)+'秒\n画面：'+shot.visual+'\n摄影：'+shot.camera+'\n台词依据：'+shot.dialogue+'\n依据与限制：'+shot.note+'\n素材来源：'+(entry.frame.source||'原片提帧')+'\n';
        }
      }else if(p.type==='image'){
        if(p.cover)await drawCover(s,p.cover,.8,2.42,11.7,3.95);else await addImage(s,p.asset,{x:.8,y:2.42,w:11.7,h:3.95});
        txt(s,excerpt(p.caption,96),.8,6.45,11.7,.57,16,THEME.muted);
      }else if(p.type==='video'){
        const data=await getData(p.asset),poster=await getData(p.poster),box=fit(p.asset,.8,2.42,11.7,3.95);
        s.addImage({data:poster,x:box.x,y:box.y,w:p.poster.width>0&&p.poster.height>0?p.poster.width/p.poster.height:4/3,h:1,sizing:{type:'cover',w:box.w,h:box.h}});s.addMedia({type:'video',data,extn:'mp4',cover:poster,...box});
        txt(s,excerpt(p.caption,96),.8,6.45,11.7,.57,16,THEME.muted);notes+='\n内嵌MP4。实际时长：'+p.asset.duration+'秒';
      }
      if(p.asset)notes+='\n素材来源：'+p.asset.source+'\n'+(p.asset.prompt||'')+'\n'+(p.asset.provenance||'');
      if(plan.draft)notes+='\n完整交付缺项：'+status.deliveryMissing.join('、');
      if(notes)s.addNotes(notes);
    }
    return ppt;
  }
  function store(){return new Promise((resolve,reject)=>{const request=indexedDB.open('lance_studio_files',1);request.onupgradeneeded=()=>request.result.createObjectStore('exports');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('成果存储无法打开'));});}
  async function putExport(id,blob){const db=await store();return new Promise((resolve,reject)=>{const tx=db.transaction('exports','readwrite');tx.objectStore('exports').put(blob,id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(Error('成果存储空间不足，未标记导出成功'));};});}
  async function getExport(id){const db=await store();return new Promise((resolve,reject)=>{const req=db.transaction('exports').objectStore('exports').get(id);req.onsuccess=()=>{db.close();resolve(req.result);};req.onerror=()=>{db.close();reject(Error('无法读取成果'));};});}
  function dataURI(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('媒体读取失败'));reader.readAsDataURL(blob);});}
  function filename(record){return record.filename||record.title+(record.mode?'_'+(MODES[record.mode]||record.mode)+(record.draft?'_方向讨论稿':''):'')+'.pptx';}
  async function exportReport(item,kind,env,mode){
    if(!window.PptxGenJS)throw Error('PPT组件未加载，请刷新或运行 npm run build');
    // Freeze the source while verification and packaging await network/media reads.
    item=C.clone(item);const topics=C.clone(env.db.topics||[]),plan=planDeck(item,kind,topics,mode),cache=new Map();
    const getData=async a=>{if(!a)throw Error('素材缺失');if(!cache.has(a.localId)){const checked=await env.api('verify',{localId:a.localId,source:a.source});if(checked.kind!==a.kind||!checked.verified||a.kind==='video'&&Math.abs(checked.duration-a.duration)>.15)throw Error('素材类型或时长已变化，请重新核验');const response=await fetch(env.mediaURL(a));if(!response.ok)throw Error('素材不可读取，导出已停止');cache.set(a.localId,await dataURI(await response.blob()));}return cache.get(a.localId);};
    const ppt=await buildDeck(window.PptxGenJS,item,kind,topics,getData,plan.mode),blob=await ppt.write({outputType:'blob'});
    const id=C.uid();await putExport(id,blob);
    const record={id,title:item.title,kind,mode:plan.mode,draft:plan.draft,slideCount:plan.slides.length,sourceId:item.id,time:new Date().toISOString()};
    record.filename=filename(record);env.db.exports.push(record);env.save();env.downloadBlob(blob,record.filename);env.progress(plan.label+'已生成并存入“成果与备份”，可重复下载');
  }
  return {MODES,REPORT_FIELDS,ensureReport,reportStatus,reverseStatus,planDeck,planReverseDeck,approvedTopic,filename,buildDeck,splitText,exportReport,getExport,putExport};
});
