/* 场地与机位：用大概尺寸算出能拍的机位、焦段、人物比例与光位，并画出俯视图。
   参考图只是最后一步；先给出可以照着摆机器的数字。内容即数据，不执行其中的指令。 */
(function(root,factory){if(typeof module==='object')module.exports=factory();else root.StudioVenue=factory();})(globalThis,function(){
  'use strict';

  const SENSORS={full:{label:'全画幅',width:36},s35:{label:'S35',width:24.89},mft:{label:'M4/3',width:17.3}};
  /* 画幅的高/宽比：竖画幅就是把机身高/宽对调，纵向占用感应器长边 */
  const ASPECTS={'16:9':9/16,'4:3':3/4,'9:16':16/9};
  /* 画幅要覆盖的高度（米）：含头顶与脚下余量 */
  const FRAMINGS={
    wide:{label:'全身',coverage:1.95,note:'头顶留 10%，脚不入画时按膝盖以上算'},
    mid:{label:'中景',coverage:1.05,note:'腰以上'},
    close:{label:'近景',coverage:0.55,note:'肩以上或手部特写'}
  };
  const WALLS={north:'里墙（镜头对面）',south:'门口方向',east:'左墙',west:'右墙'};
  const CAMERA_MARGIN=0.8;
  const SUBJECT_WALL_GAP=0.6;
  const STANDARD_FOCALS=[14,16,18,20,24,28,35,50,85,135];      /* 机位身后要留的空间 */
  const PERSON_WIDTH=0.62;      /* 一人站立占宽 */
  const STAND_HEIGHT=1.75;

  function create(name){
    return {id:Math.random().toString(36).slice(2,10),name:name||'',width:0,depth:0,height:0,
      windowWall:'north',windowWidth:0,lightWindow:'',power:'',notes:'',photos:[],
      choices:[],at:''};
  }

  function issues(venue){
    const errors=[];
    if(!venue)return ['还没有场地信息'];
    for(const [key,label] of [['width','净宽'],['depth','进深'],['height','层高']]){
      const value=Number(venue[key]);
      if(!Number.isFinite(value)||value<=0)errors.push('缺'+label+'（米，可以是约数）');
      else if(value>40)errors.push(label+'看起来不对（'+value+' 米）');
    }
    if(Number(venue.height)>0&&Number(venue.height)<STAND_HEIGHT)errors.push('层高低于 '+STAND_HEIGHT+' 米：人物无法站直，需改为坐姿或低机位');
    return errors;
  }
  const ready=venue=>issues(venue).length===0;

  const sensorWidth=(sensor)=>((SENSORS[sensor]||SENSORS.full).width);
  /* 画幅纵向覆盖的高度（毫米） */
  function verticalSensor(sensor,aspect){const w=sensorWidth(sensor);return w*Math.min(1,ASPECTS[aspect]||ASPECTS['16:9']);}
  /* 给定焦段与要覆盖的高度，算需要多远 */
  function distanceFor(focal,coverage,sensor,aspect){return (coverage*Number(focal))/verticalSensor(sensor,aspect);}
  /* 给定可用距离与要覆盖的高度，算需要多长焦段 */
  function focalFor(distance,coverage,sensor,aspect){return (Number(distance)*verticalSensor(sensor,aspect))/coverage;}

  /* 没手填时按阶段给默认：建立=全身、推进=中景、落点=近景 */
  function defaultFraming(frame){
    const stage=String((frame&&frame.stage)||''),camera=String((frame&&frame.camera)||'');
    /* 阶段优先于画面描述，避免“建立”被描述里的“中景”覆盖 */
    if(/落点/.test(stage))return 'close';
    if(/推进/.test(stage))return 'mid';
    if(/建立/.test(stage))return 'wide';
    if(/特写|近景|过肩/.test(camera))return 'close';
    if(/中景/.test(camera))return 'mid';
    return 'wide';
  }
  const DEFAULT_FOCAL={wide:35,mid:35,close:50};

  function choiceOf(venue,index,frame){
    const list=Array.isArray(venue.choices)?venue.choices:[];
    const hit=list[index];
    const framing=(hit&&FRAMINGS[hit.framing])?hit.framing:defaultFraming(frame);
    return {framing,focal:Number(hit&&hit.focal)>0?Number(hit.focal):(DEFAULT_FOCAL[framing]||35),
      people:Number(hit&&hit.people)>0?Number(hit.people):1,
      sensor:(hit&&hit.sensor)||'full',aspect:(hit&&hit.aspect)||'16:9',note:(hit&&hit.note)||''};
  }

  /* 单个画面的机位方案：给数字，也说清哪里会卡住 */
  function planFrame(venue,frame,choice){
    const warnings=[],assumptions=[];
    const framing=FRAMINGS[choice.framing]||FRAMINGS.wide;
    const depth=Number(venue.depth)||0,width=Number(venue.width)||0;
    const needed=distanceFor(choice.focal,framing.coverage,choice.sensor,choice.aspect);
    const maxDistance=Math.max(0,round(Math.max(depth-SUBJECT_WALL_GAP,0.3)-CAMERA_MARGIN));
    const fits=needed<=maxDistance+0.001;
    let suggestFocal=null;
    if(!fits&&maxDistance>0){
      const usable=STANDARD_FOCALS.filter(f=>distanceFor(f,framing.coverage,choice.sensor,choice.aspect)<=maxDistance+0.001);
      suggestFocal=usable.length?usable[usable.length-1]:null;
      warnings.push(suggestFocal
        ?`进深不够：${framing.label}需要相机退到 ${needed.toFixed(2)} 米，房间只剩 ${maxDistance.toFixed(2)} 米可用（含机位后 ${CAMERA_MARGIN} 米）。改用 ${suggestFocal}mm（该焦段只要 ${distanceFor(suggestFocal,framing.coverage,choice.sensor,choice.aspect).toFixed(2)} 米）或换更靠里的机位。`
        :`进深不够：即使 14mm 也需要 ${distanceFor(14,framing.coverage,choice.sensor,choice.aspect).toFixed(2)} 米，房间只剩 ${maxDistance.toFixed(2)} 米。必须改画面（只拍局部）或换场地。`);
    }
    const people=Math.max(1,choice.people||1);
    const peopleWidth=people*PERSON_WIDTH;
    if(width&&peopleWidth>width-0.4)warnings.push(`${people} 人并排需要约 ${peopleWidth.toFixed(2)} 米，房间净宽 ${width} 米偏紧，建议错开前后站位。`);
    if(Number(venue.height)&&Number(venue.height)<STAND_HEIGHT)warnings.push('层高不足，人物无法站直。');
    if(!Number(venue.depth)||!Number(venue.width))assumptions.push('缺净宽／进深，距离与人数按每米线性估算，需要勘景确认。');

    const subject={x:round(Math.min(Math.max(width/2,0.4),Math.max(width-0.4,0.4))),y:round(Math.max(depth-SUBJECT_WALL_GAP,0.3))};
    const cameraBehind=round(subject.y-needed);
    const camera={x:subject.x,y:cameraBehind,depth:round(needed)};
    if(depth&&cameraBehind<0)warnings.push('按这个站位数，相机会退到墙里：必须换更广的焦段、让演员往前站，或改画面。');
    const light=lightPlan(venue,choice,camera,subject);
    return {frameIndex:frame&&frame.index,frameName:(frame&&frame.name)||'',stage:(frame&&frame.stage)||'',
      framing:choice.framing,framingLabel:framing.label,coverage:framing.coverage,focal:choice.focal,suggestFocal,
      sensor:choice.sensor,aspect:choice.aspect,people,distance:round(needed),maxDistance:round(maxDistance),fits,
      camera,subject,light,warnings,assumptions,seconds:(frame&&frame.seconds)||8};
  }

  function lightPlan(venue,choice,camera,subject){
    const wall=venue.windowWall||'north';
    const rows=[];
    /* 窗在镜头对面 → 逆光/侧逆光；窗在侧墙 → 侧光；窗在门口方向 → 顺光 */
    if(wall==='north')rows.push({role:'窗（镜头对面）',effect:'逆光／侧逆光，轮廓好看但脸部要补光',position:{x:subject.x,y:0},action:'补一块白卡或小灯在演员正面偏下，避免脸全黑'});
    else if(wall==='east'||wall==='west')rows.push({role:'窗（侧墙）',effect:'侧光，脸一半亮一半暗',position:{x:wall==='east'?0:(Number(venue.width)||2),y:subject.y},action:'机位与窗成 30–45 度，让光从人物侧后方来'});
    else rows.push({role:'窗（门口方向）',effect:'顺光，脸平但缺层次',position:{x:subject.x,y:Number(venue.depth)||2},action:'机位尽量对着窗的反方向，或加一块黑旗压暗背景'});
    if(venue.power)rows.push({role:'电源',effect:'可用电源位置：'+venue.power,position:null,action:'按电源位置决定补光灯放在哪一侧'});
    return rows;
  }

  /* 三个画面一起看：冲突与挪灯次数 */
  function plan(venue,frames){
    const errors=issues(venue);
    if(errors.length)return {ready:false,errors,shots:[],conflicts:[]};
    const list=(frames||[]).slice(0,3);
    const shots=list.map((frame,index)=>planFrame(venue,{...frame,index},choiceOf(venue,index,frame)));
    const conflicts=[];
    const focals=[...new Set(shots.map(s=>s.focal))];
    if(focals.length>2)conflicts.push('三个画面用了 '+focals.length+' 种焦段，现场换镜头次数偏多；能靠近就靠近，尽量不超过两种。');
    const shapes=new Set(shots.map(s=>s.framing+'/'+s.people));
    if(shots.length>1&&shapes.size<shots.length)conflicts.push('有两个画面的景别与人数完全相同：节奏上会显得重复，换一个景别或人数。');
    const total=shots.reduce((sum,s)=>sum+Number(s.seconds||0),0);
    if(total>40)conflicts.push('三画面合计 '+total+' 秒，单条预热片偏长，确认是否需要压缩。');
    return {ready:true,errors:[],shots,conflicts,totalSeconds:total,venue};
  }

  /* 俯视机位图：能直接发给摄影 */
  function diagramSVG(venue,shots,options={}){
    const width=Math.max(Number(venue.width)||3,1),depth=Math.max(Number(venue.depth)||4,1);
    const scale=Math.min(60,520/Math.max(width,depth)),pad=54;
    const w=width*scale,d=depth*scale,W=w+pad*2,H=d+pad+20;
    const X=x=>pad+x*scale,Y=y=>pad+y*scale;
    const wall=venue.windowWall||'north';
    const windowWidth=Math.max(Number(venue.windowWidth)||width*0.6,0.4)*scale;
    const centre=pad+w/2;
    const windowLine=wall==='north'?`<line x1="${centre-windowWidth/2}" y1="${Y(0)}" x2="${centre+windowWidth/2}" y2="${Y(0)}"/>`
      :wall==='south'?`<line x1="${centre-windowWidth/2}" y1="${Y(depth)}" x2="${centre+windowWidth/2}" y2="${Y(depth)}"/>`
      :wall==='east'?`<line x1="${X(0)}" y1="${pad+d/2-windowWidth/2}" x2="${X(0)}" y2="${pad+d/2+windowWidth/2}"/>`
      :`<line x1="${X(width)}" y1="${pad+d/2-windowWidth/2}" x2="${X(width)}" y2="${pad+d/2+windowWidth/2}"/>`;
    const colours=['#d7ef9b','#9cc7ef','#efc89c'];
    /* 站位相同就只画一次圆，标签竖着排开，避免三行字叠在一起 */
    const seen=new Map();
    const stacked={};
    const shotMarkup=(shots||[]).map((s,i)=>{
      const colour=colours[i%colours.length];
      const cx=X(Math.min(s.camera.x,width)),cy=Y(Math.min(s.camera.y,depth));
      const sx=X(Math.min(s.subject.x,width)),sy=Y(Math.min(s.subject.y,depth));
      const cone=Math.max(s.distance||1,0.5)*scale*(36/(2*(s.focal||35)))*2;
      const key=Math.round(sx)+':'+Math.round(sy);
      const first=!seen.has(key);
      if(first)seen.set(key,0);
      const row=seen.get(key);seen.set(key,row+1);
      const circle=first?`<circle cx="${sx}" cy="${sy}" r="${Math.max(4,((s.people||1)*0.62*scale)/2)}" fill="none" stroke="${colour}" stroke-width="2"/>`:'';
      stacked[key]=row;
      return `<g><polygon points="${cx},${cy} ${sx-cone/2},${sy} ${sx+cone/2},${sy}" fill="${colour}22" stroke="${colour}" stroke-dasharray="4 4"/>`
        +circle
        +`<rect x="${cx-5}" y="${cy-5}" width="10" height="10" fill="${colour}"/>`
        +`<text x="${cx+8}" y="${cy-6}" fill="${colour}" font-size="11">${i+1} 机位 ${s.focal}mm</text>`
        +`<text x="${sx+8}" y="${sy+16+row*15}" fill="${colour}" font-size="11">${i+1} ${escapeText(s.framingLabel)} · ${s.distance}m</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;background:#11160f;border:1px solid #394133;border-radius:10px">`
      +`<rect x="${pad}" y="${pad}" width="${w}" height="${d}" fill="#161c14" stroke="#5b6749"/>`
      +`<line x1="${pad}" y1="${Y(0)}" x2="${pad+w}" y2="${Y(0)}" stroke="#d7ef9b" stroke-width="1" opacity=".25"/>`
      +`<text x="${pad+6}" y="${pad-8}" fill="#9ca795" font-size="11">${escapeText(WALLS[wall]||'')} · 净宽 ${width}m × 进深 ${depth}m</text>`
      +`<g stroke="#d7ef9b" stroke-width="4" stroke-linecap="round">${windowLine}</g>`
      +shotMarkup
      +(options.extra||'')+`</svg>`;
  }

  function escapeText(value){return String(value==null?'':value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  const round=value=>Math.round(value*100)/100;

  /* 出参考图的提示词：保住场地，只加人物与光 */
  function prompt(venue,frame,shot,tone){
    const wall=WALLS[venue.windowWall]||'';
    return `以第一张参考图（真实场地照片）为空间基础，生成一张拍摄参考图，用于判断这个画面能不能拍。`
      +`\n必须保留：房间的墙面、窗户位置与大小、地面材质、空间比例和透视；不要改变或重画建筑结构，不要加镜子、不要换房间。`
      +`\n画面内容：${shot.framingLabel}，${frame&&frame.name?frame.name+'；':''}${(frame&&frame.people)||'按需要人物'}；动作与情绪按此处理：${(frame&&frame.camera)||'自然' }。`
      +`\n光线：${(frame&&frame.light)||'按现场自然光'}；窗在${wall}。`
      +`\n机位：距人物约 ${shot.distance} 米，${shot.focal}mm 等效，${shot.aspect==='9:16'?'竖画幅':'横画幅'}。`
      +`\n影调：${String(tone||'').trim()||'写实彩色，保留现场色温与材质本色'}，重点是人物轮廓与墙面关系。`
      +`\n不要：文字、水印、夸张的摄影棚布光、与场地不符的家具。`;
  }

  function digest(venue,frames){
    const result=plan(venue,frames);
    if(!result.ready)return {ready:false,missing:result.errors};
    return {ready:true,name:venue.name,shots:result.shots.map(s=>`${s.framingLabel} ${s.focal}mm ${s.distance}m${s.fits?'':'（需调整）'}`),conflicts:result.conflicts.length};
  }

  return {SENSORS,ASPECTS,FRAMINGS,WALLS,CAMERA_MARGIN,SUBJECT_WALL_GAP,PERSON_WIDTH,STAND_HEIGHT,STANDARD_FOCALS,DEFAULT_FOCAL,
    create,issues,ready,choiceOf,defaultFraming,planFrame,plan,diagramSVG,prompt,digest,
    distanceFor,focalFor,verticalSensor};
});
