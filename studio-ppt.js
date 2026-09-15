(function(root,factory){if(typeof module==='object')module.exports=factory(require('./studio-core.js'));else root.StudioPpt=factory(root.StudioCore);})(globalThis,function(C){
  'use strict';
  const THEME={bg:'14121A',ink:'F6F2E9',muted:'B7AE9F',accent:'C4A96B',panel:'211D20',red:'8B0000'};
  function imageBox(a){const ratio=a.width>0&&a.height>0?a.width/a.height:4/3;const w=Math.min(12.1,4.45*ratio),h=w/ratio;return {x:.6+(12.1-w)/2,y:2.4+(4.45-h)/2,w,h};}
  function splitText(value,max=420){const out=[];let text=String(value||'');while(text.length>max){let end=text.lastIndexOf('\n',max);if(end<max/2)end=text.lastIndexOf('。',max)+1;if(end<max/2)end=max;out.push(text.slice(0,end));text=text.slice(end);}if(text)out.push(text);return out.length?out:[''];}
  async function buildDeck(PptxGenJS,item,kind,topics,getData){
    const status=kind==='project'?C.sessionStatus(item,topics):kind==='deep'?C.deepStatus(item):C.quickStatus(item);
    if(!status.ready)throw Error('不能导出完整汇报，仍缺少：'+status.missing.join('、'));
    const ppt=new PptxGenJS();ppt.layout='LAYOUT_WIDE';ppt.author='Lance';ppt.subject='内容策划汇报';ppt.title=item.title; ppt.company='Lance';ppt.lang='zh-CN';ppt.theme={headFontFace:'Microsoft YaHei',bodyFontFace:'Microsoft YaHei',lang:'zh-CN'};
    let count=0;
    function page(title,sub=''){
      const s=ppt.addSlide();s.background={color:THEME.bg};count++;
      s.addText('LANCE CONTENT STUDIO · 内容策划中心',{x:.55,y:.28,w:10,h:.25,fontSize:9,color:THEME.accent,margin:0,charSpacing:1.1});
      s.addShape(ppt.ShapeType.line,{x:.55,y:.68,w:12.1,h:0,line:{color:THEME.accent,transparency:45,width:.6}});
      s.addText(title,{x:.55,y:.95,w:12.1,h:.9,fontSize:26,color:THEME.ink,bold:true,margin:0,breakLine:false,fit:'shrink'});
      if(sub)s.addText(sub,{x:.55,y:1.95,w:12,h:.35,fontSize:12,color:THEME.muted,margin:0});
      s.addText(String(count).padStart(2,'0'),{x:12.1,y:7,w:.65,h:.2,fontSize:10,color:THEME.muted,margin:0});
      return s;
    }
    function textPages(title,body,sub){splitText(body).forEach((text,i)=>{const s=page(title+(i?'（续）':''),sub);s.addText(text,{x:.65,y:2.45,w:11.9,h:4.15,fontSize:21,color:THEME.ink,margin:0,breakLine:false,paraSpaceAfterPt:10,valign:'top',fit:'shrink'});});}
    const cover=page(item.title,kind==='project'?'专场整体创意与6条故事脚本':kind==='deep'?'深入优化与拍摄执行方案':'单条脚本快速汇报');
    cover.addText(kind==='project'?'6条故事脚本\n18套视频封面推荐\n18–30张视觉参考\n18段8秒AI视频':kind==='deep'?'完整执行方案\n25镜AI视觉参考\n完整AI成片参考':'创意与完整脚本\nA/B/C三套视频封面\n3–5张视觉参考\n开场、中间、结尾各8秒AI视频',{x:.7,y:2.85,w:10.8,h:3,fontSize:25,color:THEME.accent,margin:0,breakLine:false,paraSpaceAfterPt:8});
    if(kind==='deep'){
      textPages('已确认的故事脚本',item.quick.approved.fields.script,item.title);
      for(const[k,label]of C.DEEP)textPages(label,item.deep.fields[k],item.title);
      for(let i=0;i<item.deep.shots.length;i++){
        const shot=item.deep.shots[i];textPages(`镜 ${i+1} · ${shot.duration}秒`,`${shot.visual}\n台词与声音：${shot.dialogue}\n摄影：${shot.camera}`,item.title);
        const s=page(`镜 ${i+1} · AI视觉参考`,item.title);const a=C.selected(shot.image);const data=await getData(a);s.addImage({data,...imageBox(a)});s.addNotes(a.prompt||'AI分镜参考');
      }
      const s=page('完整AI成片参考',`${item.deep.film.duration.toFixed(2)}秒 · 25镜顺序合成 · 待人工审片`);
      const poster=await getData(C.selected(item.deep.shots[0].image));s.addImage({data:poster,x:3.76,y:2.4,w:5.8,h:4.35});
      s.addMedia({type:'video',data:await getData(item.deep.film),extn:'mp4',cover:poster,x:3.76,y:2.4,w:5.8,h:4.35});
      return ppt;
    }
    if(kind==='project')for(const[k,label]of C.SESSION)textPages(label,item.fields[k],item.title);
    const list=kind==='project'?status.items:[item];
    for(let index=0;index<list.length;index++){
      const t=list[index];const prefix=kind==='project'?`${index+1}/6 · `:'';
      for(const[k,label]of C.QUICK)textPages(prefix+label,t.quick.fields[k],t.title);
      const coverPlan=C.ensureCover(t);
      for(const option of coverPlan.options){
        const selected=option.id===coverPlan.selectedId;const s=page(`${prefix}视频封面 ${option.label}${selected?' · 首选':''}`,t.title);const a=C.selected(option.image);const data=await getData(a);
        const h=4.55,w=coverPlan.ratio==='9:16'?h*9/16:h*3/4,x=.75,y=2.42;
        s.addImage({data,x,y,w,h});
        s.addText(option.headline,{x:x+.18,y:y+h-1.15,w:w-.36,h:.64,fontSize:22,bold:true,color:'FFFFFF',fill:{color:'000000',transparency:28},margin:.08,fit:'shrink',valign:'mid'});
        s.addText(option.subheadline,{x:x+.18,y:y+h-.47,w:w-.36,h:.3,fontSize:10,color:'FFFFFF',fill:{color:'000000',transparency:28},margin:.05,fit:'shrink'});
        const tx=x+w+.55,tw=12.55-tx;
        s.addText(`${option.label} · ${option.angle}`,{x:tx,y:2.55,w:tw,h:.42,fontSize:15,bold:true,color:selected?THEME.accent:THEME.ink,margin:0});
        s.addText(`主标题\n${option.headline}\n\n辅助文案\n${option.subheadline}\n\n构图与点击逻辑\n${option.description}${selected?`\n\n首选理由\n${coverPlan.recommendation}`:''}`,{x:tx,y:3.15,w:tw,h:3.7,fontSize:16,color:THEME.ink,margin:0,breakLine:false,paraSpaceAfterPt:5,fit:'shrink',valign:'top'});
        s.addNotes(`封面底图来源：${a.source}。文字为PPT内可编辑叠加层。${a.prompt||''}`);
      }
      for(let i=0;i<t.quick.images.length;i++){
        const s=page(`${prefix}视觉参考 ${i+1}`,t.title);const a=C.selected(t.quick.images[i]);
        const data=await getData(a);s.addImage({data,...imageBox(a)});
        s.addNotes(`参考来源：${a.source}。${a.prompt||''}`);
      }
      for(const[k,label]of C.PHASES){
        const a=C.selected(t.quick.videos[k]);const s=page(`${prefix}${label}8秒AI视频`,t.title);const data=await getData(a);
        const poster=await getData(C.selected(t.quick.images[k==='ending'?t.quick.images.length-1:k==='middle'?1:0]));
        const w=a.width&&a.height?Math.min(11.7,4.35*a.width/a.height):5.8;
        s.addImage({data:poster,x:(13.333-w)/2,y:2.4,w,h:4.35});
        s.addMedia({type:'video',data,extn:'mp4',cover:poster,x:(13.333-w)/2,y:2.4,w,h:4.35});
        s.addNotes(`视频已内嵌，实际时长${a.duration}秒。${a.prompt||''}`);
      }
    }
    return ppt;
  }
  function store(){return new Promise((resolve,reject)=>{const request=indexedDB.open('lance_studio_files',1);request.onupgradeneeded=()=>request.result.createObjectStore('exports');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('成果存储无法打开'));});}
  async function putExport(id,blob){const db=await store();return new Promise((resolve,reject)=>{const tx=db.transaction('exports','readwrite');tx.objectStore('exports').put(blob,id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(Error('成果存储空间不足，未标记导出成功'));};});}
  async function getExport(id){const db=await store();return new Promise((resolve,reject)=>{const req=db.transaction('exports').objectStore('exports').get(id);req.onsuccess=()=>{db.close();resolve(req.result);};req.onerror=()=>{db.close();reject(Error('无法读取成果'));};});}
  function dataURI(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('媒体读取失败'));reader.readAsDataURL(blob);});}
  async function exportReport(item,kind,env){
    if(!window.PptxGenJS)throw Error('PPT组件未加载，请刷新或运行 npm run build');
    const cache=new Map();
    const getData=async a=>{if(!cache.has(a.localId)){const checked=await env.api('verify',{localId:a.localId,source:a.source});if(checked.kind!==a.kind||!checked.verified||a.kind==='video'&&Math.abs(checked.duration-a.duration)>.15)throw Error('素材类型或时长已变化，请重新核验');const response=await fetch(env.mediaURL(a));if(!response.ok)throw Error('素材不可读取，导出已停止');cache.set(a.localId,await dataURI(await response.blob()));}return cache.get(a.localId);};
    const ppt=await buildDeck(window.PptxGenJS,item,kind,env.db.topics,getData);
    const blob=await ppt.write({outputType:'blob'});
    const id=C.uid();await putExport(id,blob);
    env.db.exports.push({id,title:item.title,kind,sourceId:item.id,time:new Date().toISOString()});env.save();
    env.downloadBlob(blob,item.title+'.pptx');env.progress('PPT已生成并存入“成果与备份”，可重复下载');
  }
  return {buildDeck,splitText,exportReport,getExport,putExport};
});
