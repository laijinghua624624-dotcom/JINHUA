(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.StudioRadar=api;})(globalThis,function(){
  'use strict';
  const CATEGORIES=['直播预热','演唱会预热','活动预热','AI商业成片','AI短片叙事','AI镜头实验','AI舞台预演','AI制作方法'];
  const SOURCES=[
    {id:'digitaling',name:'数英项目库',url:'https://www.digitaling.com/projects',categories:['直播预热','活动预热'],note:'国内品牌项目复盘，适合找直播、节日营销和活动机制。'},
    {id:'socialbeta',name:'SocialBeta',url:'https://socialbeta.com/',categories:['直播预热','活动预热'],note:'品牌案例与趋势，适合观察题材、话题和传播节点。'},
    {id:'xinpianchang',name:'新片场',url:'https://universal.xinpianchang.com/',categories:['活动预热','AI商业成片','AI短片叙事'],note:'国内成片与创作人作品，适合看完整叙事和落地质感。'},
    {id:'eventmarketer',name:'Event Marketer',url:'https://www.eventmarketer.com/campaign-finder/',categories:['活动预热'],note:'线下活动与体验营销案例。'},
    {id:'directorslibrary',name:"Directors’ Library",url:'https://directorslibrary.com/',categories:['活动预热','AI短片叙事'],note:'导演视角的影片策展，适合练叙事与镜头语言。'},
    {id:'shotdeck',name:'ShotDeck',url:'https://shotdeck.com/',categories:['AI镜头实验','AI制作方法'],note:'电影镜头检索库，适合定义摄影、灯光、色彩和构图。'},
    {id:'stash',name:'Stash',url:'https://www.stashmedia.tv/',categories:['AI商业成片','AI镜头实验','AI制作方法'],note:'动画、VFX与新型影像作品。'},
    {id:'momentfactory',name:'Moment Factory',url:'https://momentfactory.com/',categories:['演唱会预热','AI舞台预演'],note:'沉浸式体验、舞台与声光电项目。'},
    {id:'treatmentstudio',name:'Treatment Studio',url:'https://www.treatmentstudio.com/work/',categories:['演唱会预热','AI舞台预演'],note:'演出视觉、巡演舞台与大屏幕内容。'},
    {id:'northhouse',name:'NorthHouse',url:'https://www.northhousecreative.com/',categories:['演唱会预热','AI舞台预演'],note:'演唱会、舞台影像与实时视觉。'},
    {id:'livedesign',name:'Live Design',url:'https://www.livedesignonline.com/concerts',categories:['演唱会预热','AI舞台预演'],note:'演出灯光、音响、视频与制作技术。'},
    {id:'runwayfestival',name:'Runway AI Film Festival',url:'https://aif.runwayml.com/',categories:['AI短片叙事','AI镜头实验'],note:'AI影片节入选作品，重点看完整叙事，不只看模型测试。'},
    {id:'somewhile',name:'SOMEWHILE',url:'https://www.somewhile.cn/',categories:['AI商业成片','AI短片叙事'],note:'国内AI创意影像与行业资讯线索。'},
    {id:'ailine',name:'AILINE',url:'https://ailine.cloud/',categories:['AI商业成片','AI制作方法'],note:'AI影像案例与创作流程线索。'},
    {id:'lair',name:'LAIR AIGC',url:'https://lair-aigc.com/',categories:['AI短片叙事','AI镜头实验'],note:'AIGC创作活动与作品线索。'},
    {id:'vjshi',name:'光厂 AIGC 案例',url:'https://www.vjshi.com/cases/so/aigc',categories:['AI商业成片','AI镜头实验'],note:'国内AIGC影像案例索引，需区分商业交付和纯效果测试。'},
    {id:'deepshow',name:'Deepshow',url:'https://deepshow.tech/duanju.html',categories:['AI短片叙事','AI制作方法'],note:'AI短剧与制作流程线索。'},
    {id:'krea',name:'Krea',url:'https://www.krea.run/features/ai-video-generator',categories:['AI镜头实验','AI制作方法'],note:'AI视频工具与效果测试，不等同于真实商业交付。'}
  ];
  const CASES=[
    {id:'duxiaoman-521',title:'度小满521答谢音乐会',url:'https://www.digitaling.com/projects/346030.html',site:'数英',category:'演唱会预热',type:'商业交付案例',goal:'情感造势、活动预约',mechanism:'把品牌答谢转化为一场有情感仪式的音乐事件。',hook:'从一个可感知的感谢瞬间或人物关系切入，具体画面待看片核对。',arc:'个人情感—集体回应—活动期待。',craft:'重点拆舞台仪式、人物近景和现场氛围的关系。',cover:'人物情绪+音乐会名称+日期信息。',transfer:'把“卖货前的预热”转成“用户与主播互相赶赴”。',avoid:'不照搬演出规模和品牌语言。',ai:'可用AI预演舞台气氛、灯光节奏和封面方向。',risk:'演出授权、音乐版权、嘉宾肖像需单独确认。'},
    {id:'jd-murder-live',title:'京东电器剧本杀直播',url:'https://www.digitaling.com/projects/224580.html',site:'数英',category:'直播预热',type:'商业交付案例',goal:'吸睛、观看预约、直播互动',mechanism:'用类型叙事和角色任务包装直播利益点。',hook:'直接抛出异常事件或谜题，让观众立即进入任务。',arc:'谜题—搜证—反转—直播入口。',craft:'重点看置景、道具线索、角色造型和节奏剪辑。',cover:'一个谜题文案+关键道具+主播角色造型。',transfer:'把产品机制变成观众可参与的任务。',avoid:'不让世界观设定压过直播利益和日期。',ai:'可用AI做类型化概念图和开场8秒氛围预演。',risk:'剧情需避免误导，商品权益信息必须与最终机制一致。'},
    {id:'ai-12h-live',title:'《被AI硬控的一天》12小时直播',url:'https://www.digitaling.com/projects/372525.html',site:'数英',category:'AI商业成片',type:'商业交付案例',goal:'话题、观看时长、产品体验',mechanism:'把AI从工具变成控制一天行动的叙事角色。',hook:'先展示一个反常指令或不可退出的规则。',arc:'新鲜—失控—适应—完成挑战。',craft:'真实直播证据与AI界面、字幕和视觉效果交替。',cover:'强冲突标题+人物被“操控”的瞬间。',transfer:'让AI成为事件机制，不只是生成素材。',avoid:'不把假的AI能力宣传为真实功能。',ai:'AI为创意机制与视觉制作的双重部分，需看项目说明核对。',risk:'AI生成内容、产品功能表述和直播安全边界。'},
    {id:'breaking2',title:'Nike Breaking2',url:'https://www.wk.com/work/nike-breaking2/',site:'Wieden+Kennedy',category:'活动预热',type:'商业交付案例',goal:'造势、事件观看、品牌精神',mechanism:'用一个清晰、几乎不可能的目标串起人物、训练和直播事件。',hook:'目标数字和人类极限冲突立即出现。',arc:'不可能—准备—临场—见证。',craft:'训练细节、数据可视化、人物表情和事件纪录融合。',cover:'一个目标数字+一个决定性人物画面。',transfer:'为专场建立一个全员共享的清晰任务。',avoid:'不空洞复制“挑战极限”，必须有真实证据和规则。',ai:'可用AI预演数据屏、路径空间和时间压力视觉。',risk:'纪录性内容不能由AI伪造，数据需有来源。'},
    {id:'redbull-stratos',title:'Red Bull Stratos',url:'https://www.redbull.com/us-en/the-science-of-red-bull-stratos',site:'Red Bull',category:'活动预热',type:'品牌事件案例',goal:'全球事件造势、直播见证',mechanism:'把科学准备、人物风险与一次不可重复的直播时刻合为一条悬念线。',hook:'用高度、风险或临界瞬间立即建立量级。',arc:'科学准备—升空—临界等待—见证。',craft:'宏观尺度、人物呼吸、控制中心与数据界面并置。',cover:'极端尺度的单一主视觉+完成时刻。',transfer:'用“只此一次”的事件感提升预热强度。',avoid:'不用虚构危险欺骗观众。',ai:'可做极端尺度概念预演，但真实事件证据必须保留。',risk:'安全、科学数据、纪录真实性。'},
    {id:'tomorrowland-winter',title:'Tomorrowland Winter Trailer',url:'https://www.tomorrowland.com/article/tomorrowland-winter-trailer/',site:'Tomorrowland',category:'演唱会预热',type:'完整成片参考',goal:'世界观造势、售票期待',mechanism:'先让观众相信一个节日世界，再把演出信息变成进入世界的入口。',hook:'用一个超现实地标或异常天气快速建立世界观。',arc:'发现入口—穿越场景—人群集结—节日揭晓。',craft:'广角地貌、奇观置景、快慢节奏反差与音乐高潮。',cover:'世界观地标+小人物比例+活动标识。',transfer:'为专场建立可持续复用的世界观符号。',avoid:'不只堆奇观，要让场景与主播、产品或活动任务发生关系。',ai:'AI适合做世界观气氛、场景转换和舞台延展预演。',risk:'原品牌世界观与音乐素材不可直接搬用。'},
    {id:'playstation-concert',title:'PlayStation The Concert',url:'https://www.northhousecreative.com/projects/playstation-the-concert',site:'NorthHouse',category:'AI舞台预演',type:'舞台视觉案例',goal:'演出造势、IP记忆唤起',mechanism:'把熟悉的IP世界转译为现场屏幕、灯光与音乐的空间体验。',hook:'以高识别度符号和声音记忆快速唤起粉丝。',arc:'IP唤醒—空间扩展—人群共振—演出期待。',craft:'重点拆屏幕比例、灯光方向、视觉节奏与舞台人物关系。',cover:'IP符号+舞台尺度+演出名称。',transfer:'先确定一组可识别的视觉语法，再展开多首曲目或多条预热片。',avoid:'不直接使用受保护的IP视觉和音乐。',ai:'适合用AI做舞台概念、屏幕内容和灯光节奏预演，最终需按真实屏幕尺寸校验。',risk:'IP授权、音乐版权、屏幕规格与现场安全。'},
    {id:'runway-aiff',title:'Runway AI Film Festival 入选作品库',url:'https://aif.runwayml.com/',site:'Runway',category:'AI短片叙事',type:'AI完整成片合集',goal:'叙事方法、AI成片质量标杆',mechanism:'不把AI当特效，而是观察它如何支撑完整的角色、观点和结尾。',hook:'每部作品单独记录，先拆前8秒是画面奇观、人物悬念还是声音钩子。',arc:'必须看完整片后再写，不以单张截图代替叙事判断。',craft:'重点检查角色一致性、镜头连续、声音、剪辑和AI瑕疵的处理。',cover:'记录作品的核心命题，而不只是最奇观的一帧。',transfer:'建立“这个AI镜头为什么必须存在”的评估习惯。',avoid:'不把影展作品误当为实时可复制的工具演示。',ai:'AI参与类型与模型需按每部作品的创作者说明核对。',risk:'影展作品仅作方法研究，不下载、不搬用角色或画面。'}
  ];
  function normalizedURL(value){try{const u=new URL(String(value||'').trim());u.hash='';['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(k=>u.searchParams.delete(k));u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href;}catch{return '';}}
  function duplicate(items,item){const url=normalizedURL(item.url||item.link);return (items||[]).find(a=>a.radarSourceId===item.id||(url&&normalizedURL(a.link)===url))||null;}
  function notes(item,scope){return [
    '【案例雷达线索·打开来源看片后请核对】',
    `项目类型：${item.category||'待分类'} · ${item.type||'案例线索'}`,
    `目标：${item.goal||'待补充'}`,
    `一句话创意机制：${item.mechanism||'待看片后补充'}`,
    `开场8秒：${item.hook||'待看片后补充'}`,
    `情绪／故事弧：${item.arc||'待看片后补充'}`,
    `摄影／美术／舞台声光：${item.craft||'待看片后补充'}`,
    `封面／主视觉：${item.cover||'待看片后补充'}`,
    `可迁移：${item.transfer||'待补充'}`,
    `不可照搬：${item.avoid||'待补充'}`,
    `AI参与：${item.ai||'待核对'}`,
    `落地／版权／肖像风险：${item.risk||'待核对'}`,
    `适配建议：${scope==='xinxuan'?'用于辛选工作时，先改写为主播关系、商品机制和直播日期的真实任务。':'用于个人创作时，保留方法，换成自己真正想表达的人物与命题。'}`
  ].join('\n');}
  function caseToAesthetic(item,uid,scope='personal'){
    const now=new Date().toISOString();return {id:uid(),name:item.title,kind:'aesthetic',category:item.category.startsWith('AI')?'AI参考':item.category==='演唱会预热'?'舞台声光电':'广告TVC',tags:[item.category,item.type||'案例线索','案例雷达'],notes:notes(item,scope),requirements:notes(item,scope),link:normalizedURL(item.url),sourceSite:item.site||new URL(item.url).hostname,sourceUsage:'link-only',files:[],coverId:null,favorite:true,usedIn:[],folderIds:[],radarSourceId:item.id,radarKind:'case',createdAt:now,updatedAt:now};
  }
  function sourceToAesthetic(item,uid){
    const now=new Date().toISOString();return {id:uid(),name:item.name,kind:'aesthetic',category:item.categories.some(c=>c.startsWith('AI'))?'AI参考':'其他',tags:[...item.categories,'案例网站','案例雷达'],notes:`【案例来源】${item.note}\n使用时请手动打开链接、挑选单个作品，再将成片截图、参考重点和不可照搬部分补齐。本系统不会自动登录或抓取网站。`,requirements:'',link:normalizedURL(item.url),sourceSite:item.name,sourceUsage:'link-only',files:[],coverId:null,favorite:true,usedIn:[],folderIds:[],radarSourceId:item.id,radarKind:'source',createdAt:now,updatedAt:now};
  }
  function caseToTopic(item,topicFactory,scope='personal'){
    const t=topicFactory(item.title+' · 我的转化');t.idea=[`来源：${item.title}`,`可迁移机制：${item.transfer||item.mechanism||'待拆解'}`,scope==='xinxuan'?'改写要求：转化为当前主播、商品机制、直播日期和真实资源可支撑的新创意。':'改写要求：只保留方法，转化为自己真正想表达的人物和命题。'].join('\n');t.inspirationSource=normalizedURL(item.url);t.form=item.category;t.motif=item.mechanism||'';t.exploration=item.avoid||'';t.quick.fields.outline=item.mechanism||'';t.radarSource={id:item.id,title:item.title,url:normalizedURL(item.url),category:item.category};return t;
  }
  function daily(items,date=new Date(),count=3){const day=Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())/86400000),out=[];for(let i=0;i<Math.min(count,items.length);i++)out.push(items[(day+i*3)%items.length]);return out;}
  return {CATEGORIES,SOURCES,CASES,normalizedURL,duplicate,notes,caseToAesthetic,sourceToAesthetic,caseToTopic,daily};
});
