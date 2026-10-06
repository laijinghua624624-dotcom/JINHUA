/* 汇报逻辑体检：规则先查结构，模型只judge规则查不出的部分，且引用必须能在原文里找到。 */
(function(root,factory){if(typeof module==='object')module.exports=factory(require('./studio-origin'));else root.StudioAudit=factory(root.StudioOrigin);})(globalThis,function(O){
  'use strict';

  const LEVELS={block:'必须改',warn:'建议改',info:'提示'};
  const BASIS=['fact','evidence','proposal','inferred','assumption'];
  const DECISION_HINT=['确认','决定','拍板','选择','定'];
  const MAX_DECISIONS=8;
  const MAX_VAGUE=5;
  const QUOTE_MIN=6;

  function pageText(p){return [p?.title,p?.evidence,(p?.points||[]).join(' '),p?.notes].filter(x=>typeof x==='string').join(' ');}
  function deckText(deck){return (deck?.pages||[]).map(pageText).join(' ');}
  function norm(s){return String(s||'').replace(/[\s，。、；：！？"'“”‘’（）()·—…]/g,'');}
  function grams(s,n=4){const t=norm(s);const out=new Set();for(let i=0;i+n<=t.length;i++)out.add(t.slice(i,i+n));return out;}
  function overlap(a,b){const A=grams(a),B=grams(b);if(!A.size||!B.size)return 0;let hit=0;A.forEach(g=>{if(B.has(g))hit++;});return hit/A.size;}
  function numbers(text,unit){return [...String(text).matchAll(new RegExp('(\\d+(?:\\.\\d+)?)\\s*'+unit,'g'))].map(m=>Number(m[1]));}

  /* ---------- 结构校验：汇报物的形状 ---------- */
  function deckIssues(deck){
    const errors=[];
    if(!deck||typeof deck!=='object')return ['缺少汇报数据'];
    if(!Array.isArray(deck.pages)||!deck.pages.length)errors.push('汇报还没有正文页');
    if(!Array.isArray(deck.chapters)||!deck.chapters.length)errors.push('缺少提纲定义，无法逐页检查');
    for(const p of deck.pages||[]){if(!p||typeof p.slotId!=='string'||!p.slotId.trim())errors.push('有页面缺少 slotId');}
    return errors;
  }

  /* ---------- 规则检查（免费、可复现） ---------- */
  function scan(deck){
    const errors=deckIssues(deck);
    if(errors.length)return errors.map((e,i)=>finding('R00',i,'block',null,'',e,'先补齐汇报数据再体检'));
    const found=[],pages=deck.pages||[],chapters=deck.chapters||[];
    const required=chapters.filter(c=>c.enabled!==false&&c.group!=='appendix');
    const got=new Set(pages.map(p=>p.slotId));

    const missing=required.filter(c=>!got.has(c.id));
    if(missing.length)found.push(finding('R01',0,'block',null,'','缺少提纲要求的页面：'+missing.map(c=>c.title).join('、'),'补齐页面或说明为什么删掉，否则老板看不到这一环'));

    for(const p of pages){
      const pts=(p.points||[]).filter(x=>typeof x==='string'&&x.trim());
      if(!pts.length)found.push(finding('R02',p.slotId,'block',p.title,'','这一页没有任何正文要点','每页至少给出一句具体判断，空页等于没讲'));
      if(typeof p.notes!=='string'||!p.notes.trim())found.push(finding('R02b',p.slotId,'warn',p.title,'','这一页没有讲稿','汇报时要说什么先写下来，避免现场临时发挥'));
      const basis=String(p.basis||'');
      if(!BASIS.includes(basis))found.push(finding('R03',p.slotId,'block',p.title,'','没有标明依据性质（事实／证据／拟定／推断）','把这一页的每句话标成事实、证据或拟定'));
      if(basis==='fact'&&!String(p.evidence||'').trim())found.push(finding('R03b',p.slotId,'block',p.title,'','声称是事实，却没有给出处','补出处，或降级为拟定'));
    }

    const origin=deck.origin;
    if(origin&&origin.proposition){
      const target=pages.filter(p=>['cover','summary','direction'].includes(p.slotId));
      for(const p of target){
        if(overlap(origin.proposition,pageText(p))<0.4)
          found.push(finding('R04',p.slotId,'warn',p.title,origin.proposition,'这一页的主张与已确认的主张不一致','把主张原样带过来，或回出发点改主张，不要两套说法'));
      }
      const c=origin.cost||{};
      const days=numbers(c.days,'天')[0];
      if(days!==undefined){
        const others=[...new Set(numbers(deckText(deck),'天'))].filter(n=>n!==days);
        if(others.length)found.push(finding('R05',null,'block',null,`${others[0]}天`,`拍摄落地写的天数（${others[0]}天）与出发点确认的代价（${days}天）不一致`,'回去改一个：要么改代价，要么改方案，别让老板看到两个数'));
      }
    }

    const facts=deck.facts||{};
    if(!(facts.confirmed||[]).length&&!(facts.assumed||[]).length)
      found.push(finding('R06',null,'warn','项目背景','','没有把需求、事实、假设分开','按专场模板要求分三栏；假设被写成事实，后面最容易翻车'));
    for(const item of facts.assumed||[]){
      const text=String(item||'').trim();
      if(text.length<4)continue;
      const page=(pages||[]).find(p=>overlap(text,pageText(p))>=0.4);
      if(page&&!/假设|待确认|拟定|预计/.test(pageText(page)))
        found.push(finding('R06b',page.slotId,'block',page.title,text,'把假设写成了事实：'+text,'加“假设”或“预计”，并写清假设不成立的代价'));
    }

    const vague=[...new Set((O.BANNED||[]).filter(w=>deckText(deck).includes(w)))];
    if(vague.length>MAX_VAGUE)found.push(finding('R07',null,'block',null,vague.slice(0,3).join('、'),'空话词过多：'+vague.join('、'),'逐页删掉，换成具体动作、具体画面或具体数字'));
    else if(vague.length)found.push(finding('R07b',null,'warn',null,vague.join('、'),'出现空话词：'+vague.join('、'),'换成能拍出来或能验证的说法'));

    const last=[...pages].reverse().find(p=>p.section!=='limits')||pages[pages.length-1];
    const decisionItems=(last?.points||[]).filter(x=>typeof x==='string'&&x.trim());
    if(!last||last.section!=='decisions'||last.slotId!=='decisions')
      found.push(finding('R08',null,'block',last?.title||'','','结尾不是决策清单','汇报最后只留需要拍板的事，其余都放到附件'));
    else if(!decisionItems.length||decisionItems.length>MAX_DECISIONS)
      found.push(finding('R08b',last.slotId,'warn',last.title,String(decisionItems.length),'决策项数量不合适（'+decisionItems.length+'条）','保留1至'+MAX_DECISIONS+'条真正需要老板决定的，其余自己定'));
    else if(!decisionItems.every(x=>DECISION_HINT.some(w=>x.includes(w))))
      found.push(finding('R08c',last.slotId,'warn',last.title,decisionItems[0],'有决策项看不出要让老板决定什么','每条写成“确认／决定＋具体选项”'));

    const hasRisk=pages.some(p=>/风险|失败|取舍/.test(String(p.title||''))||(p.points||[]).some(x=>/风险|可能失败|替代/.test(String(x))));
    if(!hasRisk)found.push(finding('R09',null,'block',null,'','没有回答“哪里可能失败”','专场模板明确要求这一页；补风险与替代方案'));

    if(!origin||!(origin.frames||[]).length)
      found.push(finding('R10',null,'warn',null,'','没有可指导拍摄的画面清单','第5页的每个画面至少要有场地、机位、光、人、道具、时长'));
    else for(const f of origin.frames){
      const lack=[['venue','场地'],['camera','机位'],['light','光'],['people','人物']].filter(([k])=>!String(f[k]||'').trim()).map(x=>x[1]);
      if(lack.length)found.push(finding('R10b',null,'block',null,f.name||'','画面“'+(f.name||'')+'”缺少：'+lack.join('、'),'补全后再进汇报，否则摄影没法执行'));
    }

    const sizes=[...new Set(numbers(deckText(deck),'米'))];
    if(sizes.length>1)found.push(finding('R11',null,'warn',null,sizes.join('米／')+'米','场地尺寸前后不一致','统一成一个约数，并标明是约数'));
    return found;
  }

  function finding(id,page,level,title,quote,why,fix){
    return {id,page:page??null,level,title:title||'',quote:(quote||'').slice(0,80),why,fix,source:'rule'};
  }

  /* ---------- 模型只judge规则查不出的部分 ---------- */
  function prompt(deck,rules){
    const pages=(deck.pages||[]).map(p=>({slotId:p.slotId,title:p.title,task:p.task||'',points:(p.points||[]).slice(0,6),notes:(p.notes||'').slice(0,200),basis:p.basis}));
    return `你是这位内容总监的汇报对手，负责在老板面前挑毛病。规则检查已经跑完，你**只回答规则查不出的判断问题**，不要重复下面已列出的问题。

只judge这四件事：
1. 每一页有没有回答它在提纲里承担的问题（task）；没回答就指出来。
2. 关键画面是**支撑主张**，还是只是好看；不支撑的要指出是哪一页哪一句。
3. 有没有两页互相矛盾（人物、关系、时间、语气、结论）。
4. 老板最可能问的三个问题，以及现有页面能不能答上；答不上来的要指出缺什么。

硬性要求：
- 每条都必须给出 **quote**：从该页原文里**原样摘抄**至少${QUOTE_MIN}个字。摘抄不出来的条目会被系统丢弃。
- 不许泛泛而谈（如“建议加强逻辑”），每条都要说清改哪一页、改成什么。
- 不许编造页面里没有的信息。不确定就少写。
- 最多 8 条，按严重程度排序。

汇报信息：${JSON.stringify({title:deck.title,audience:deck.audience,purpose:deck.purpose,origin:deck.origin?{proposition:deck.origin.proposition,tension:deck.origin.tension,fallback:deck.origin.fallback}:null,pages})}

已由规则发现的问题（不要重复）：${JSON.stringify(rules.map(r=>({page:r.page,why:r.why})))}

只返回 JSON：${JSON.stringify({findings:[{page:'页面 slotId',level:'block|warn',quote:'该页原样摘抄',why:'问题是什么',fix:'改成什么'}]})}`;
  }

  /* ---------- 接收模型结果：引用对不上就丢弃 ---------- */
  function accept(audit,raw,deck){
    const pages=deck?.pages||[],texts=new Map(pages.map(p=>[p.slotId,norm(pageText(p))]));
    const kept=[],dropped=[];
    const items=Array.isArray(raw)?raw.flatMap(value=>Array.isArray(value?.findings)?value.findings:[]):Array.isArray(raw?.findings)?raw.findings:[];
    for(const item of items){
      const page=String(item?.page||''),quote=String(item?.quote||'').trim();
      const hay=texts.get(page);
      const why=String(item?.why||'').trim(),fix=String(item?.fix||'').trim();
      if(!hay||[...quote].length<QUOTE_MIN||!why||!hay.includes(norm(quote))){dropped.push({page,quote:quote.slice(0,40),why:why.slice(0,60)});continue;}
      kept.push({id:'A'+(kept.length+1),page,level:item?.level==='block'?'block':'warn',title:pages.find(p=>p.slotId===page)?.title||'',quote:quote.slice(0,80),why,fix,source:'ai'});
    }
    audit.ai={findings:kept,dropped,at:new Date().toISOString()};
    return audit;
  }

  function merge(rules,ai){
    const key=f=>norm(f.why).slice(0,24);
    const seen=new Set(),out=[];
    for(const f of [...rules,...ai]){const k=key(f);if(seen.has(k))continue;seen.add(k);out.push(f);}
    return out;
  }

  function verdict(findings){
    const blockers=findings.filter(f=>f.level==='block'),warns=findings.filter(f=>f.level==='warn');
    const level=blockers.length?'需修改':warns.length?'可汇报（有建议）':'可汇报';
    return {level,blockers,warns,label:blockers.length?`必须改 ${blockers.length} 项`:warns.length?`建议改 ${warns.length} 项`:'通过'};
  }

  function report(findings){
    const v=verdict(findings);
    const line=f=>`[${LEVELS[f.level]}]${f.page?'（'+f.page+'）':''}${f.why}${f.quote?'｜原文：'+f.quote:''} → ${f.fix}`;
    return [v.label,...v.blockers.map(line),...v.warns.map(line)].join('\n');
  }

  /* 一次体检：规则 → （可选）模型 → 合并 → 结论 */
  function run(deck,raw){
    const rules=scan(deck);
    const audit={title:deck?.title||'',rules,ai:{findings:[],dropped:[]}};
    if(raw)accept(audit,raw,deck);
    audit.findings=merge(rules,audit.ai.findings);
    audit.verdict=verdict(audit.findings);
    return audit;
  }

  return {LEVELS,BASIS,MAX_DECISIONS,deckIssues,scan,prompt,accept,merge,verdict,report,run,pageText,overlap};
});
