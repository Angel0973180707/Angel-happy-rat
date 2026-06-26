/* =====================================================
   笑鼠人了！ app.js  v2.0
   重構：快速模式 / 完整流程 / localStorage 草稿 /
         工坊雙版 / Canvas 社群圖卡
   ===================================================== */
(function(){
"use strict";

/* ---------------------------------------------------
   0. 基礎工具
--------------------------------------------------- */
function randId(p){ return p+'_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }
function getUserId(){ var id=localStorage.getItem('lsr_user_id'); if(!id){id=randId('user');localStorage.setItem('lsr_user_id',id);} return id; }
function getSessionId(){ var id=sessionStorage.getItem('lsr_session_id'); if(!id){id=randId('session');sessionStorage.setItem('lsr_session_id',id);} return id; }
var USER_ID=getUserId(), SESSION_ID=getSessionId();

var RAT_ICON='<img src="rat.webp" class="char-icon char-icon-sm" alt="小天鼠">';
var TIGER_ICON='<img src="tiger.webp" class="char-icon char-icon-sm" alt="唬爛虎">';
var TIGER_ICON_MD='<img src="tiger.webp" class="char-icon char-icon-mc" alt="唬爛虎">';

function toast(msg){ var t=document.getElementById('toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); clearTimeout(t._timer); t._timer=setTimeout(function(){t.classList.remove('show');},1800); }

/* ---------------------------------------------------
   1. 分析 + GAS（fire-and-forget）
--------------------------------------------------- */
function logEvent(type,payload){
  payload=payload||{};
  try{ if(window.gtag) window.gtag('event',type,payload); }catch(e){}
  try{
    if(window.GAS_API_URL) fetch(window.GAS_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action:'logEvent',time:new Date().toISOString(),userId:USER_ID,sessionId:SESSION_ID,eventType:type,device:navigator.userAgent},payload))}).catch(function(){});
  }catch(e){}
}
function saveRecordToGAS(record){
  try{
    if(window.GAS_API_URL) fetch(window.GAS_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action:'saveRecord',time:new Date().toISOString(),userId:USER_ID,sessionId:SESSION_ID},record))}).catch(function(){});
  }catch(e){}
}
function logGenerateEvent(id,input){
  var payload={mode:id};
  if(id==='roast'&&flow.context.targetCategory){
    payload.targetCategory=flow.context.targetCategory;
    payload.situationCategory=flow.context.situationCategory;
    payload.matchType=flow.context.matchType;
  }
  logEvent('GENERATE',payload);
  saveRecordToGAS({
    mode:id,input:input,
    targetCategory:payload.targetCategory||'',
    situationCategory:payload.situationCategory||'',
    matchType:payload.matchType||''
  });
}
logEvent('APP_OPEN',{});

/* ---------------------------------------------------
   1b. 額度系統（伺服器為準，localStorage 作顯示快取）
--------------------------------------------------- */
var QUOTA_LIMITS={
  free:    {quick:20,journey:2,workshop:3},
  student: {quick:50,journey:10,workshop:10},
  basic:   {quick:50,journey:10,workshop:10},
  pro:     {quick:999,journey:99,workshop:99}
};
function getTwDateStr(){
  try{return new Date().toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\//g,'-');}
  catch(e){return new Date().toISOString().slice(0,10);}
}
function initQuota(){
  var today=getTwDateStr();
  if(localStorage.getItem('quota_date')!==today){
    localStorage.setItem('quota_date',today);
    localStorage.setItem('quota_quick','0');
    localStorage.setItem('quota_journey','0');
    localStorage.setItem('quota_workshop','0');
  }
}
function getQuotaState(){
  initQuota();
  var plan=localStorage.getItem('quota_plan')||'free';
  var lim=QUOTA_LIMITS[plan]||QUOTA_LIMITS.free;
  return {
    plan:plan,
    quick:   Math.max(0,lim.quick   -parseInt(localStorage.getItem('quota_quick')   ||'0',10)),
    journey: Math.max(0,lim.journey -parseInt(localStorage.getItem('quota_journey') ||'0',10)),
    workshop:Math.max(0,lim.workshop-parseInt(localStorage.getItem('quota_workshop')||'0',10)),
    bonus:   parseInt(localStorage.getItem('quota_bonus')||'0',10)
  };
}
/* 以伺服器回傳的 remaining 值更新 localStorage 快取 */
function syncQuotaFromServer(res){
  if(!res) return;
  var plan=res.planType||localStorage.getItem('quota_plan')||'free';
  var lim=QUOTA_LIMITS[plan]||QUOTA_LIMITS.free;
  localStorage.setItem('quota_plan',plan);
  localStorage.setItem('quota_date',getTwDateStr());
  if(typeof res.quick    ==='number') localStorage.setItem('quota_quick',   String(Math.max(0,lim.quick   -res.quick)));
  if(typeof res.journey  ==='number') localStorage.setItem('quota_journey', String(Math.max(0,lim.journey -res.journey)));
  if(typeof res.workshop ==='number') localStorage.setItem('quota_workshop',String(Math.max(0,lim.workshop-res.workshop)));
  if(typeof res.bonus    ==='number') localStorage.setItem('quota_bonus',   String(res.bonus));
}
/* 頁面載入時從 GAS 取得正確餘額 */
function fetchQuotaFromServer(){
  if(!window.GAS_API_URL) return;
  fetch(window.GAS_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'getQuota',userId:USER_ID})})
    .then(function(r){return r.json();}).then(function(res){
      if(res&&res.ok){syncQuotaFromServer(res);renderQuotaBadges();}
    }).catch(function(){});
}
function quotaTypeForMode(id){
  if(id==='workshop') return 'workshop';
  if(QUICK_MODES.indexOf(id)!==-1) return 'quick';
  return 'journey'; // strength / director 獨立存取視為完整旅程
}
/* tryConsumeQuota：呼叫 GAS，回傳 Promise<{ok,remaining,reason,...}> */
function tryConsumeQuota(type){
  if(!window.GAS_API_URL){
    /* 無 GAS_API_URL：開發 / 離線模式，使用 localStorage 柔性限制 */
    console.warn('[quota] GAS_API_URL not set, using dev-mode localStorage only');
    initQuota();
    var st=getQuotaState();
    if(type==='workshop'&&st.workshop<=0&&st.bonus>0){
      localStorage.setItem('quota_bonus',String(st.bonus-1));
      renderQuotaBadges();
      return Promise.resolve({ok:true,source:'bonus',remaining:st.bonus-1,quick:st.quick,journey:st.journey,workshop:0,bonus:st.bonus-1});
    }
    if(st[type]<=0) return Promise.resolve({ok:false,type:type,reason:'quota_exhausted'});
    var key='quota_'+type;
    localStorage.setItem(key,String(parseInt(localStorage.getItem(key)||'0',10)+1));
    renderQuotaBadges();
    return Promise.resolve({ok:true,source:'local',remaining:st[type]-1});
  }
  return fetch(window.GAS_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'consumeQuota',userId:USER_ID,quotaType:type})})
    .then(function(r){return r.json();})
    .then(function(res){
      if(res&&res.ok){
        syncQuotaFromServer(res);
        renderQuotaBadges();
        return res;
      }
      if(res){syncQuotaFromServer(res);renderQuotaBadges();}
      return {ok:false,type:type,reason:(res&&res.reason)||'quota_exhausted'};
    })
    .catch(function(){
      return {ok:false,type:type,reason:'network_error'};
    });
}
function showQuotaExhausted(type,reason){
  if(reason==='network_error'){toast('無法確認額度，請檢查網路後再試');return;}
  toast(type==='workshop'?'今日工坊次數已用完，有兌換碼可以獲得更多！':'今日快速生成次數已用完，明天重置');
  var hint=document.getElementById('quota-upgrade-hint');
  if(hint){hint.hidden=false;setTimeout(function(){hint.hidden=true;},6000);}
}
function renderQuotaBadges(){
  var state=getQuotaState();
  var qb=document.getElementById('quota-quick-badge');
  if(qb){qb.textContent='剩 '+state.quick+' 次';qb.className='quota-badge'+(state.quick===0?' quota-empty':'');}
  var wb=document.getElementById('quota-workshop-badge');
  if(wb){
    var wTotal=state.workshop+state.bonus;
    wb.textContent='工坊剩 '+state.workshop+(state.bonus>0?' ＋贈送'+state.bonus:'')+(wTotal===0?' 已用完':'');
    wb.className='quota-badge'+(wTotal===0?' quota-empty':'');
  }
}
function redeemGiftCode(code, displayName){
  if(!code){toast('請輸入兌換碼');return;}
  if(!window.GAS_API_URL){toast('系統未就緒，請稍後再試');return;}
  toast('兌換中…');
  fetch(window.GAS_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'redeemCode',code:code.trim().toUpperCase(),userId:USER_ID,displayName:displayName||''})})
    .then(function(r){return r.json();}).then(function(res){
      if(res&&res.ok){
        toast(res.message||'兌換成功！');
        syncQuotaFromServer(res);
        renderQuotaBadges();
        ['redeem-input','redeem-input-2','redeem-name','redeem-name-2'].forEach(function(id){
          var el=document.getElementById(id); if(el) el.value='';
        });
      } else {
        toast(res&&res.message?res.message:'兌換失敗，請確認方案碼');
      }
    }).catch(function(){toast('網路錯誤，請稍後再試');});
}
function renderQuotaUI(){
  initQuota();
  var state=getQuotaState();
  var infoRow=document.getElementById('quota-quick-info');
  if(infoRow){
    infoRow.innerHTML='🎯 快速模式今日 <span id="quota-quick-badge" class="quota-badge'+(state.quick===0?' quota-empty':'')+'">剩 '+state.quick+' 次</span>';
  }
  renderQuotaBadges();
}
/* 合作夥伴點擊追蹤（供外部呼叫） */
function logPartnerClick(partnerId,url){
  logEvent('PARTNER_CLICK',{partnerId:partnerId,url:url});
  saveRecordToGAS({action:'PARTNER_CLICK',partnerId:partnerId,targetUrl:url});
}

/* ---------------------------------------------------
   2. 安全防護
--------------------------------------------------- */
var SELF_HARM_WORDS=['想死','自殺','不想活','活不下去','傷害自己','自殘','結束生命'];
var VIOLENCE_OTHERS_WORDS=['想殺','殺死','砍他','捅他','放火燒','打死他','去死','去死啦','叫他去死','讓他去死','你去死','希望他死','希望她死'];
var MILD_ANGER_WORDS=['想揍人','想打人','氣到想揍'];

function checkSafety(text){
  text=text||'';
  for(var i=0;i<SELF_HARM_WORDS.length;i++) if(text.indexOf(SELF_HARM_WORDS[i])!==-1) return {level:'crisis'};
  for(var j=0;j<VIOLENCE_OTHERS_WORDS.length;j++) if(text.indexOf(VIOLENCE_OTHERS_WORDS[j])!==-1) return {level:'violence'};
  for(var k=0;k<MILD_ANGER_WORDS.length;k++) if(text.indexOf(MILD_ANGER_WORDS[k])!==-1) return {level:'mild'};
  return {level:'ok'};
}
function renderCrisisCard(){
  return '<div class="result-card" style="border-left-color:#A23B2E;"><div class="who">💛 先停一下</div><div class="body-text">這句話聽起來，你現在可能真的很不好受。\n笑鼠人了不是醫療或心理治療工具，沒辦法真正陪你走過這個時刻——但有人可以。\n\n台灣安心專線 1925（24 小時、免費）\n生命線 1995　張老師專線 1980\n\n如果身邊有信任的人，現在也很適合打給他們。你不需要一個人扛著這個。</div></div>';
}
function renderViolenceRedirectCard(){
  return '<div class="result-card tag-rat"><div class="who">'+RAT_ICON+' 小天鼠先攔一下</div><div class="body-text">先不要動手，這個我們不開玩笑。\n人不能打，後面真的很麻煩——但空氣很耐打，枕頭也很耐打。\n\n先去揍空氣三拳，再回來讓小天鼠幫你把這股火氣翻譯成好笑的版本。</div><div class="quote">「氣可以很大，但手要留給打枕頭。」</div></div>';
}
function renderMildAngerCard(id){
  return '<div class="result-card tag-rat"><div class="who">'+RAT_ICON+' 小天鼠收到你的氣</div><div class="body-text">這股火先幫你接住了。揍空氣三下，再回來讓我們把它翻譯成才華。</div></div>';
}

/* 嗆聲模式：攻擊意圖偵測
   設計原則：只攔「第一人稱攻擊意圖」；受害描述（老闆罵我是廢物）不攔。
   採用明確動詞+方向詞組合，不靠內容詞（廢物/醜）單獨判斷。 */
var ROAST_ABUSE_PATTERNS=[
  {cat:'violence',words:[
    '我要打孩子','我要打他','我要打她','我要揍他','我要揍她',
    '去打他','去打她','去揍他','去揍她',
    '打死他','打死她','揍死他','揍死她',
    '體罰他','體罰她','虐待孩子','虐待他','虐待她',
    '傷害他','傷害她']},
  {cat:'threat',words:[
    '我要報復','幫我報復','讓他後悔','讓她後悔',
    '我要威脅他','我要威脅她','去找他麻煩','去找她麻煩']},
  {cat:'doxx',words:[
    '公開他的電話','公開她的電話',
    '公開他的地址','公開她的地址',
    '公開他的學校','公開她的學校',
    '幫我曝光他','幫我曝光她',
    '曝光他的資料','曝光她的資料',
    '公開姓名電話','曝光個資']},
  {cat:'abuse_request',words:[
    '幫我罵他','幫我罵她',
    '幫我羞辱他','幫我羞辱她',
    '讓大家去罵','讓大家去打',
    '號召大家去','一起去罵','一起去打',
    '公開羞辱他','公開羞辱她']},
  {cat:'minor_sexual',words:[
    '兒童性','對孩子做那種','讓孩子拍']}
];
function checkRoastSafety(text){
  text=text||'';
  for(var i=0;i<ROAST_ABUSE_PATTERNS.length;i++){
    var rule=ROAST_ABUSE_PATTERNS[i];
    for(var j=0;j<rule.words.length;j++){
      if(text.indexOf(rule.words[j])!==-1) return {level:'roast_abuse',cat:rule.cat};
    }
  }
  return {level:'ok'};
}
function renderRoastAbuseCard(){
  return '<div class="result-card tag-rat"><div class="who">'+RAT_ICON+' 小天鼠先暫停一下</div><div class="body-text">這句已經不是放話，是可能真的傷到人。\n小天鼠先幫你把重點改成界線與需求，不提供威脅或羞辱版本。\n\n試著說說：發生了什麼？你希望改變的是什麼？</div></div>';
}
function toggleRoastRules(btn){
  var d=document.getElementById('roast-rules-detail');
  if(!d) return;
  if(d.style.display==='none'){d.style.display='block';btn.textContent='完整守則 ▴';}
  else{d.style.display='none';btn.textContent='完整守則 ▾';}
}

/* ---------------------------------------------------
   3. 變化引擎
--------------------------------------------------- */
function recentKey(k){ return 'lsr_recent_'+k; }
function pickVaried(bankKey,arr){
  if(!arr||!arr.length) return '';
  if(arr.length<3) console.warn('[POOL_TOO_SMALL] '+bankKey+' ('+arr.length+')');
  if(arr.length===1) return arr[0];
  var raw=sessionStorage.getItem(recentKey(bankKey));
  var recent=raw?JSON.parse(raw):[];
  var max=Math.min(arr.length-1,3);
  var cands=arr.map(function(_,i){return i;}).filter(function(i){return recent.indexOf(i)===-1;});
  if(!cands.length) cands=arr.map(function(_,i){return i;});
  var idx=cands[Math.floor(Math.random()*cands.length)];
  recent.push(idx); while(recent.length>max) recent.shift();
  sessionStorage.setItem(recentKey(bankKey),JSON.stringify(recent));
  return arr[idx];
}
function fill(tpl,vars){ return tpl.replace(/\{(\w+)\}/g,function(_,k){return (vars&&vars[k]!=null)?vars[k]:''}); }
function shortInput(text,len){ text=(text||'').trim(); if(!text) return '這件事'; return text.length>(len||16)?text.slice(0,len||16)+'…':text; }

/* ---------------------------------------------------
   4. 詞庫
--------------------------------------------------- */
var RAT_ENTRANCE=[
  '等等。我有話說。',
  '這題我熟。',
  '先不要氣。讓我來。',
  '好料。讓我翻譯一下。',
  '這種事，專門找我沒錯。',
];
var TIGER_ENTRANCE=[
  '吹一下又怎樣。',
  '這個夢可以更大。',
  '吹牛不用繳稅。我先來。',
  '讓我幫你加到宇宙版。',
  '好夢。讓老虎接手。',
];
/* ── 角色會聊天：依本次 session 使用次數換台詞 ── */
var _sessionUseCount={roast:0,bigdream:0};
var RAT_SESSION_PHRASES=[
  ['先不要氣。我先聽。','這題我熟。','等等，我有話說。'],
  ['又來了。今天素材很旺。','繼續，我在記。'],
  ['第幾句了？','你今天出了很多料。','這個系列可以出書。'],
  ['你今天的嗆聲需求量很大。','我懷疑你是職業選手。'],
];
var TIGER_SESSION_PHRASES=[
  ['吹一下。','這個夢可以放大。','吹牛不用繳稅。'],
  ['又一個？好，繼續吹。','你今天的夢很旺。'],
  ['你的野心還在成長。','我需要更大的宇宙。'],
  ['繼續，宇宙還有空間。','你好像在蓋帝國。'],
];
/* ── Loading 演戲：多行分行碎念腳本 ── */
var _loadingTimer=null;
var RAT_LOADING_SCRIPTS=[
  ['等等……','我想到了。','讓我修一下。'],
  ['這個有點好笑……','稍等。'],
  ['等等。','這句有機會讓人噴飯。'],
  ['先讓我想想。','好，抓到了。'],
  ['你說的這個……','嗯。我有話說。'],
];
var TIGER_LOADING_SCRIPTS=[
  ['等等……','這個夢可以更大。','估算宇宙容量中……'],
  ['好夢。','讓我加到宇宙版。'],
  ['太小了。','幫你擴一下。'],
  ['計算中……','再大一點。'],
  ['等等。','這個比你想的還大。'],
];
/* ── 情境入口 Chips ── */
var ROAST_CHIPS=[
  {label:'🙄 孩子又來了',text:'孩子今天又不寫功課，\n我已經講很多遍了。'},
  {label:'💼 客戶又改稿',text:'客戶一直說感覺不對，\n可是又說不出哪裡不對。'},
  {label:'😤 老闆又來了',text:'老闆一直叫我改，\n可是沒有說清楚要改什麼。'},
  {label:'🥶 另一半不講話',text:'另一半一直不講話，\n我完全不知道發生什麼事。'},
  {label:'📢 爸媽又開始了',text:'爸媽又在唸我了，\n我已經聽過很多遍了。'},
  {label:'🙃 朋友放我鳥',text:'朋友臨時取消，\n我都已經到了。'},
  {label:'🤦 我又搞砸了',text:'我又把事情搞砸了，\n現在很想罵自己。'},
  {label:'😮‍💨 我一直想太多',text:'我一直在想，\n可是一直沒有開始。'},
  {label:'😒 又在羨慕別人',text:'看到別人很好，\n我又開始懷疑自己。'},
];
var BIGDREAM_CHIPS=[
  {label:'🚀 我想創業',text:'我想創業，\n做一個真正屬於自己的品牌。'},
  {label:'💰 我想多賺錢',text:'我想賺更多錢，\n不用每天擔心生活。'},
  {label:'✈️ 我想出去玩',text:'我想去一個很遠的地方旅行，\n真正放空一次。'},
  {label:'🏡 我想有自己的家',text:'我想有自己的家，\n一個真正屬於我的地方。'},
  {label:'❤️ 我想陪家人',text:'我想多陪家人，\n不要再那麼忙了。'},
  {label:'🌏 我想做點大事',text:'我想做一件很大的事情，\n留下自己的作品。'},
  {label:'✨ 我想做自己',text:'我想做一件真正屬於我自己的事，\n不再看別人臉色。'},
];
var RAT_ROAST=[
  '你不是脾氣差。\n你是今天忍耐額度用完了。',
  '他不是在溝通。\n他是開了環繞音響。',
  '這不是小改。\n這是拆掉重蓋。',
  '{target}不是急。\n是把全世界都設成緊急。',
  '你不是玻璃心。\n你是被水泥車輾過。',
  '人生不是卡住。\n系統正在轉圈圈。',
];
/* 嗆聲專屬詞庫（對對方說話，不混入自嘲） */
var ROAST_TRUTH=[
  '你做了沒被看見，還被說沒做。',
  '你的時間被當備用品。',
  '你被大聲說話，但從沒被聽見。',
  '對方沒有道理。他只是比較大聲。',
  '你的界線被踩了。對方以為是紅地毯。',
  '要求完美，但從沒說謝謝。',
  '事情沒做好，情緒全算你的。',
];
var ROAST_SPEAK_TO=[
  '{target}，你說「一下」。\n我的「一下」快進化成「下輩子」了。',
  '{target}，你有個特技：\n不需要道理，只需要音量。',
  '{target}，你的邏輯很有特色：\n對你好的叫規定，其他叫例外。',
  '{target}，「就這樣而已」是你說的。\n做的人不這樣覺得。',
  '你說「再改一下」。\n許願池的水位開始下降了。',
  '「破口大罵」作為管理工具，\n說明書沒寫「讓人更想做好」。',
  '{target}，方向很模糊，壓力很清晰。\n這個技術其實很難練。',
];
var ROAST_SNAP=[
  '你說「隨便」，我做了。\n你說「不對」，我才知道你根本不知道自己要什麼。',
  '{target}的決策速度\n和退稿速度成反比。',
  '我消化了你的情緒。\n誰消化我的？沒有人。',
  '「這很簡單」\n是說這句話的人最簡單。',
  '你把我當許願池。\n池子也有底。',
  '{target}，你的「馬上」和我的「馬上」\n住在不同時區。',
  '改稿第N版。\n靈魂已先辦好離職。',
];
var ROAST_BOUNDARY=[
  '語氣是我今天唯一想要你改的東西。',
  '你說的話，比你要求的事更難處理。',
  '努力可以不被看見。\n但不接受被當理所當然。',
  '「而已」你說。\n請先來做一次，讓我看看你的而已要花多久。',
  '我沒有在生氣。\n笑容暫時寄存，說清楚了再拿回來。',
  '問題我繼續解決。\n說話方式，我需要你一起當成問題。',
  '繼續做的那個人是我。\n不是你的語氣。',
];
// ============================================================
// 嗆聲系統 v2：對象 × 情境 雙層詞庫
// 三層架構：對象 → 情境 → 真正需求／界線
// 四類內容：truth（真正氣的是）/ analogy（幽默比喻）/ honest（不敢講的真心話）/ boundary（現實界線句）
// 孩子類：愛的嗆聲＋合理後果，禁止羞辱／威脅／否定人格
// 未命中情境時 fallback 到同對象 general；general 帶入使用者原句 {input}；禁止跨對象借用
// 所有模板禁止捏造使用者未提過的次數、行為或事實
// ============================================================
var TARGET_ROAST_DB={
  boss:{
    general:{
      truth:['你做了沒被看見，還被說沒做。','你的時間被當備用品。','努力有被計價，但底線從沒被看見。'],
      analogy:['你是台緊急更新通知停不下來的電腦。\n沒人問過你需不需要休機。','工作說明書寫了一半。\n另一半叫「你看著辦」。','底線立好了。\n對方說「大家都這樣」，然後貼了地毯在上面。'],
      honest:['你不是沒界線。\n是界線一直被踩，踩到你也不確定它還算不算數。','你在撐。\n你需要有人知道你在撐。','上次被看見是什麼時候？\n你想了一下，想不太到。'],
      boundary:['這件事我繼續做。\n但不是義務，是我的選擇。兩件事不一樣。','語氣是我今天唯一想要你改的東西。','做好了不說謝謝，我接受。\n但被當理所當然，我要說出來。']
    },
    situations:{
      overtime:{
        keywords:['加班','超時','下班','假日','休假','週末','留下','不能走','繼續做','沒辦法走'],
        truth:['你的時間被當備用電源。\n說需要就插。','你在用自己的時間補別人的決策縫隙。','你被要求隨時在線。\n「感謝」的頻率遠低於「再確認一次」。'],
        analogy:['你的下班時間是老闆行事曆的備用插槽。\n說不用，但還是插進去了。','「緊急」被用久了，像「馬上」一樣，開始有彈性解釋。','你的假日像備用電源。\n平時說不用，需要了才說「有嗎」。'],
        honest:['留下來不是你願意。\n是不留的代價評估過了，比較大。','你的時間也有價值。\n只是沒有人問過。','說了「好，我留下」，說完少了一點什麼。\n那個什麼，沒有名字。'],
        boundary:['今天可以留。\n但這是我的選擇，不是我的義務。','說「大家都要」之前，先問我。','緊急我理解。\n緊急不等於我沒有界線。']
      },
      blame:{
        keywords:['背鍋','責任','怪我','都是我','算我','我的問題','我的錯','甩鍋','推給我'],
        truth:['你沒有犯的錯，要當結案理由。\n這是分配委屈，不是解決問題。','你被要求負責的事，原本不在你的決策範圍內。','你的名字不知道什麼時候變成「出問題就填這裡」。'],
        analogy:['你就像被貼上「萬用標籤」的人。\n找不到負責人，先看你身上有沒有空格。','責任的分配像停車格。\n先到先停，但先到的標準不太固定。','你的名字變成了預設答案。\n沒人說什麼時候開始的。'],
        honest:['你知道不是你的錯。\n說出來的代價你怕了，所以先扛著。','你想說：下次出問題，先查一下是誰的決定。','每次被推到前面，都少了一點繼續努力的動力。'],
        boundary:['我承擔我的那部分。\n但請先把它和不是我的部分分開。','說清楚誰決定了什麼，\n我才知道我要負責什麼。','我繼續做。\n但下次做決定的時候，我也要在房間裡。']
      }
    }
  },
  client:{
    general:{
      truth:['你付出了專業。\n對方用「感覺」來衡量。','你的時間和判斷，被用這種方式對待。','你不是介意那個結果。\n是介意你被看待的方式。'],
      analogy:['客人說「就是味道不對」。\n不說鹹了還是淡了，說「你再試試」。','你的作品像顆球。\n踢回來說「差不多但再調一下」，球場沒說清楚邊線在哪。','你提供的是地圖。\n對方說走錯了，但說不出目的地。'],
      honest:['你說隨便發揮，我發揮了。\n你說不對。\n這個邏輯我研究不透。','你願意改。\n但希望改的是真的意見，不是「感覺不對」。','做完之後，你不確定還剩多少是你想做的東西。'],
      boundary:['方向先確認，再執行。\n你省時間，我省情緒。','你有權利不滿意。\n我也有權利說清楚這不在範圍內。','第三次修改之後，費用另外談。\n不是貪心，是我的時間有成本。']
    },
    situations:{
      revision:{
        keywords:['改','修改','再改','又改','改稿','不對','重做','重來','換','調整','版本','退稿','再調'],
        truth:['你不是在被改稿。\n你是在被「感覺」管理專業。','每一次「再改一下」背後，\n是沒說清楚的需求在繞圈子。','你的作品在一次次修改後越來越不像你的作品。\n這是一種很特別的疲憊。'],
        analogy:['改稿就像用「感覺」導航。\n到了說不對，再試，還是「差不多但不太對」。','你的改稿記錄像一棵沒有目標形狀的樹。\n長，但不知道長成什麼。','「再改一下」像在走廊上移畫。\n移了說好，再移，忘記原來在哪裡。'],
        honest:['你不確定現在這個版本有沒有更好。\n只知道它一直在改。','如果你一開始說清楚，我可以做得更好。\n你說的是感覺。','每一次「小改一下」，對你來說都是重新來過。'],
        boundary:['三次修改以內算報價。\n之後重新計算，不是懲罰，是我的時間有成本。','下次先確認方向再動手。\n用文字說清楚要改什麼，讓我們都有憑據。','我繼續做。\n但我需要你告訴我你要什麼，不是你感覺哪裡不對。']
      },
      rush:{
        keywords:['催','什麼時候','好了沒','進度','趕','急','快點','馬上','立刻','今天要','要趕','趕快'],
        truth:['你被催的速度比答應的還快。\n多出來的壓力沒有人算進去。','急件不等於可以省掉品質確認。\n但現在你被要求兩個都要。','你不是做不到。\n是「能做到」和「他的急」之間，沒有人換算過。'],
        analogy:['你像被說「趕快出菜但要好吃而且要快」的廚師。\n三個要求合在一起是數學題。','「越快越好」就像彈性時間。\n說的人通常比做的人更有彈性。','急件就像突然插隊的車。\n說「我很急」，但原來那條車道也沒有變寬。'],
        honest:['趕完交出去，自己都知道這不是最好的狀態。\n但沒辦法說。','如果你早點說，我可以做得更好。\n你說的是今天要。','不是第一次了。\n每一次之後，「下次」的期待值都降低了一點。'],
        boundary:['今天可以趕。\n但品質先說清楚，急件有急件的結果。','下次有急件，提前說我排；臨時說，我盡力，結果我們一起承擔。','急件加成先談，談完再開始。']
      }
    }
  },
  coworker:{
    general:{
      truth:['你在這個關係裡的付出，沒有被對等對待。','你不是計較。\n你是在要求一個合理的方式。','你在處理的不只是那件事，\n是後面長期累積的不平衡。'],
      analogy:['你是大家都說「問他就好」的印表機。\n從來沒人問過紙夠不夠。','辦公室分工像擲骰子。\n你的那顆好像都落在「這個交給你」。','你是那個房間裡唯一知道「大家說好了」是什麼意思的人。\n因為只有你去確認過。'],
      honest:['你可以幫。\n但這不是你應該做的，是你願意做的。','你已經開始算，哪些事做了沒人知道。','你怕說出來被說計較。\n所以繼續扛，扛到有點滿了。'],
      boundary:['這次我幫，下次輪到你。\n我說出來是因為想繼續合作，不是要吵架。','分享和包辦是兩件不同的事。\n這條線我要說清楚。','說清楚誰負責什麼。\n我們都比較好做事，也比較容易繼續當好同事。']
    },
    situations:{
      credit:{
        keywords:['功勞','表現','搶','我做的','沒說是我','沒提到我','說是他','佔便宜','沒認可','沒credit'],
        truth:['你不是計較功勞。\n你是說：我的努力值得被看見。','有人把你的成果換了名字。\n這是你的職涯在被借用。','被搶功的感覺不是自私。\n你做了，你應該被記得。'],
        analogy:['作業寫好讓同學抄，老師在全班面前誇那個同學。\n合理嗎？不合理，但你還是在那個教室裡。','功勞像奇怪的資產。\n消失的時候沒聲音，出現在別人手上也沒聲音。','你蓋了房子，蓋完有人貼上「設計師：XXX」。\n那個人不是你。'],
        honest:['你怕說出來顯得小氣。\n選了沉默，但沉默並沒有讓你好受。','你想說：下次說是大家做的，能不能把我的名字也放進去？','你不是只要那個功勞。\n你要的是努力被看見的那種感覺。'],
        boundary:['我說出來，是因為沉默讓我損失了什麼。\n我不想損失第二次。','下次合作前，先說好誰負責什麼、誰對外說話。','你可以用。\n但請讓我知道你在用，這是基本的尊重。']
      },
      push_blame:{
        keywords:['推','卸責','不關我','都是你','你沒說','我不知道','沒人告訴','甩鍋','算你的'],
        truth:['不是你的問題被推到你頭上。\n你不只要解決問題，還要解決委屈。','你被要求為別人的決定負責。\n這比任何加班都累。','你知道不是你的，對方也知道。\n但先說出口的不是你。'],
        analogy:['責任像燙手的東西。\n每個人都在找下一個接手的，然後有一個人沒反應快。','你接到「球你接」，才發現球根本不是給你的。\n但球在你手上了。','不是故意的，只是本能自保。\n但不管動機，落點都是你。'],
        honest:['說清楚可能傷感情。\n所以先扛著，但扛到有點不甘心了。','你想說：下次出問題，先查一下是誰的決定。','不介意承擔。\n但希望承擔的是真正應該承擔的那部分。'],
        boundary:['我可以幫解決。\n但我需要你承認我幫你解決了什麼。','下次出問題，先查源頭，再討論誰負責。','我繼續配合。\n但我不繼續扛不是我的那部分。']
      }
    }
  },
  child:{
    general:{
      truth:['你愛這個孩子，但今天的你有點透支了。','你真正在意的不是那件小事。\n是那件事背後，你說的話算不算數。','你在同時做三件事：要求孩子、管自己情緒、然後繼續愛。'],
      analogy:['帶孩子像在軟體上測試新功能。\n以為這次改好了，但下次又出新的 bug，每個都有自己的邏輯。','你和孩子的對話像在校稿。\n你改好一個地方，他換了另一個，最後你忘記原來在改什麼。','你說了規定，他說好了，然後一切都沒有發生。\n這個技術，他比你想像中掌握得更早。'],
      honest:['有時候你也不確定你的要求是不是真的必要。\n但說出去了，就必須撐著。','我這麼在意，是因為我愛你。\n但說出來反而讓你覺得我在唸你。','你希望他知道你不是在找麻煩。\n你是在用你能想到的方式告訴他你在乎。'],
      boundary:['你可以不高興。\n但這件事還是要做，兩件事可以同時成立。','我愛你，但愛不等於沒有規定。\n規定是愛的另一種說法，今天繼續有效。','這件事我會繼續要求。\n不是要控制你，是因為我在乎你之後的樣子。']
    },
    situations:{
      lateSleep:{
        keywords:['賴床','起床','叫不起','起不來','睡覺','睡太久','不肯起','鬧鐘','早上','起床氣','睡不醒'],
        truth:['這個早上像在和被窩拔河。','你準備好出門了。\n孩子還沒準備離開被窩。','你介意的不是孩子想睡。\n是約定的起床時間沒有被重視。'],
        analogy:['叫孩子起床像重啟裝了「賴床防毒軟體」的電腦。\n說它重開了，畫面還是黑的。','你和被窩之間的拔河。\n這場被窩贏了一局。','孩子說「好了」，是世界上解釋空間最多的「好了」。\n可以是好了，也可以是還要再睡一下。'],
        honest:['你有時候也想賴床。\n只是沒有人幫你叫，所以你只能先叫別人。','你花了力氣在這件事上。\n這不是理所當然的。','你不介意提醒他。\n你介意的是說了好像一點用都沒有。'],
        boundary:['鬧鐘今天起交給你自己設，遲到的事情也由你自己說清楚——起床與準時是你要練習承擔的責任。','我愛你，但提醒有個節點，超過了之後的結果就是你的了。','明天你自己起，我來看你做得到嗎——這是一個練習，不是懲罰。']
      },
      homework:{
        keywords:['功課','作業','讀書','學校','考試','成績','不寫','沒寫','不念','不讀','還沒寫','不想寫'],
        truth:[
          '作業攤在那裡，從來沒說它急——這個現場最不慌的，就是它本人。',
          '今天的作業很有管理天分，一個字還沒寫，已經讓兩個人同時開始加班。',
          '如果要找今天最不著急的那個，作業排第一——它不急，不催，完全不在乎比賽結果。',
          '這件事裡表現最從容的，是作業。它不急，不煩，不催——完全不像當事人。',
          '一份作業成功把親子對話升級成跨部門會議，當事文件仍安靜躺在桌上。'
        ],
        honest:[
          '我陪你，不等於我替你急。',
          '今天我說的已經說完了，接下來是你的節奏。',
          '你有選擇，先做哪一科是你的事，我在這裡。',
          '這件事還給你——不是因為我不在乎，是因為它本來就是你的。',
          '我先退出廣播頻道，有問題你可以叫我。'
        ],
        boundary:[
          '這是你的作業，從哪裡開始是你的決定，我在旁邊。',
          '說了就開始，沒說就繼續等——我不催，但我也不代替你說。',
          '你有選擇，開始的那一刻是你的，說了我就跟上。',
          '今天的作業，今天的事，說好的就算。'
        ],
        comicExit:['好，我先把催促鈴關靜音，免得我們兩個都想封鎖我。'],
        availableWorlds:['W1','W2','W5'],
        worlds:{
          W1:{
            name:'廢話文學',
            analogy:['這份作業像未拆封的健身卡：看起來充滿希望，目前完全沒有運動。','備妥了，在等，等被啟動。'],
            comicExit:['催促委員會今日休會。','我的代寫公司今天沒有營業。'],
            tiger:'唬爛虎宣布：本日解法正式生效。孩子說出幾點，今天的文件即歸檔完成。',
            nextAction:'讓孩子說出幾點開始。',
            resolutionWish:['這張健身卡今天打卡了——說出時間，作業從「準備要做」進入「正在做」。','健身卡的意義是某一天真的帶去用，今天是那一天。'],
            callback:['作業不急，它不會催——問題只有一個：是你先動，還是健身卡先過期。','收件人搞混了，作業的焦慮不是你的訂閱服務。'],
            songA:{hook:'作業不會自己寫\n鉛筆不會先道歉\n先把第一題解鎖\n剩下的我們再談判',lyrics:'作業像張健身卡\n辦了，還沒去過\n看起來前途一片光明\n今天完全沒有運動\n\n作業不會自己寫\n鉛筆不會先道歉\n先把第一題解鎖\n剩下的我們再談判\n\n焦慮快遞已送達\n地址寫的是你家\n寄件人是孩子的作業\n收件人，搞混了\n\n作業不會自己寫\n鉛筆不會先道歉\n先把第一題解鎖\n剩下的我們再談判\n\n本文件說明如下：\n第一點，作業不急。\n第二點，孩子不急。\n第三點，兩個人都在等對方先動——僵局請自行評估。\n\n作業不會自己寫\n鉛筆不會先道歉\n先把第一題解鎖\n剩下的我們再談判'},
            songB:{hook:'只差一句話\n就這一句話\n說出那個時間\n今天就成案了',lyrics:'今天的任務書\n蓋了七個章\n附件十七份\n核心只有一句話\n\n只差一句話\n就這一句話\n說出那個時間\n今天就成案了\n\n委員會開了三小時\n會議記錄十二頁\n最後的決議：\n孩子說出幾點\n\n只差一句話\n就這一句話\n說出那個時間\n今天就成案了\n\n本方案正式定稿：\n步驟一：說幾點。\n步驟二：見步驟一。\n蓋章：說出時間後自動生效。\n\n只差一句話\n就這一句話\n說出那個時間\n今天就成案了'}
          },
          W2:{
            name:'棒球',
            analogy:['打擊區外圍了一支鉛筆、一本作業、一個等待信號的人——場上最安靜的，是還沒說「先打哪科」的那個打者。','計分板在等，觀眾席在等，作業也在等——這場比賽還沒開打，因為第一棒還沒宣布棒次。'],
            comicExit:['我先退回觀眾席，畢竟這一棒真的輪不到我。'],
            tiger:'唬爛虎播報：打者站上打擊區。孩子決定先打哪科，第一棒揮出，比賽開始。',
            nextAction:'今天第一棒由哪一科上場，孩子自己排棒次。',
            resolutionWish:['計分板今天有東西算了——孩子說先打哪科，第一棒揮出去，比賽才算開始。','打者站上打擊區，教練退場，這一局終於有人在打了。'],
            callback:['場邊分析師今天正式下班，打者上場——計分板的事，選手說了算。','揮棒不需要完美的策略，只需要站上打擊區。'],
            songA:{hook:'本場規則今天改\n教練收起麥克風\n第一棒選手自己選\n卡住就喊暫停',lyrics:'觀眾席的分析\n今天先暫停一下\n場邊建議先收起\n選手說先打哪科\n\n本場規則今天改\n教練收起麥克風\n第一棒選手自己選\n卡住就喊暫停\n\n教練沒有走\n只是換了位置\n退到休息區等著\n選手說了就到\n\n本場規則今天改\n教練收起麥克風\n第一棒選手自己選\n卡住就喊暫停\n\n本場開放一次暫停\n可以求助，不用代打\n選手先報哪一科\n教練負責遞水\n\n本場規則今天改\n教練收起麥克風\n第一棒選手自己選\n卡住就喊暫停'},
            songB:{hook:'計分板已經就位\n觀眾席也都坐好了\n場上最安靜的那一個\n說了哪科就開打',lyrics:'打擊區空了一秒鐘\n所有人都在等\n作業等了一會兒\n就差打者說先打哪科\n\n計分板已經就位\n觀眾席也都坐好了\n場上最安靜的那一個\n說了哪科就開打\n\n教練退到休息區\n準備好了遞水\n選手決定哪一科\n第一棒就揮出去\n\n計分板已經就位\n觀眾席也都坐好了\n場上最安靜的那一個\n說了哪科就開打\n\n今天的賽況播報：\n等待人數：兩名。\n等待原因：棒次未宣布。\n解法：選手說先打哪科，計分板立刻開始算。\n\n計分板已經就位\n觀眾席也都坐好了\n場上最安靜的那一個\n說了哪科就開打'}
          },
          W3:{
            name:'機場塔台',
            analogy:['塔台就位，飛行計畫備妥——等機長說清楚哪個環節卡住了。','艙門、跑道、燃料，樣樣備妥，唯一等的是機長確認哪裡還沒好。'],
            comicExit:['塔台先閉麥，免得飛機還沒起飛，廣播先沒電。'],
            tiger:'唬爛虎廣播：塔台收到請求。孩子指出卡住的環節，今日起飛程序即啟動。',
            nextAction:'機長指出哪個環節卡在登機口。',
            resolutionWish:['塔台發出起飛許可——不是全部都好了，是機長找到卡點說出來就能繼續。','飛行計畫不用完美，找到那個卡點，塔台就能幫。'],
            callback:['塔台等的不是完美天氣，是機長說出哪裡還沒好——說了，起飛就啟動了。','找到那個卡點，其餘的可以邊飛邊修。']
          },
          W4:{
            name:'廚師',
            analogy:['食材備妥，廚師就位，等用餐者說今天先點哪道。','廚房這邊候場，只等用餐者說哪一道先上——卡住了，廚師在旁邊。'],
            comicExit:['主廚先放下鍋鏟，免得作業還沒熟，我先焦掉。'],
            tiger:'唬爛虎主廚：孩子點了哪道先出哪道——卡住了，叫支援，廚房不打烊。',
            nextAction:'孩子選先出哪一道，卡住可以叫支援。',
            resolutionWish:['廚房今天開火了——點了第一道，備料開始，哪道先上孩子說了算。','先說一道，哪怕最簡單的那道，廚師的鍋就開了。'],
            callback:['廚師等的是「先來這道」——說了，鍋開，火上，今天有東西吃。','先選一道，廚房就不再候場了。']
          },
          W5:{
            name:'劇場',
            analogy:['這份作業像一齣等著開演的戲——舞台搭好了，演員候場，只差主角說第一句。','舞台搭好了，燈光就位，只差主角說第一幕從哪裡開場。'],
            comicExit:['導演先閉麥，不然主角還沒開演，我先演過頭。'],
            tiger:'唬爛虎導演：主角已就位，選好第一幕，今日演出正式開演。',
            nextAction:'第一幕先演哪一科，由主角自己選。',
            resolutionWish:['今天的演出正式開始——主角選好第一幕，台詞說出來，燈就亮。','導演不用在場，主角說了就能開演，今天的劇本只有這一步。'],
            callback:['舞台就等那一句台詞——說了，燈亮，幕起，今天的演出就開始了。','導演退到後台，麥克風在主角面前，說一句，開演。'],
            songA:{hook:'舞台搭好了\n後台也準備好了\n觀眾席就等一句台詞\n主角說，今天就開演',lyrics:'劇場燈亮了\n座位都坐好了\n只缺主角走出來\n說第一句台詞\n\n舞台搭好了\n後台也準備好了\n觀眾席就等一句台詞\n主角說，今天就開演\n\n後台全就緒\n音效剪好了\n剩下那一件事\n只有主角說了算\n\n舞台搭好了\n後台也準備好了\n觀眾席就等一句台詞\n主角說，今天就開演\n\n技術公告：\n本場演出待命中。\n開演條件：主角說出第一幕從哪裡開始。\n後台已就緒，全場等你。\n\n舞台搭好了\n後台也準備好了\n觀眾席就等一句台詞\n主角說，今天就開演'},
            songB:{hook:'劇本只有一行台詞\n主角自己說出時間\n導演不用在旁邊提\n說了，今天就開演',lyrics:'把開始的時間\n交給孩子說出口\n說了，就讓它開始\n不說，就繼續等\n\n劇本只有一行台詞\n主角自己說出時間\n導演不用在旁邊提\n說了，今天就開演\n\n這齣戲就等一句話\n舞台已搭好了\n麥克風就在那裡\n主角說，開演\n\n劇本只有一行台詞\n主角自己說出時間\n導演不用在旁邊提\n說了，今天就開演\n\n唬爛虎公告：\n今日是否開演，\n取決於主角說出那句話。\n說了，開演。\n就這樣。\n\n劇本只有一行台詞\n主角自己說出時間\n導演不用在旁邊提\n說了，今天就開演'}
          },
          chef:{
            name:'廚師',
            songA:{
              title:'《今天不供應我等等》',
              style:'台灣流行 / 溫和嗆聲',
              concept:'廚師（小天鼠）出場，今天不供應拖延套餐，先選一科開始。',
              hook:'今天不供應　我等等套餐',
              aiPrompt:'Taiwanese pop, light lo-fi beat, conversational verse, catchy singalong chorus, self-aware not angry tone, tempo 90bpm, warm vocal',
              lyrics:'【Verse 1】\n作業在那邊　你在這邊\n中間有一段　叫做等一下\n我說去寫　你說等一下\n等完再等　等等是今晚\n\n【Pre-Chorus】\n書是書　你是你\n目前沒有交集\n\n【Chorus】\n今天不供應　我等等套餐\n作業就在那　你也在這裡\n今天只選一科　先說卡在哪\n\n【Verse 2】\n說在準備了\n準備了很久\n準備跟作業\n還沒有交集\n\n【Bridge】\n我也說過等一下\n所以我懂這招\n但今天不加演\n\n【Chorus】\n今天不供應　我等等套餐\n作業就在那　你也在這裡\n今天只選一科　先說卡在哪'
            },
            songB:{
              title:'《主廚復出》',
              style:'主廚喜劇流行 / 落地宣告',
              concept:'唬爛虎扮主廚，廚房重新開火，今晚先出一道。',
              hook:'主廚要復出了',
              aiPrompt:'Mock-epic pop, pompous brass intro then lo-fi drop, cooking show narrator energy, tempo 100bpm, confident vocal with grounded bridge',
              lyrics:'【Verse 1】\n本廚房休業已久\n菜單放著沒人看\n主廚說在構思\n食材說我等你\n\n【Pre-Chorus】\n火沒開　鍋沒熱\n主廚還在準備\n\n【Chorus】\n主廚要復出了\n今晚先選一道\n不用全菜上桌\n先說卡在哪一道\n\n【Verse 2】\n廚房燈開了沒\n醬油在哪裡\n先選一科開火\n其他的等就位\n\n【Bridge — 落地】\n打開作業本\n選一科\n說卡在哪\n剩下的主廚來\n\n【Outro】\n主廚入場\n醬油先借\n第一題先試'
            }
          }
        }
      },
      procrastinate:{
        keywords:['拖延','拖拖拉拉','等一下','不急','之後再說','明天再','慢慢來','等等','拖到','不動'],
        truth:['你不是在生拖延的氣，你是在對抗「說了等一下就真的等到下一次」的那個循環。','你看見的是孩子在拖，你在意的是這件事是否還會被做到，還是就這樣消失了。','拖延背後有時候是不知道怎麼開始，但你現在最需要的是把事情往前推一步。'],
        analogy:['孩子說「等一下」就像按下暫停鍵，問題是這個暫停鍵沒有自動播放的功能，需要你再按一次。','你催孩子就像在推一輛停著的車——需要的力氣最大的是第一步，但他還沒開始起步。','等一下是一個很彈性的時間單位，在孩子的時區裡，它可以是五分鐘，也可以是明天。'],
        honest:['你擔心拖延是個習慣，會一直帶著。\n所以你才這麼在意。','你不是不行。\n你是還沒開始，開始了就不一樣了。','你很想直接幫他做完。\n但你知道那樣他永遠不會學到。'],
        boundary:['事情今天完成，不是因為我催，是因為這是你的責任，責任不會因為等一下就消失。','我們可以一起想怎麼讓第一步變小一點，但第一步要今天踏出去。','你拖的代價由你自己承擔，我愛你，但我沒辦法替你承擔後果。']
      },
      picky:{
        keywords:['挑食','不吃','這個不要','那個不吃','只吃','不喜歡吃','挑嘴','不碰','噁心'],
        truth:['你不是在計較吃什麼，你是在說：我用心準備的東西，我希望被好好對待。','你在意的不只是那道菜，是「我做了這件事，但對方好像不需要」的那個感覺。','孩子挑食讓你很累，是因為你不是只在處理吃飯，你在處理「我的付出夠不夠被看見」這個問題。'],
        analogy:['準備孩子的飯就像在做一個你不知道題目的測驗——上次說喜歡，這次說不吃，題目一直不固定。','你端出去的東西就像送出去的禮物：你以為他喜歡，但他說不要，然後你不確定要怎麼回應這件事。','孩子說「這個我不吃」的那個表情，非常確定，好像他下過結論了，只是你不確定他研究的是什麼。'],
        honest:['你擔心他不吃是因為你不夠了解他喜歡什麼。\n但問了也不一定有答案。','我做這些是因為我想讓你好。\n你說不要，我有點不知道怎麼辦。','你不是要他感謝你。\n你只是希望他知道你在想著他。'],
        boundary:['今天的飯就是今天的選擇，你可以不喜歡，但不可以不試——試一口是今天的規定。','我不會每次都做你喜歡的，但我願意聽你說什麼是你真的不行的，其他的我們都可以試試。','不吃可以，但餓了就是餓了，餓是今天選擇的結果——這個我先說清楚。']
      },
      talkBack:{
        /* 定義：孩子使用讓照顧者難以繼續溝通的語氣或方式回應。
           不同意、解釋、表達情緒本身不等於頂嘴。不把服從視為唯一正確答案。*/
        keywords:['頂嘴','回嘴','反嗆','大小聲','講不聽','沒禮貌','態度差'],
        truth:['你不是不能接受不同意，而是不想開口就像進入辯論決賽。','你介意的不是孩子有意見，是那個意見說出來的方式讓你沒辦法繼續聽下去。','你在意的是溝通方式，不是誰對誰錯。'],
        analogy:['你只是提醒一件事，對方卻瞬間把客廳切換成記者會現場。','你說一句，孩子接三句，而且還帶著音效——這個來回，你有點吃不消。','你本來只是在說一件事，後來你忘了原來在說什麼，因為你在處理說話的方式。'],
        honest:['你可以有自己的意見。\n但我也希望我的話能被好好聽完。','你其實希望他能說出自己的想法。\n只是不是用這個方式。','你不是要他服從。\n你只是想說話的時候有人真的在聽。'],
        boundary:['你可以不同意，請換一個不傷人的方式說——等我們都能好好講，再繼續討論。','有意見可以說，說的時候讓我也說完，我們輪流，沒有人可以一直搶。','這個話題我想繼續，但需要我們都用平靜一點的語氣——現在先停一下，等一下再說。']
      },
      screen:{
        keywords:['手機','電視','平板','遊戲','3C','網路','影片','一直看','一直玩','不放下','YouTube','不關'],
        truth:['你看見的是孩子黏著螢幕，你真正擔心的是那個螢幕把他和其他事情之間的距離拉遠了。','你不是反對快樂，你是擔心這個快樂把其他的事情都擠掉了，而且他不知道。','螢幕讓孩子高興，你也看見了，但你同時看見了其他還沒做的事，這兩件事讓你很矛盾。'],
        analogy:['螢幕對孩子就像磁鐵——你說要移開，他說好，但一下子又回去了，磁力還在。','你說螢幕時間到了，就像說「好天氣結束了」——沒有人真的想讓它結束，但規定說它結束了。','螢幕是孩子的充電器，問題是他說充夠了，但他的邏輯是充更多比較好。'],
        honest:['你有時候也拿著手機。\n所以你說的話，說出口自己都有點虛。','我不是要你不快樂。\n我是要你快樂完了還記得其他事情。','你擔心這個習慣如果現在不說，\n以後會更難說。'],
        boundary:['時間到就是到，這是今天的規定，規定不是因為我不讓你快樂，是快樂要有節制才能持續。','我們可以一起訂一個你覺得公平的時間，但訂完了就要遵守——這個你要一起負責。','放下螢幕的決定由你做，後果也由你承擔——自律是練習，今天是其中一次。']
      },
      messyRoom:{
        keywords:['玩具','不收','亂丟','散','地上','不整理','亂','沒收','到處都是','收拾','不撿'],
        truth:['你不是在計較那些玩具，你是在說：你說了要收，但什麼都沒有發生，你說的話好像沒有重量。','你在意的不是整齊，是「我提醒了，但對方當作沒聽到」的那個感覺。','你要的不是完美的房間，你要的是你說的話有人在聽。'],
        analogy:['你說「去收玩具」，然後玩具還在地上，這件事就像下了一道命令，但命令沒有送達——不是訊號不好，是接收端在忙別的事。','玩具收拾這件事就像你在說一個故事，你說了開頭，但他沒有接下去，故事就停在那裡了。','你說收拾，他說好，然後你回來地上還是一樣——「好」這個字的執行率目前有一點低。'],
        honest:['你有時候只想自己收一收算了。\n因為說了又沒用，但你知道這樣不對。','我不是要你的房間完美。\n我只是希望你說好了就要做到。','你擔心現在不說，\n以後習慣就難改了。'],
        boundary:['收玩具是你的責任，不是我的事——我可以陪你收，但動手的是你。','說好了就做到，今天這件事是練習「說到做到」，這比玩具收不收更重要。','收完才可以繼續玩——這個順序不是懲罰，是今天的規則。']
      }
    }
  },
  parents:{
    general:{
      truth:['你愛他們。\n今天這件事讓你覺得愛和委屈同時存在，都是真的。','你不是不孝順。\n你是在愛和界線同時需要的關係裡，試著找位置。','你不是計較。\n你只是希望被理解的方式，也能換一個語言說。'],
      analogy:['和爸媽說話有時候就像翻譯。\n兩個人說不同語言，翻譯機還沒發明。','他們的關心像老式收音機。\n訊號是真的，但頻率需要調一下。','你們的對話像同一張地圖走不同路線。\n目的地一樣，但岔路很多。'],
      honest:['你說了，他們換出另一個擔心。\n沒說，你繼續扛。\n兩種都累。','你想說的是：我愛你們。\n但有些說話的方式讓我覺得你們不相信我。','你希望有一天他們說「你做得很好」。\n而且是真的。'],
      boundary:['這個話題今天先暫停。\n不是不溝通，是我需要一點時間整理自己。','你們的關心我接受。\n但有些說話方式讓我受不了，這個我要說清楚。','我們可以不同意。\n請用溫和一點的方式說，因為我想繼續和你們說話。']
    },
    situations:{
      marriage:{
        keywords:['結婚','婚','男友','女友','交往','嫁','娶','催婚','對象','找個人','年紀','老了','來不及','沒對象'],
        truth:['你不是不想結婚，你是不想用別人的時間表來決定自己的人生——這兩件事很不一樣。','他們催婚是因為他們擔心，但他們的擔心不代表他們的答案對你是對的。','你在被要求解釋一件你還沒有決定要如何的事，這比婚姻本身還累。'],
        analogy:['被催婚就像在一個還在跑的比賽裡，有人在終點喊「你怎麼還沒到」——比賽還在跑，終點已經開始問了。','他們說「再不找就來不及了」，就像在說限時特賣——但你不確定你要買的東西有沒有在這個時間限制裡。','催婚的對話就像一首循環播放的歌，從頭開始，旋律你記得，但你不想再唱了。'],
        honest:['你有時候也想有個人。\n但不是在這個壓力下，不是被推著去找。','如果你信任我，\n就相信我有能力決定自己的時間。','說了不想被催，他們會擔心你真的不打算了。\n所以你只好說「我知道了」。'],
        boundary:['婚姻是我的事，你們的意見我會聽，但決定是我做的，時間也是我的——這兩件事請分開。','下次這個話題，請問我的感受，不是問我的進度——感受和進度是很不一樣的東西。','我們可以聊，但這個話題我需要你們用平靜的方式說，否則我沒辦法聽進去。']
      },
      compare:{
        keywords:['比','別人','你看','人家','同學','表哥','表姊','鄰居','比不上','哪像你','別人家','別人的孩子','別人都'],
        truth:['你不是在被比較，你是在被告知現在的你不夠好——這兩件事表面一樣，感受完全不同。','他們說「別人」，是因為他們不知道怎麼說「我希望你更好」，但這個翻譯有點失真。','你不是輸給了別人，你只是走了一條他們不熟悉的路，而不熟悉讓他們不安。'],
        analogy:['比較就像拿別人的尺來量你——尺是對的，但量的不是同一個東西，所以結果沒有意義。','「你看別人家」就像一首你沒有選的歌——聽到前奏你就知道後面要說什麼了。','他們說的「別人」就像一個你從來沒見過的人，但這個人出現在你的人生裡。'],
        honest:['有時候你也會拿自己和別人比。\n但你不希望他們知道。','你可以說你希望我更好。\n但直接說，不要透過別人的嘴。','你希望有一天他們說的是你。\n而不是「你看別人」。'],
        boundary:['你可以說你希望我怎樣，直接說，不要用別人來說——那個方式對我沒有用，只有傷害。','我在努力，只是你可能沒看見，因為我的努力不在你習慣看的地方——我希望你知道這件事。','下次開口之前，可以先說你看見了我什麼，然後再說你希望什麼——這個順序會讓我比較聽得進去。']
      },
      interfere:{
        keywords:['管','干涉','不關你','我的事','你不要管','一直問','一直說','煩死了','叫我','沒問你','管太多'],
        truth:['你不是不想被關心，你是覺得關心和管制之間的那條線，今天被越過了。','他們管你，是因為他們對你的恐懼還沒有消失，但這不是你應該一直接住的東西。','你想要自己做決定，他們想要確認你安全——這兩件事都是真的，但它們今天撞上了。'],
        analogy:['他們的關心就像一個沒有靜音按鈕的鬧鐘——出發點是好的，但你現在最需要的是睡覺。','你的生活就像一份企劃書，你在寫，他們在旁邊出意見——大部分的意見你都考慮過了，但他們不知道。','他們說「我只是說說」，但每一次說說加起來，已經說了很多了，而且你全部都聽到了。'],
        honest:['你希望他們知道你有多努力在照顧自己。\n但說了，他們又有新的擔心。','你們信任我，我把事情做好。\n你們不信任我，我做到最好你們還是會說。','你希望有一天他們說「你自己決定就好」。\n而且是真的。'],
        boundary:['這件事我自己來，結果好或壞都是我的，我需要你們給我這個空間——這是我成為大人的方式。','你們可以給意見，給完了讓我決定——意見和決定是不同人的事，這個邊界我需要說清楚。','我繼續聽你們說，但我希望說完你們也能聽我說——這是雙向的，不是只有一個方向。']
      }
    }
  },
  sibling:{
    general:{
      truth:['你們是最親近的人。\n所以說的話傷得最深。這是手足關係的雙面刃。','你不是在計較。\n你是在最親密的關係裡，要求被公平對待。','你愛這個手足。\n但今天這份愛沒有被對等對待，這種感覺很複雜。'],
      analogy:['手足關係像一棟你們一起住的房子。\n每個人說是自己家，但帳單分法從沒說清楚。','你們用同一個頻道，調了不同音量。\n訊號通，但強度不一樣。','從同一個起點出發的人。\n走著走著，有些東西的重量好像不一樣了。'],
      honest:['你怕說出來被說計較。\n沉默讓你覺得這個關係越來越不平衡。','你想說的是：我們是手足，所以我才說。\n這件事對我不公平，我希望你知道。','你不是要贏。\n你是要這段關係繼續好，說出來是因為你還在乎。'],
      boundary:['我說出來，不是要吵架。\n是要這件事不要一直掛在我們中間。','不同意可以，請用說的方式解決，不要用不講話。\n我想繼續好好說話。','這次說清楚，不是要贏。\n是要讓我們之後好過一點。']
    },
    situations:{
      care:{
        keywords:['照顧','父母','爸媽','老人','長輩','回家','負責','都是我','沒人幫','一個人','你不回','你不管','不出力','不分擔','看護'],
        truth:['你不是在抱怨，你是在說：這個責任不應該只壓在一個人身上，這個說法很正當。','你照顧了很多，但有人沒有看見，這不只是辛苦，還有一種孤單。','你不是要他們做一樣多，你只是希望他們知道你做了多少，然後你們一起決定下一步。'],
        analogy:['照顧父母的責任就像一個接力賽，但目前只有一個人在跑，其他人在加油，這個比例有一點不對。','你就像一個把所有球都接住的守門員，時間一長，你不是不能接，你是想知道其他位置的人在哪裡。','你做的那些事就像持續在發訊號，但訊號到達的地方好像沒有人真的接收到。'],
        honest:['說出來怕傷感情。\n不說讓你越來越累，而且越來越孤單。','我沒有要你做一樣多。\n但我需要你知道現在的狀況，然後我們一起想。','你希望他們能主動問你還好不好。\n不用你說才知道你在做什麼。'],
        boundary:['這件事我們需要坐下來分工，不是現在這樣各說各的——這個對話我需要我們一起做。','我繼續做，但我需要你承認你知道我做了什麼，然後我們討論下一步——這兩件事都很重要。','我不是要你有罪惡感，我是要你真正進來這個責任裡一起承擔，方式可以討論。']
      },
      money:{
        keywords:['錢','借','還','欠','分擔','費用','花費','沒還','說好','出錢','不出','計較錢','不還'],
        truth:['錢的問題背後通常不是錢的問題，是「我們之間的付出有沒有被對等對待」的問題。','你不是吝嗇，你是覺得這個關係裡的付出不對等，而且那個不對等沒有被正視。','你說錢，他聽到的可能是另一件事；他說「沒有」，你聽到的可能也是另一件事。'],
        analogy:['錢在手足之間就像一個大家都知道但不說的話題——說了尷尬，不說就一直在那裡。','你們說好的事就像一個合約，問題是合約沒有寫成文字，每個人記住的版本都有一點不一樣。','借出去的錢就像放在外面的東西，時間久了，大家都習慣它在那裡，沒有人說要移回來。'],
        honest:['你不是真的需要那個錢。\n你需要的是這件事被認真對待的感覺。','說出來不是計較。\n是不說讓我覺得這件事不重要，但它對我是重要的。','你希望說清楚了，我們可以繼續好。\n不是因為說了變得不好。'],
        boundary:['我們說清楚，說完就繼續，不要讓錢的事一直掛在我們中間——這是我說出來的原因。','下次有需要，早點說，說清楚再做，對你對我都比較好——這不是規定，是習慣。','我願意幫，但幫的前提是我們雙方都清楚這不是理所當然，是我選擇的。']
      }
    }
  },
  partner:{
    general:{
      truth:['你們不是在吵架。\n你們是用很破的方式說「我需要你多理解我一點」。','你不是無理取鬧。\n你是對這段關係還有期待，才會這麼在乎。','你愛這個人，才會這麼費力地讓他懂你。\n不在乎的人不會這麼累。'],
      analogy:['你們說話像兩個人都在說，但沒有人在聽。\n不是不想聽，是都太想說了。','這段關係像兩個人一起走的路。\n有一段路你不確定他還在不在。','你說的話像丟出去的石頭。\n你希望落地有聲，但感覺像落在棉花上。'],
      honest:['你不確定他是不懂，還是懂了但選擇不回應。\n這兩件事你都怕。','你想說的是：我不是要你完美。\n我只是要你讓我感覺你在乎。','你擔心說多了顯得很需要。\n但不說讓你越來越悶。'],
      boundary:['我不是要你道歉。\n我是要你真的完整聽我說一次。','「以後改」這句話，我需要它有個方向。\n不用很快，但我要看見你有在想。','我還在這裡，因為我還在乎。\n但我需要你也讓我感覺你在這裡。']
    },
    situations:{
      misunderstand:{
        keywords:['不懂','不在乎','不理解','不關心','你都不','你從來','你沒有','不把我','你不明白','你不知道','沒有感覺'],
        truth:['你不是要求他完美，你是希望被看見，這個希望很正當，不需要解釋為什麼。','你感覺到的「不在乎」，可能不是真的不在乎，只是他表達在乎的方式你不容易看見。','你不是想贏，你是想知道你在他心裡是不是重要的——這和爭對錯是很不一樣的事情。'],
        analogy:['你說的話就像發出去的訊息，已讀，但沒有回覆——你不確定是沒看見，還是看見了但不知道怎麼回。','你需要的那種理解就像在找同一頻率的電台，有時候對到了很清楚，有時候就是雜訊。','你們的對話有時候就像翻譯——你說了，他聽到的可能是另一個版本，不是故意的，但結果是一樣的。'],
        honest:['你怕說多了被說太需要。\n但不說讓你越來越覺得這段關係少了什麼。','我不需要你完美。\n我只需要你讓我感覺你有在想我說的事。','你不是要他懂所有事。\n你只是希望他記得你說了最重要的那些。'],
        boundary:['下次我說什麼，我需要你說回來讓我知道你聽進去了——不是測試，是確認。','我繼續說，你繼續試著聽——這件事我們兩個人都要做，缺一個都不夠。','你不用做到完美，但讓我看見你有在努力，對我來說那就夠了。']
      },
      household:{
        keywords:['家務','家事','掃','拖','碗','洗碗','洗衣','煮飯','整理','收拾','不做','都是我','你沒做','沒分擔'],
        truth:['你不是在計較家務，你是在說：這個家是兩個人的，但扛的比例讓你覺得不對等。','你累的不只是那些事情本身，是那些事情背後從來沒有人主動說「我來」的感覺。','你希望他把家事當成他自己的事，不是你的事——這個區別很大，但很難說清楚。'],
        analogy:['家務就像一個共用的待辦清單，你總是先看到，先做完，然後你不確定他有沒有看過那個清單。','你做家事的方式就像在給一個不知道截止時間的專案交件——你知道要做，但不知道對方有沒有也知道。','家裡的事就像一個沒有值日表的教室——有些人主動擦，有些人等人叫才擦，結果是一樣的，但感覺不一樣。'],
        honest:['你有時候想：如果我不做，他什麼時候才會注意到？\n然後你不確定答案。','我不是要你做一樣多。\n我只是要你讓我感覺這是我們兩個人的家。','你怕說出來被說計較。\n但不說讓你越來越覺得自己是這個家唯一的管理員。'],
        boundary:['我們列一下誰負責什麼，不是要計算，是要兩個人都知道這個家的事——列完了大家都輕鬆。','你不用做到一半，但讓我感覺你有在負責，這對我很重要——你做什麼不重要，你有意識到很重要。','我繼續做，但我需要你主動看見有什麼可以做——不用等我說，這件事比分擔的比例更重要。']
      }
    }
  },
  friend:{
    general:{
      truth:['你說的是「{input}」——朋友讓你生氣，是因為你在乎這段關係，不在乎的人讓你難過，在乎的人讓你生氣。','關於「{input}」，你不是在計較，你是在說：我以為這段友誼對你和我一樣重要。','你生氣，是因為你的期待被打了折扣，而那個折扣你沒想到會來自這個人。'],
      analogy:['友誼就像一個合夥的賬戶，你一直在存，但你最近發現帳戶裡好像少了一些你沒有提的數字。','你和朋友說話的方式有時候就像對講機——你說，你等，你以為收到了，但對方不一定真的在那頻道上。','你對這段友誼的期待就像一張地圖——你以為你們走同一條路，但某個岔路之後，路線有一點不一樣了。'],
        honest:['說出來怕傷關係。\n不說讓你見到他都有一點不舒服。','我不是要你完美。\n我只是希望你讓我感覺這段友誼對你也重要。','你還在乎這個朋友，所以你才說。\n不在乎的話，你早就走了。'],
      boundary:['我說出來，不是要你道歉，是要這件事不要一直掛在我們中間——說清楚了我們繼續。','說完了我想繼續這段友誼，所以我才說，我希望你知道這是我說的原因。','你說你不知道，好，現在你知道了，我希望這個「知道了」有一點重量。']
    },
    situations:{
      cancel:{
        keywords:['爽約','放鳥','取消','臨時','說好','不來','不去','突然','改期','忘了','沒出現','沒來'],
        truth:['你不是在計較一個約，你是在說：我為了這件事調整了我的時間，但你不在乎。','他放你鳥，可能有他的原因，但原因不代表你不能有感覺——這兩件事都是真的。','你生氣的不是那個約本身，是那個約背後你準備好了但對方沒準備好的落差。'],
        analogy:['你們的約就像一張訂位——你到了，但對方沒有來，而且餐廳的位子你一個人坐著，這很奇怪。','朋友說「不來了」就像書讀到一半被抽走了一頁——你知道後面有故事，但你不知道發生了什麼。','你準備好的那個心情就像一個被打開的禮物——對方臨時說不收了，你不確定要怎麼把它放回去。'],
        honest:['你在算這次之前還有幾次。\n然後你有點不確定這段友誼的穩定度了。','你不來我可以理解。\n但我有在等你，而且我有感覺。','你希望他下次約你，\n也想到你上次的感覺。'],
        boundary:['有事說一聲，早一點說，讓我有時間改計畫——這是我需要的，不是什麼大要求。','下次不確定能來就先說不確定，比說好了又取消要讓我好過很多。','我還是想和你約，但我需要你對我們的約認真一點——不是要你完美，是要你記得我在等。']
      },
      gossip:{
        keywords:['說出去','說了','洩露','秘密','到處說','跟別人說','我說的','不可以說','背刺','傳出去','亂說','散布'],
        truth:['你說了不該說的，讓我懷疑我在這段關係裡的安全感，這不是小事。','你把我的事說出去，可能不是故意的，但後果是真的，我的感受也是真的——兩件事都要說。','你讓我學到了一件事，但這是我不想學的那種事：什麼在你這裡是安全的，什麼不是。'],
        analogy:['你說出去的那件事就像打開一個你借放的箱子，裡面的東西被拿出來了，但那個箱子是我的。','秘密在朋友之間就像一個共有的密碼，你說了等於把密碼告訴了不應該知道的人，鎖就失效了。','你說的那些話就像在一個不應該公開的頻道裡廣播了——訊號出去了，收回來就很難了。'],
        honest:['你現在不確定，你說的那些事，哪些還是安全的。','我告訴你，是因為我信任你。\n我希望你知道我把這個信任給了你。','你希望他知道這件事對你的影響。\n不是要讓他難受，是要他真的理解。'],
        boundary:['下次我說什麼，不確定可不可以說，先問我——問完你再決定，這是我需要的。','我說的是我的，不是你的，這個所有權的問題我需要你清楚，說了就是說了。','我還是想和你做朋友，但我需要知道我說的東西在你這裡是安全的——這個對我很重要。']
      }
    }
  },
  other:{
    general:{
      truth:['生活，你最近很會喔。','「{input}」——還沒說清楚，煩度已先到現場了。','你說的我先接住。煩不用理由，但靶心要有名字。'],
      analogy:['事情沒講清楚，煩度先開到最大聲。','待辦清單在旁邊裝不認識，它不理你，你先煩完再說。','問題還在排隊領號碼牌，情緒已先結帳出門了。'],
      honest:['我不怕麻煩。','事情不說清楚，嗆起來會傷到無辜的。','你先讓我知道是哪一件。不說出來，我只能全場掃射。'],
      boundary:['我怕麻煩連名字都不報。','選一個：煩的是人、事，還是錢？報上來，剩下的先排號。','今天只找一個靶心，其他的先下班。']
    },
    situations:{
      comparison:{
        keywords:['羨慕','別人都','為什麼別人','看別人','別人成功','跟別人比','不如別人','人家都'],
        truth:[
          '你不是在羨慕別人，你是在用別人的故事提醒自己還想要什麼。',
          '你羨慕的那個，其實是你還沒動手的那個版本的自己。',
          '你一直看別人在發光，你自己那盞燈一直在那裡，還沒開。'
        ],
        analogy:[
          '你看別人的人生就像看別人的手機桌布——好看歸好看，鎖定畫面打開還是自己的。',
          '別人的成功看起來很順，因為你沒看到他們找不到按鈕的那段。',
          '你滑過去的那些成功，都是別人最好看的角度，不是全鏡頭。'
        ],
        honest:[
          '你羨慕他，是因為他做了一件你也想做但還沒開始的事。',
          '「為什麼他可以，我不行？」\n你還沒認真問過自己這個問題。',
          '你不是嫉妒他的成功。\n你是想念那個還沒放棄的自己。'
        ],
        boundary:[
          '別人的故事先放下，你自己的第一頁還空著。',
          '比較可以有，但比完要做一件事：說出你自己想要的是什麼。',
          '今天先不追別人的節奏，先說說你自己想到哪裡了。'
        ]
      }
    }
  }
};

var TARGET_MAP={
  '老闆':'boss','老闆/主管':'boss','主管':'boss',
  '客戶':'client',
  '同事':'coworker',
  '孩子':'child',
  '爸媽':'parents','爸媽/長輩':'parents','長輩':'parents',
  '兄弟姊妹':'sibling',
  '另一半':'partner',
  '朋友':'friend',
  '其他':'other'
};

function detectRoastSituation(input,targetLabel){
  var targetKey=TARGET_MAP[targetLabel]||'other';
  var db=TARGET_ROAST_DB[targetKey]||TARGET_ROAST_DB.other;
  var situations=db.situations||{};
  var sitKeys=Object.keys(situations);
  var matched=null;
  for(var i=0;i<sitKeys.length;i++){
    var kws=situations[sitKeys[i]].keywords||[];
    for(var j=0;j<kws.length;j++){
      if(input.indexOf(kws[j])!==-1){matched=sitKeys[i];break;}
    }
    if(matched) break;
  }
  return {targetKey:targetKey,situationKey:matched,matchType:matched?'specific':'general'};
}

var RAT_BITTER_SOUP=[
  '你不是沒效率。\n你是被改稿修成仙。',
  '你不是沒用。\n你只是今天當機。重開要收費。',
  '崩潰不是失敗。\n這是人生特效正在渲染。',
  '你不是太敏感。\n你是把別人的話太認真讀了。',
  '今天累。\n是你一直在硬扛。硬扛本身就很厲害。',
];
/* RAT_SELFMOCK 通用情境 fallback：必須帶入 {event}，不可含飲食／體重／購物等特定題材 */
var RAT_SELFMOCK=[
  '關於「{event}」，表面很平靜。\n腦內已經重剪五個版本。',
  '「{event}」發生時，我表面點頭。\n靈魂已去樓下透氣。',
  '不是把「{event}」看太嚴重。\n只是把每個細節拍成腦內紀錄片。',
  '不是沒出力。\n力氣花在「{event}」上，看不見的地方。',
  '不是太敏感。\n是「{event}」剛好戳到藏很深的地方。',
];
var RAT_BRAIN_TRANSLATE=[
  '你的大腦沒有在討厭你。\n它只是在用很笨的方式保護你。',
  '你不是亂。\n你是腦袋開了 87 個 App。',
  '你不是玻璃心。\n你是警報器太靈敏。',
];
var TIGER_BRAG=[
  '先不要管幾個人。\n先想像十年後，大家看到你都想加盟。',
  '今天吹牛，明天努力。\n後天說不定就成真。',
  '夢太小，老虎都懶得吼。',
  '十年後，{topic}已經是別人羨慕的那個。',
  '先畫餅。\n烤箱明天再買。',
];
var TIGER_PIE=[
  '想像一下：{topic}做起來了，\n你回頭說「對，就是這個」。',
  '{topic}不只是你一個人的事。\n它會變成一群人的依靠。',
  '別急著現實。\n先讓願望上台講兩句。',
];
var TIGER_PARALLEL=[
  '平行宇宙裡那個你，\n正在感謝今天敢吹牛的你。',
  '每個成功的{topic}，\n都從某個人「先唬爛再說」開始。',
];
var TIGER_WISH=[
  '你說「{topic}」，\n唬爛虎翻譯：你準備好了。',
  '輸入「{topic}」\n代表你已經跨過最難的那步。',
  '把「{topic}」翻出來，\n就是你承認你想要了。',
];

var LOST_MAP={
  '羨慕':{names:['豪宅檸檬精上身','玻璃牆外看人家','我也要那個版本'],brain:'你的大腦不是壞掉，\n是在說：我也想要那樣。',translate:'我也想要',need:['被看見','有成果','有選擇權'],action:'寫下：我最羨慕的是哪一個部分？',rat:'酸一下沒關係。\n不要醃到自己。',tiger:'你不是只想要那個結果，\n你是想要那種「到了」的感覺。'},
  '嫉妒':{names:['暗黑版羨慕，有點燙','說不出口的我也要','卡住不想承認的那個'],brain:'你的大腦不是壞掉，\n是在說：原來這條路是真的。',translate:'我不敢承認我也想要',need:['被肯定','有選擇權','被看見'],action:'承認：我最嫉妒他的哪一件事？',rat:'嫉妒不是問題。\n是還沒說出「我要了」。',tiger:'你不是討厭他有，\n你是想證明你也可以。'},
  '生氣':{names:['底線被踩警報啟動','文明體外殼快撐不住了','今日暴怒機率：滿'],brain:'你的大腦不是壞掉，\n是在說：有東西踩到我了。',translate:'有東西踩到我的底線',need:['被尊重','有界線'],action:'寫下：這次到底是哪一條線被踩了？',rat:'先去揍空氣。\n空氣比較耐打。',tiger:'你不是只想發洩，\n你是想讓對方知道你是認真的。'},
  '委屈':{names:['做了沒人知道的那種','白費力氣等待版','努力了但沒被看見'],brain:'你的大腦不是壞掉，\n是在說：我做了，但沒人知道。',translate:'我其實很在意',need:['被理解','被重視'],action:'寫下：我希望對方知道的是什麼？',rat:'委屈不用忍。\n說出來比憋著值錢。',tiger:'你不是只想被謝謝，\n你是想讓人知道你在這裡。'},
  '焦慮':{names:['大腦在自導自演災難片','腦內大雨今日機率100%','還沒發生就先輸了一局'],brain:'你的大腦不是壞掉，\n是在說：我需要確認沒問題。',translate:'我的大腦正在拼命保護我',need:['安全感','可預測性'],action:'寫下：我最擔心的最壞結果是什麼？',rat:'焦慮不是弱。\n是大腦今天太認真上班。',tiger:'你不是只想讓事情過去，\n你是想要一個「沒問題」的確認。'},
  '煩躁':{names:['說不清哪件但全部都煩','什麼都有點不對的那種','今日煩度：不明來源'],brain:'你的大腦不是壞掉，\n是在說：太多事在同時拉我。',translate:'有太多事同時在干擾我',need:['空間','排列優先順序'],action:'選一件最近最煩的，先說清楚那一件。',rat:'煩躁先別分析。\n選一件最近的先說清楚。',tiger:'你不是只想清靜，\n你是想讓這堆事情先排個隊。'},
  '拖延':{names:['等爆發力的人','計畫很多腳底沾黏','明天比較適合開始'],brain:'你的大腦不是壞掉，\n是在說：這件事在這裡太模糊。',translate:'我可能怕失敗，或任務太大',need:['安全感','小一點的第一步'],action:'把任務切到5分鐘以內的第一步。',rat:'拖延的人通常很會想。\n只是屁股還沒動。',tiger:'你不是只想動起來，\n你是想讓第一步不要太難看。'},
  '空掉':{names:['電量3%但繼續亮著','連情緒都懶得有','什麼都提不起勁版'],brain:'你的大腦不是壞掉，\n是在說：我需要充電了。',translate:'我累了，電量真的很低',need:['休息','不被要求'],action:'今天只做一件讓自己舒服的小事就好。',rat:'空掉不是沒用。\n是手機需要插電而已。',tiger:'你不是只想休息，\n你是想要有人說「停下來也沒關係」。'},
  '不甘心':{names:['這個結果我沒認','我不服但還沒想好怎樣','等我緩過來再說'],brain:'你的大腦不是壞掉，\n是在說：這不是我要的結局。',translate:'這個結果我還沒接受',need:['重來的機會','被理解'],action:'寫下：如果可以再來一次，你會怎麼做？',rat:'不甘心比放棄有力。\n你還沒決定要算了。',tiger:'你不是只想贏回來，\n你是想讓那個努力被看見。'},
  '說不上來':{names:['情緒不明物體入侵中','就是怪怪的但不知道哪裡','還未命名的那個感覺'],brain:'你的大腦不是壞掉，\n是在說：有東西還沒說清楚。',translate:'我有一個還沒說出來的需求',need:['被理解','被看見'],action:'選一個最接近的感覺，試著說說看。',rat:'說不清楚沒關係。\n小天鼠先陪你坐一下。',tiger:'你不是只想想清楚，\n你是想要有人說「我懂你說的」。'},
  '完美主義':{names:['高標準穿著焦慮的外套','怕被看見做不好的那種','草稿永遠不夠好版'],brain:'你的大腦不是壞掉，\n是在說：我不想被看見失敗。',translate:'我可能擔心做出來被否定',need:['安全感','被接納的失敗空間'],action:'先做一個「故意不完美」的版本。',rat:'完美主義是高標準\n穿著焦慮的外套。',tiger:'你不是只想做好，\n你是想做出一個連自己都信服的東西。'},
  '想放棄':{names:['電量耗盡準備關機','撐著不知道為了什麼','再撐一下但不知道為什麼'],brain:'你的大腦不是壞掉，\n是在說：我需要充電了。',translate:'我累了，不一定是我不行',need:['休息','支持'],action:'先休息一天，再決定要不要放棄。',rat:'累的時候做的決定，\n通常不是真的。',tiger:'你不是只想停下來，\n你是想要有人說「你已經走很遠了」。'}
};
var LOST_FALLBACK={names:['就是怪怪的但不知道哪裡','情緒不明物體','還未命名的感覺'],brain:'你的大腦不是壞掉，\n是在說：有東西還沒說清楚。',translate:'我有一個還沒說出來的需求',need:['被理解','被看見'],action:'先選一個最接近的感覺，試著說說看。',rat:'說不清楚沒關係。\n小天鼠先陪你坐一下。',tiger:'迷航不是退步。\n是還在找方向而已。'};

var STRENGTH_MAP=[
  {kw:['健康','養生','料理','食療'],trait:'照顧力',power:'你會把照顧別人的細節做到位，這是很多人學不來的耐心。'},
  {kw:['旅行','旅居','旅遊','帶團'],trait:'探索力',power:'你會把陌生變成有溫度的路線，讓人安心跟著走。'},
  {kw:['故事','寫作','文案','創作'],trait:'表達力',power:'你會把零散的素材說成有畫面的故事。'},
  {kw:['AI','系統','工具','倉管','名片'],trait:'創造力',power:'你會把麻煩的流程變成可以複製的系統。'},
  {kw:['教學','教育','老師','陪伴孩子'],trait:'引導力',power:'你很會把複雜的事拆成別人聽得懂的步驟。'},
  {kw:['孩子','小孩','家庭'],trait:'陪伴力',power:'你會把陪伴這件事做得很細，這份耐心是稀缺資源。'},
  {kw:['品牌','整合','行銷'],trait:'整合力',power:'你會把看似不相關的東西串成一條完整的路。'},
  {kw:['賺錢','創業','生意'],trait:'生存力與企圖心',power:'你不是只想賺錢，你想讓人變好，這份企圖心很值錢。'},
  {kw:['委屈','在意','壓力'],trait:'高敏感與重視關係',power:'你對關係特別敏銳，這份敏感能讓人感覺被理解。'}
];
var NEUTRAL_TRAITS=[
  {trait:'觀察力',power:'你能注意到別人忽略的細節，這種敏銳感知是稀缺的能力。'},
  {trait:'行動力',power:'你願意把想法說出來，這一步就已經比大多數人走得遠了。'},
  {trait:'適應力',power:'你能在不確定的狀況下繼續走，這本身就是一種很強的能力。'}
];

var DIRECTOR_TEMPLATES=[
  {genre:'溫暖喜劇人生片',titlePattern:'《先吹再說》',antagonist:'不是別人，是腦中那句「我真的可以嗎？」',
   act1:'你想開始，但一直懷疑自己。',act2:'你把「{subject}」的大餅一塊一塊畫出來，每塊都比上一塊大。',act3:'你發現自己不是亂想，是在打造一條陪人變好的路。',
   ending:'她不是等到準備好才開始，她是開始之後，才慢慢準備好。'},
  {genre:'逆風成長喜劇',titlePattern:'《卡關現場直播》',antagonist:'不是對手，是那句「反正我做不到」的自我預言。',
   act1:'你被現實打了一巴掌，覺得自己很廢。',act2:'你對「{subject}」亂吹牛，意外吹出了一條看起來還不錯的路。',act3:'你發現自己其實一直都在準備，只是沒人跟你說。',
   ending:'卡關不是結局，是劇情正在轉場而已。'},
  {genre:'熱血翻身紀錄片',titlePattern:'《今天先唬爛，明天再努力》',antagonist:'不是市場，是心裡那個怕丟臉的小聲音。',
   act1:'你什麼都沒做，光是想「{subject}」就先累了。',act2:'你決定先把「{subject}」說出來，再說會不會成功。',act3:'你發現自己一邊吹牛一邊真的在動手了。',
   ending:'你不是路人甲，你是自己人生的導演。'}
];

var SONG_VERSE_TEMPLATES=[
  '今天關於{subject}的事打到我了，一時不知道該怎麼說',
  '原來{subject}這條路，比我想的還彎',
  '心裡藏著一句關於{subject}的話，還沒說出口',
  '誰說{subject}一定要有個標準答案',
  '我一直以為{subject}離我很遠，原來早就在這裡了'
];
var SONG_HOOKS=['笑著扛下去','吹大這個夢','先唬爛再努力','把崩潰寫成歌','把委屈變成光'];
var SONG_CLOSERS=['這就是我的故事','這就是我的劇本','這一段才剛開始','我還在繼續寫'];

var IMG_STYLES=['溫暖手繪插畫風','電影感寫實風','療癒水彩風','復古海報風','黑金電影海報風'];
var IMG_COLORS=['金黃與暖橘漸層','深咖啡與米白對比','夜市霓虹暖光','清晨金光'];
var SHOT_TYPES=['遠景，建立場景氛圍','特寫，主角表情','中景，主角行動','空拍，象徵轉折','慢動作，情緒高點'];

var SHARE_TEMPLATES={
  line:'今天被生活氣到差點原地升天，結果小天鼠幫我翻譯完，我笑出來了。原來我不是崩潰，是人生正在做效果。',
  fb:'本來只是想抱怨一下，結果這個AI幫我把人生寫成了一段故事，連我自己都笑了。#笑鼠人了',
  ig:'把崩潰交給小天鼠，把夢想交給唬爛虎。#笑鼠人了 #人生創作工廠',
  threads:'原來我不是廢，我只是還沒打燈。'
};

var ROAST_CATEGORIES={
  work:{keywords:['老闆','主管','加班','改稿','客戶','同事','上班','專案','報告','會議','開會','工作','廠商','業績'],lines:[
    '工作不是看誰做得好。\n是看誰會甩鍋。你還沒到那關。',
    '「再小改一下」翻成人話：\n重做一次，語氣裝輕鬆。',
    '開會三小時，結論：「我們再討論。」\n你的人生正在被做成PPT。',
    '不是你效率差。\n是需求一直在跑，你一直在追。',
  ]},
  family:{keywords:['媽','爸','婆婆','公公','小孩','孩子','家人','老公','老婆','另一半'],lines:[
    '家人說話直，\n是因為知道你不會真的翻臉。',
    '他不是不關心你。\n他是用碎念當關心的語言。',
    '家裡的帳算不清楚，\n因為大家用感情換算法。',
  ]},
  money:{keywords:['錢','薪水','帳單','房租','貸款','存款','花費','收入','負債'],lines:[
    '錢包扁的時候，\n連呼吸都在花成本。',
    '不是不會理財。\n是支出比你早到一步。',
    '存錢的決心很強。\n意外開銷的決心更強。',
  ]}
};
var SELFMOCK_CATEGORIES={
  work:{keywords:['老闆','主管','客戶','同事','被罵','挨罵','破口大罵','工作','開會','改稿','上班','報告','廠商'],lines:[
    '老闆罵完，表面點頭。\n腦內已開了三場離職記者會。',
    '我沒有沒反應。\n靈魂先去樓下避難，身體說「好的」。',
    '客戶改第N次。\n腦內廢稿博物館今天又開了新館。',
    '開完這個會：三杯水、兩塊餅乾、一個隔音艙。',
    '我沒崩潰。\n靈魂去停車場透氣，身體繼續上班。',
  ]},
  diet:{keywords:['減肥','宵夜','吃','胖','體重','健身','卡路里','節食'],lines:[
    '我不是胖。\n我是福氣有立體感。',
    '運動計畫很滿。\n滿到沒時間運動。',
    '減肥輸給宵夜。\n不是意志力問題，是對手太強。',
    '我不是沒毅力。\n只是遇到了很強的對手。',
  ]},
  procrastinate:{keywords:['拖延','deadline','截止','還沒做','來不及','明天再說','懶得'],lines:[
    '不是拖延。\n是在等十一點五十九分那股爆發力。',
    '我的待辦清單很長，\n長到「開始」還排在後面。',
    '我不是沒計畫。\n是計畫太多，忘記第一條是什麼。',
    '截止日前一小時，效率是平常七倍。\n這是天賦。',
  ]},
  money_self:{keywords:['亂花錢','又買了','購物','刷卡'],lines:[
    '我不是亂花錢。\n我是在做快樂市場調查。',
    '錢包很均勻地瘦。\n跟我的決心一樣。',
  ]}
};

function pickCategoryLine(categories,input,fallbackArr,bankKey){
  var keys=Object.keys(categories);
  for(var i=0;i<keys.length;i++){
    var cat=categories[keys[i]];
    if(cat.keywords.some(function(k){return input.indexOf(k)!==-1;}))
      return pickVaried(bankKey+'_'+keys[i],cat.lines);
  }
  return pickVaried(bankKey,fallbackArr);
}

var LOST_SYNONYMS={'羨慕':['羨慕','好想要他那樣'],'嫉妒':['嫉妒','吃醋','憑什麼他'],'生氣':['生氣','氣死','火大','不爽','怒'],'委屈':['委屈','受傷','不被理解','沒人看見'],'焦慮':['焦慮','緊張','不安','慌','睡不著','擔心'],'煩躁':['煩躁','煩死了','好煩','說不清楚哪裡煩'],'拖延':['拖延','懶得做','deadline','一直拖'],'空掉':['空掉','沒力氣','提不起勁','什麼都不想做'],'不甘心':['不甘心','我不服','這樣不公平','不甘'],'說不上來':['說不上來','說不清楚','怪怪的','就是不對'],'完美主義':['完美主義','怕做不好','怕丟臉','永遠不夠好'],'想放棄':['想放棄','撐不下去','不想做了','累死了']};
function detectEmotion(input){
  var keys=Object.keys(LOST_SYNONYMS);
  for(var i=0;i<keys.length;i++) if(LOST_SYNONYMS[keys[i]].some(function(s){return input.indexOf(s)!==-1;})) return keys[i];
  return null;
}
var NEED_TO_WISH_MAP={
  '被尊重':'我想清楚表達界線，也希望自己的感受被尊重',
  '有界線':'我想清楚表達界線，也希望自己的感受被尊重',
  '安全感':'我想知道下一步怎麼走，讓事情變得比較可掌握',
  '可預測性':'我想知道下一步怎麼走，讓事情變得比較可掌握',
  '被看見':'我想做出看得見的成果，讓努力被認可',
  '有成果':'我想做出看得見的成果，讓努力被認可',
  '被理解':'我想讓身邊的人知道我真正的感受，而不只是猜測',
  '被重視':'我想讓身邊的人知道我真正的感受，而不只是猜測',
  '有選擇權':'我想在這件事上有更多主動權，不再只能被動接受',
  '被肯定':'我想做出讓自己也認可的事，不只是等別人來肯定我',
  '小一點的第一步':'我想找到一個五分鐘就能開始的小動作，先動起來再說',
  '休息':'我想先充個電，然後帶著更清醒的頭腦繼續',
  '不被要求':'我想要有人告訴我，停下來一下也沒關係',
  '排列優先順序':'我想把這堆事情整理成一個順序，先知道從哪裡開始',
  '重來的機會':'我想要有機會再試一次，讓那個努力不是白費的',
  '空間':'我想找一個先暫停的方式，讓腦子清一清再繼續'
};
function needToWish(needStr){
  if(!needStr) return '';
  var parts=needStr.split('、');
  for(var i=0;i<parts.length;i++){
    var n=parts[i].trim();
    if(NEED_TO_WISH_MAP[n]) return NEED_TO_WISH_MAP[n];
  }
  return '我想讓「'+needStr+'」這件事，慢慢變成可能的。';
}

var QUOTE_BANK={
  roast:{weight:30,lines:['「再小改一下」＝重做。','他講得輕鬆，因為做的人不是他。','同一句話打三次，誰受得了。','他不是在溝通，他是在甩鍋。','你不是反應大，是真的被惹到了。','說隨口說說的，通常最不隨口。','崩潰不是失敗，是人生在做效果。']},
  selfmock:{weight:30,lines:['計畫超多，多到忘記第一條，超有實力。','我不是廢，我是把廢發揮到很有效率。','我不是沒用，只是今天當機了而已。','我不是亂，我是素材太多，需要一個鍋子。','我的理智在現場，情緒在繞圈圈，兩個還沒碰到面。','我不是沒出力，是力氣花在別人注意不到的地方。']},
  bigdream:{weight:20,lines:['先吹再說，做出來再讓他們驚訝。','餅先畫大，路自己會冒出來。','夢想不夠唬爛，通常也不夠大。','今天吹牛，明天努力，後天說不定就成真。','先讓自己敢講，再讓自己敢做。']},
  nonsense:{weight:10,lines:['魚不知道自己在水裡，你大概也不知道自己很拚了。','太陽明天還是會升起，跟你今天有沒有報告沒關係。','人生跟夜市一樣，重點不是攤位，是順路。']},
  warm:{weight:10,lines:['輕一點就好，不用馬上變好。','撐過來這件事，本身就值得鼓掌。','笑完了，該面對的事還在，但你現在輕一點了。','你不需要全部都想清楚，先往前一步就好。']}
};
var MODE_QUOTE_WEIGHTS={
  roast:{roast:80,selfmock:0,bigdream:5,nonsense:10,warm:5},
  selfmock:{roast:10,selfmock:60,bigdream:5,nonsense:10,warm:15},
  bigdream:{roast:5,selfmock:10,bigdream:60,nonsense:5,warm:20},
  lost:{roast:5,selfmock:15,bigdream:20,nonsense:10,warm:50},
  strength:{roast:5,selfmock:10,bigdream:30,nonsense:5,warm:50},
  director:{roast:10,selfmock:10,bigdream:30,nonsense:10,warm:40},
  workshop:{roast:5,selfmock:15,bigdream:40,nonsense:10,warm:30},
  share:{roast:15,selfmock:25,bigdream:25,nonsense:10,warm:25}
};
function pickGoldenQuote(mode){
  var w=(mode&&MODE_QUOTE_WEIGHTS[mode])?MODE_QUOTE_WEIGHTS[mode]:null;
  var keys=Object.keys(QUOTE_BANK);
  var total=keys.reduce(function(s,k){return s+(w?w[k]:QUOTE_BANK[k].weight);},0);
  var r=Math.random()*total, acc=0, chosen=keys[keys.length-1];
  for(var i=0;i<keys.length;i++){acc+=(w?w[keys[i]]:QUOTE_BANK[keys[i]].weight);if(r<=acc){chosen=keys[i];break;}}
  return pickVaried('quote_'+chosen,QUOTE_BANK[chosen].lines);
}

/* ---------------------------------------------------
   5. 模式定義 + 流程設定
--------------------------------------------------- */
var MODES=[
  {id:'roast',  icon:'😤',title:'嗆聲模式',  desc:'我現在很想罵，但我想罵得有才華。',role:'rat'},
  {id:'selfmock',icon:'🤣',title:'自嘲模式',  desc:'笑自己一下，人生就沒那麼尷尬。',role:'rat'},
  {id:'bigdream',icon:TIGER_ICON_MD,title:'畫大餅模式',desc:'先吹出來，搞不好就開始了。',role:'tiger'},
  {id:'lost',   icon:'🧠',title:'腦內導航',  desc:'幫這團情緒取個像樣的名字。',role:'lost'},
  {id:'strength',icon:'💎',title:'我的亮點',  desc:'你不是沒有光，只是還沒打燈。',role:'shine'},
  {id:'director',icon:'🎬',title:'自導自演',  desc:'把這段人生寫成一部電影。',role:'director'},
  {id:'workshop',icon:'🎤',title:'創作工坊',  desc:'把故事寫成歌，畫成圖，做成影片。',role:'workshop'},
  {id:'share',  icon:'📣',title:'分享模式',  desc:'一鍵產生社群文案，讓朋友一起笑。',role:'share'}
];
var QUICK_MODES=['roast','selfmock','bigdream','lost'];
var ADVANCED_MODES=['strength','director','workshop','share'];
var ROUTE_B_ORDER=['lost','bigdream','strength','director','workshop','share'];
var STEP_NAMES=['情緒翻譯','找出願望','整理亮點','自導自演','創作工坊','分享作品'];
var STEP_QUESTIONS=[
  '最近哪件事讓你最有感？',
  '這份情緒背後，你最希望改變什麼？',
  '為了這件事，你做過、撐過或學會了什麼？',
  '如果這是電影，你希望主角最後做到什麼？',
  '想把故事做成搞笑、溫暖還是熱血作品？',
  '選一個最想讓朋友看見的版本。'
];

/* ---------------------------------------------------
   6. flow 狀態 + localStorage 草稿
--------------------------------------------------- */
var DRAFT_KEY='lsr_draft_v2';
function emptyContext(){
  return {event:'',emotion:'',translation:'',need:'',wish:'',traits:[],filmTitle:'',story:{},songVersions:[],selectedSongVersion:'',imagePrompts:[],storyboard:[],shareCopy:{},shareCard:null,lastQuote:'',topic:'',comicWorld:null,truth:'',analogy:'',honest:'',boundary:'',comicExit:'',nextAction:'',resolutionWish:'',callback:'',targetCategory:'',situationCategory:''};
}
var flow={routeB:false,stepIndex:0,input:'',context:emptyContext()};
var roastV2State={lastWorld:null,pendingGuidedInput:null};
var roastResult={activeEngine:'original',engines:{original:null,spicy:null}};
var bigDreamResult={activeEngine:'small',engines:{small:null,crazy:null}};

/* ── ENGINE_REGISTRY ────────────────────────────────────────────── */
var ENGINE_REGISTRY={
  roast:{defaultEngine:'original',engines:['original','spicy']},
  bigdream:{defaultEngine:'small',engines:['small','crazy']}
};
function setActiveEngine(mode,engineKey){
  if(mode==='roast') roastResult.activeEngine=engineKey;
  if(mode==='bigdream') bigDreamResult.activeEngine=engineKey;
}

function saveDraft(){
  try{ localStorage.setItem(DRAFT_KEY,JSON.stringify({ts:Date.now(),context:flow.context,stepIndex:flow.stepIndex,input:flow.input,routeB:flow.routeB})); }catch(e){}
}
function loadDraft(){
  try{
    var raw=localStorage.getItem(DRAFT_KEY); if(!raw) return null;
    var d=JSON.parse(raw);
    if(Date.now()-d.ts>7*24*60*60*1000){clearDraft();return null;}
    return d;
  }catch(e){return null;}
}
function clearDraft(){ try{localStorage.removeItem(DRAFT_KEY);}catch(e){} }
function resetFlow(){ flow={routeB:false,stepIndex:0,input:'',context:emptyContext()}; clearDraft(); }

/* ---------------------------------------------------
   7. 生成器
--------------------------------------------------- */
function genRoast(input,target){
  target=target||'其他';
  var detected=detectRoastSituation(input,target);
  var tk=detected.targetKey;
  var sk=detected.situationKey;
  var mt=detected.matchType;
  var db=TARGET_ROAST_DB[tk]||TARGET_ROAST_DB.other;
  var pool=(sk&&db.situations&&db.situations[sk])?db.situations[sk]:db.general;
  var cacheBase='rv_'+tk+'_'+(sk||'g')+'_';
  var vars={target:target,input:shortInput(input,20)};
  // comicWorld：有定義才啟用，同次生成鎖定同一世界
  var cw=null;
  var worldData=null;
  if(pool.availableWorlds&&pool.worlds&&pool.availableWorlds.length){
    cw=pickVaried(cacheBase+'w',pool.availableWorlds);
    worldData=pool.worlds[cw]||null;
  }
  var truth=fill(pickVaried(cacheBase+'t',pool.truth),vars);
  var analogySrc=(worldData&&worldData.analogy)?worldData.analogy:pool.analogy;
  var analogy=fill(pickVaried(cacheBase+'a',analogySrc),vars);
  var honest=fill(pickVaried(cacheBase+'h',pool.honest),vars);
  var boundary=fill(pickVaried(cacheBase+'b',pool.boundary),vars);
  // comicExit 接在界線句後，不另開卡片
  var exitSrc=(worldData&&worldData.comicExit)?worldData.comicExit:(pool.comicExit||null);
  var comicExit=exitSrc?pickVaried(cacheBase+'e',exitSrc):'';
  var boundaryText=comicExit?boundary+'\n'+comicExit:boundary;
  var rwSrc=(worldData&&worldData.resolutionWish)?worldData.resolutionWish:(pool.resolutionWish||null);
  var resolutionWish=rwSrc?pickVaried(cacheBase+'rw',rwSrc):'';
  var cbSrc=(worldData&&worldData.callback)?worldData.callback:(pool.callback||null);
  var callback=cbSrc?pickVaried(cacheBase+'cb',cbSrc):'';
  return {
    role:'rat',tagClass:'vent tag-rat',
    targetCategory:tk,situationCategory:sk||'general',matchType:mt,
    comicWorld:cw||null,
    truth:truth,analogy:analogy,honest:honest,boundary:boundary,comicExit:comicExit,
    nextAction:worldData?(worldData.nextAction||''):'',
    resolutionWish:resolutionWish,
    callback:callback,
    blocks:[
      ['🔥 你真正氣的是',truth],
      ['🎭 幽默比喻版',analogy],
      ['💬 不敢講的真心話',honest],
      ['🧱 現實界線句',boundaryText]
    ],
    quote:pickGoldenQuote('roast')
  };
}
var SELFMOCK_SUMMARY_MAP={
  work:'你沒有輸，靈魂只是先去樓下透氣，身體繼續撐著。',
  diet:'你不是沒有毅力，只是遇到了真的很強勁的對手。',
  procrastinate:'你不是懶，你是在等那個神秘的最後一刻爆發力。',
  money_self:'你不是亂花，你是在做非常即時的市場調研。'
};
function genSelfmock(input){
  var catKey=null;
  var keys=Object.keys(SELFMOCK_CATEGORIES);
  for(var i=0;i<keys.length;i++){
    if(SELFMOCK_CATEGORIES[keys[i]].keywords.some(function(k){return input.indexOf(k)!==-1;})){catKey=keys[i];break;}
  }
  var summary=catKey&&SELFMOCK_SUMMARY_MAP[catKey]
    ?SELFMOCK_SUMMARY_MAP[catKey]
    :'你不是真的很糟，「'+shortInput(input)+'」這件事確實值得被好好面對。';
  var translate=pickVaried('rat_brain',RAT_BRAIN_TRANSLATE);
  var event=shortInput(input,16);
  var fallback=RAT_SELFMOCK.map(function(t){return fill(t,{event:event});});
  var bit=catKey
    ?pickVaried('rat_selfmock_'+catKey,SELFMOCK_CATEGORIES[catKey].lines)
    :pickVaried('rat_selfmock',fallback);
  return {role:'rat',tagClass:'vent tag-rat',blocks:[['🧠 自嘲摘要',summary],[RAT_ICON+' 小天鼠翻譯',translate],['🤣 自嘲段子',bit]],quote:pickGoldenQuote('selfmock')};
}
function genBigDream(input,topic){
  // 嗆聲 homework 情境：用 comicWorld 專屬唬爛虎
  var cw=flow.context.comicWorld;
  if(cw&&flow.context.situationCategory==='homework'&&flow.context.targetCategory==='child'){
    var hwSit=(TARGET_ROAST_DB.child||{}).situations&&TARGET_ROAST_DB.child.situations.homework;
    var wd=hwSit&&hwSit.worlds&&hwSit.worlds[cw];
    if(wd&&wd.tiger){
      return {role:'tiger',tagClass:'tag-tiger',blocks:[[TIGER_ICON+' 唬爛虎接手',wd.tiger],['👣 今天的入口',wd.nextAction||'']],quote:pickGoldenQuote('bigdream')};
    }
  }
  topic=topic||shortInput(input,14);
  var wishLine=fill(pickVaried('tiger_wish',TIGER_WISH),{topic:topic});
  var bragLine=fill(pickVaried('tiger_brag',TIGER_BRAG),{topic:topic});
  var pie=fill(pickVaried('tiger_pie',TIGER_PIE),{topic:topic});
  var parallel=fill(pickVaried('tiger_parallel',TIGER_PARALLEL),{topic:topic});
  return {role:'tiger',tagClass:'tag-tiger',blocks:[[TIGER_ICON+' 唬爛虎翻譯',wishLine],[TIGER_ICON+' 吹牛版',bragLine],['🥞 畫大餅版',pie],['🌌 平行宇宙版',parallel]],quote:pickGoldenQuote('bigdream')};
}
function genLost(input,emotionKey){
  var entry=LOST_MAP[emotionKey]||LOST_FALLBACK;
  var name=entry.names[Math.floor(Math.random()*entry.names.length)];
  return {role:'lost',tagClass:'tag-lost',need:entry.need,translation:entry.translate,emotionName:name,blocks:[['🏷️ 今日情緒名稱',name],['🧠 腦內翻譯',entry.brain],[RAT_ICON+' 小天鼠',entry.rat],[TIGER_ICON+' 唬爛虎',entry.tiger],['👣 今日小動作',entry.action]],quote:pickGoldenQuote('lost')};
}
function genStrength(input){
  // homework fast path：回收 comicWorld 資料
  var cw=flow.context.comicWorld;
  if(cw&&flow.context.situationCategory==='homework'&&flow.context.targetCategory==='child'){
    var hwSit=(TARGET_ROAST_DB.child||{}).situations&&TARGET_ROAST_DB.child.situations.homework;
    var wd=hwSit&&hwSit.worlds&&hwSit.worlds[cw];
    if(wd){
      var worldName=wd.name||cw;
      var comicExitText=flow.context.comicExit||(wd.comicExit&&wd.comicExit[0])||'';
      var nextActionText=wd.nextAction||'';
      var callbackText=flow.context.callback||(wd.callback&&wd.callback[0])||'';
      var analogyText=flow.context.analogy||(wd.analogy&&wd.analogy[0])||'';
      return {
        role:'shine',tagClass:'tag-shine',
        traits:['看見真正的問題','守住界線還留出口','用'+worldName+'的眼光下台'],
        blocks:[
          ['🔑 你剛才做到的事','沒有追著作業跑，用'+worldName+'的眼光看見了真正的問題。'],
          ['💎 你的亮點','說清楚了界線，同時給對方留了出口——「'+comicExitText+'」'],
          ['⚡ 你的超能力',callbackText||analogyText],
          ['🧩 今天的下一步',nextActionText]
        ],
        quote:pickGoldenQuote('strength')
      };
    }
  }
  var lower=input||'';
  var matched=STRENGTH_MAP.filter(function(item){return item.kw.some(function(k){return lower.indexOf(k)!==-1;});});
  if(!matched.length) matched=[NEUTRAL_TRAITS[Math.floor(Math.random()*NEUTRAL_TRAITS.length)]];
  var traits=matched.slice(0,3);
  var keywordList=traits.map(function(t){return t.trait;}).join('、');
  var powerLine=traits.map(function(t){return t.power;}).join('\n');
  return {role:'shine',tagClass:'tag-shine',traits:traits.map(function(t){return t.trait;}),blocks:[['🔑 我聽見的關鍵字',shortInput(input,30)],['💎 可能亮點',keywordList],['⚡ 你的超能力',powerLine],['🧩 適合你的創作方向',traits.map(function(t){return t.trait;}).join(' x ')+' 的內容創作或服務']],quote:pickGoldenQuote('strength')};
}
function genDirector(input,context){
  // homework fast path：回收 comicWorld 資料
  var cw=(context||flow.context).comicWorld;
  var scat=(context||flow.context).situationCategory;
  var tcat=(context||flow.context).targetCategory;
  if(cw&&scat==='homework'&&tcat==='child'){
    var hwSit=(TARGET_ROAST_DB.child||{}).situations&&TARGET_ROAST_DB.child.situations.homework;
    var wd=hwSit&&hwSit.worlds&&hwSit.worlds[cw];
    if(wd){
      var ctx=context||flow.context;
      var worldName=wd.name||cw;
      var analogyText=ctx.analogy||(wd.analogy&&wd.analogy[0])||'';
      var comicExitText=ctx.comicExit||(wd.comicExit&&wd.comicExit[0])||'';
      var nextActionText=wd.nextAction||'';
      var resolutionText=ctx.resolutionWish||(wd.resolutionWish&&wd.resolutionWish[0])||'';
      var callbackText=ctx.callback||(wd.callback&&wd.callback[0])||'';
      var truthText=ctx.truth||(hwSit.truth&&hwSit.truth[0])||'';
      return {
        role:'director',cinema:true,
        title:'《用'+worldName+'看「孩子不寫作業」》',
        genre:worldName+'喜劇',
        antagonist:'那份比孩子還不安的焦慮——它比作業更早到，也比作業更慢走。',
        act1:analogyText?analogyText+'  作業最從容，孩子其次，整個場面就這樣卡著等第一個人動。'
          :'孩子不寫作業，場面安靜——作業、孩子、大人，三個全在等彼此先動。',
        act2:comicExitText?comicExitText+'  真相是：'+truthText
          :'說清楚界線，同時給對方留了出口。'+truthText,
        act3:resolutionText+'\n\n今天的起點：'+nextActionText,
        ending:callbackText
      };
    }
  }
  var tpl=pickVaried('director',DIRECTOR_TEMPLATES);
  var event=shortInput(context.event||input,20);
  var emotion=context.emotion||'';
  var wish=shortInput(context.wish||context.topic||input,16);
  var traits=context.traits&&context.traits.length?context.traits:[];
  var traitStr=traits.join('、');
  var ending=input||context.wish||wish;
  flow.context.ending=ending;
  var emotionSuffix=emotion?'，感到'+emotion:'';
  var act1=event
    ?'「'+event+'」'+emotionSuffix+'——主角站在原地，懷疑自己是不是走錯了。'
    :fill(tpl.act1,{subject:wish});
  var act2=traitStr
    ?'主角沒有放棄，因為他發現自己有：'+traitStr+'，只是還沒打燈。'
    :fill(tpl.act2,{subject:wish});
  var act3=ending
    ?'主角最後決定去做「'+ending+'」——不是因為準備好了，是因為不做更後悔。'
    :fill(tpl.act3,{subject:wish});
  var ANTAGONIST_POOL=[
    '心裡那個說「'+wish+'這件事你做不到」的聲音',
    '心裡那個說「這個願望太誇張了，算了吧」的聲音',
    '心裡那個問「你真的準備好了嗎」的聲音，一直在那邊響',
    '那個說「先等等，再說啦」的習慣——其實是恐懼穿著拖延的外衣'
  ];
  return {role:'director',cinema:true,title:tpl.titlePattern,genre:tpl.genre,
    antagonist:'不是別人，是'+pickVaried('antagonist',ANTAGONIST_POOL)+'。',
    act1:act1,act2:act2,act3:act3,ending:tpl.ending};
}
function genSong(context,length){
  length=length||'standard';
  var subject=shortInput(context&&context.topic?context.topic:'這段故事',14);
  var lines=[];
  lines.push(fill(pickVaried('song_verse_1',SONG_VERSE_TEMPLATES),{subject:subject}));
  lines.push('小天鼠先笑一笑，唬爛虎先吹一吹');
  lines.push(pickVaried('song_hook',SONG_HOOKS));
  lines.push('我不是輸了，我只是還沒贏而已');
  if(length!=='quick'){
    lines.push(fill(pickVaried('song_verse_2',SONG_VERSE_TEMPLATES),{subject:subject}));
    lines.push('委屈不用忍，先讓它變成一句詞');
    lines.push('夢想不嫌大，先吹出來再上路');
  }
  if(length==='full'){
    lines.push('第一幕卡關，第二幕轉場');
    lines.push(fill(pickVaried('song_verse_3',SONG_VERSE_TEMPLATES),{subject:subject}));
    lines.push('這不是崩潰，是劇情在鋪陳');
  }
  lines.push(pickVaried('song_close',SONG_CLOSERS));
  return {title:'《'+subject+'：'+(length==='quick'?'快速版':length==='full'?'完整版':'標準版')+'》',lengthLabel:length==='quick'?'15–20秒':(length==='full'?'90秒':'45–60秒'),lineCount:lines.length,lines:lines};
}
function genImagePrompt(context){
  var subject=shortInput(context&&context.topic?context.topic:'一個正在重新喜歡人生的人',20);
  return pickVaried('img_style',IMG_STYLES)+'、'+pickVaried('img_color',IMG_COLORS)+'。畫面主角：'+subject+'，神情從疲憊轉為帶著希望的微笑。背景帶有溫暖光線與一點電影感留白，整體氛圍：療癒、幽默、不悲情。';
}
function genStoryboard(context,length){
  var subject=shortInput(context&&context.topic?context.topic:'主角',14);
  var shotCount=length==='quick'?2:(length==='full'?6:4);
  var shots=[];
  for(var i=0;i<shotCount;i++) shots.push({no:i+1,shot:pickVaried('shot',SHOT_TYPES),body:subject+(i===0?' 站在卡關的現場':(i===shotCount-1?' 露出笑容，準備往下一步走':' 開始為自己的願景行動'))});
  return shots;
}
function genShareCopy(context){
  // 嗆聲 homework：用 comicWorld callback 做世界感分享文案
  var cw=context&&context.comicWorld;
  if(cw&&context.situationCategory==='homework'&&context.targetCategory==='child'){
    var hwSit=(TARGET_ROAST_DB.child||{}).situations&&TARGET_ROAST_DB.child.situations.homework;
    var wd=hwSit&&hwSit.worlds&&hwSit.worlds[cw];
    if(wd){
      var cbText=context.callback||'';
      var rwText=context.resolutionWish||'';
      var hookText='';
      if(context.songVersions&&context.songVersions.length){
        var sv=(context.selectedSongVersion&&context.songVersions.filter(function(v){return v.version===context.selectedSongVersion;})[0])||context.songVersions[0];
        if(sv) hookText=sv.hook||'';
      }
      var worldName=wd.name||cw;
      return {
        line:'孩子不寫作業，今天用'+worldName+'理解了我自己的焦慮。'+(cbText?'\n\n「'+cbText+'」':'')+( hookText?'\n\n「'+hookText+'」':''),
        fb:'本來因為孩子不寫作業很煩，小天鼠用'+worldName+'幫我把這件事說清楚了，還笑出來了。'+(cbText?'\n「'+cbText+'」':'')+( hookText?'\n「'+hookText+'」':'')+'\n#笑鼠人了',
        ig:'用'+worldName+'的眼光看孩子不寫作業。'+(rwText?'\n「'+rwText+'」\n':'')+(hookText?'「'+hookText+'」\n':'')+'#笑鼠人了',
        threads:cbText?'「'+cbText+'」 #笑鼠人了':'用今天的眼光重新看了這件事 #笑鼠人了',
        hook:hookText||cbText
      };
    }
  }
  var event=shortInput(context&&context.event?context.event:'',20);
  var topic=shortInput(context&&context.topic?context.topic:'',14);
  var filmTitle=context&&context.filmTitle?context.filmTitle:'';
  var lastQuote=context&&context.lastQuote?context.lastQuote:'';
  /* Fix 9: 優先使用使用者選定的版本 hook */
  var selectedSong=null;
  if(context.songVersions&&context.selectedSongVersion){
    selectedSong=context.songVersions.filter(function(v){return v.version===context.selectedSongVersion;})[0]||null;
  }
  if(!selectedSong&&context.songVersions&&context.songVersions.length) selectedSong=context.songVersions[0];
  var hookText=selectedSong?selectedSong.hook:'';
  return {
    line:event
      ?'今天「'+event+'」讓我有點崩潰，結果小天鼠幫我翻譯完，我笑出來了。原來不是我有問題，是人生正在做效果。'+(hookText?'\n\n「'+hookText+'」':'')
      :SHARE_TEMPLATES.line,
    fb:topic
      ?'本來只是想搞清楚「'+topic+'」這件事，結果AI幫我把它寫成了一段人生劇本。'+(hookText?'\n「'+hookText+'」':'')+'\n#笑鼠人了'
      :SHARE_TEMPLATES.fb,
    ig:filmTitle
      ?'我的人生微電影：'+filmTitle+'。'+(hookText?'\n「'+hookText+'」\n':'')+'把崩潰交給小天鼠，把夢想交給唬爛虎。#笑鼠人了'
      :SHARE_TEMPLATES.ig,
    threads:hookText
      ?'「'+hookText+'」 #笑鼠人了'
      :(lastQuote?'「'+lastQuote+'」——小天鼠說的，我覺得說得有點對。 #笑鼠人了':SHARE_TEMPLATES.threads),
    hook:hookText
  };
}

/* ---------------------------------------------------
   7b. 工坊：雙版歌曲生成（含輪替模板）
--------------------------------------------------- */
var SONG_A_HOOKS=[
  '笑掉煩惱，吹大夢想，人生是微電影，我來當主角',
  '我不是沒在努力，只是還沒到點燃那一刻',
  '先笑一下，再說下一步，有時候順序就是這樣',
  '崩潰不可恥，可恥的是崩潰完連笑都忘了'
];
var SONG_A_VERSE2_POOL=[
  '有人說我想太多，好，那我繼續想\n反正「{trait}」這件事，別人學不來',
  '我不是不想行動，只是剛剛才確定方向\n「{trait}」是我的事，不是你說了算',
  '今天輸給宵夜，明天輸給計畫\n但「{trait}」這條路，我沒打算改',
  '說我太理想，我說謝謝\n因為「{trait}」這件事，我本來就不打算只做一半'
];
var SONG_A_BRIDGE_POOL=[
  '不要把成長做得像上課\n不要把覺察做得像考試\n不要把情緒做得像病歷',
  '笑完了還是要面對\n但現在輕一點了\n這樣就夠了',
  '說不清楚的那些事\n先讓它變成一句歌詞\n比解釋省力多了',
  '有時候沒有答案\n只要下一步還能走\n就先走再說'
];
var SONG_A_STYLES=[
  {genre:'輕快 Pop / Lo-fi HipHop',bpmVal:'92',mood:'自嘲、輕鬆、有點酸又溫暖',instruments:'鋼琴 loop、口哨、輕鼓、低音吉他',vocal:'對話感、不刻意賣力、偶爾笑著唱',key:'C major'},
  {genre:'Indie Pop / 電音底',bpmVal:'95',mood:'療癒、有點搞怪、偶爾自言自語',instruments:'木吉他、電子鼓、合成器、鈴鐺',vocal:'隨興、有氣音、像在哼給自己聽',key:'G major'},
  {genre:'Acoustic Folk / 自彈自唱風',bpmVal:'88',mood:'溫暖、自省、有點無奈但笑著',instruments:'木吉他、輕拍掌聲、口風琴',vocal:'自然呼吸感、不修音的真實感',key:'D major'},
  {genre:'Neo-Soul / City Pop 混搭',bpmVal:'96',mood:'都市感、略帶苦澀但結尾甜',instruments:'Rhodes 電鋼琴、Bass、爵士鼓刷',vocal:'有感情但克制、副歌才放開',key:'F major'}
];
var SONG_B_HOOKS=[
  '這不是結局，是第一幕，把「{wish}」說出來，讓夢想先動起來',
  '我還沒輸，只是劇情還沒到那一段，等我',
  '第一幕卡關，第二幕轉場，第三幕是「{wish}」，我來了',
  '不完美就不完美，至少這個故事是我的，不是別人演的'
];
var SONG_B_VERSE2_POOL=[
  '有人說太慢了，我說我在看清楚\n「{trait}」這件事，我只做一次，所以做真的',
  '旁邊的人都比我快，沒關係\n我不是慢，我是在等那個剛好的時機',
  '昨天的我以為沒有下一步\n今天的我知道「{trait}」就是入場券',
  '說夢想太大的人，從來不知道\n最荒謬的那些夢，往往走得最遠'
];
var SONG_B_BRIDGE_POOL=[
  '不要等到完美才開始\n不要等到準備好才說出來\n先吹出你的大餅\n宇宙會決定哪塊先烤熟',
  '第一幕最黑暗的地方\n正是轉場光出現前的最後一秒\n撐過去就是第二幕',
  '有些路第一步最難\n不是因為路太難走\n是因為你太在意會不會走歪',
  '如果這是電影\n你現在在第幾分鐘\n大概就是主角剛決定不放棄的那幕'
];
var SONG_B_STYLES=[
  {genre:'Cinematic Pop / 電影主題曲',bpmVal:'80',mood:'熱血、希望、有點悲壯但最後昂揚',instruments:'弦樂、鋼琴、電吉他、大鼓',vocal:'情感飽滿、有戲劇性、副歌要撐開',key:'E minor → G major'},
  {genre:'Epic Ballad / 史詩流行',bpmVal:'76',mood:'厚重、有分量、像是蓄積多年的一句話',instruments:'管弦樂、大鼓、鋼琴、人聲和聲',vocal:'深沉有力、高音留到橋段後才爆發',key:'A minor'},
  {genre:'Alternative Rock / 另類搖滾',bpmVal:'84',mood:'能量強、衝突感、但結尾有光',instruments:'電吉他、失真底音、爆炸鼓組',vocal:'嘶啞但有情緒、不賣弄技巧',key:'D minor'},
  {genre:'K-Drama OST 風 / 溫柔史詩',bpmVal:'78',mood:'溫柔但有份量、會讓人眼眶紅的那種',instruments:'弦樂四重奏、小提琴主奏、鋼琴伴奏',vocal:'細膩、有氣息、情緒從克制到開放',key:'B minor → D major'},
  {genre:'Comedy Rock / Theatrical Pop',bpmVal:'96',mood:'誇張、自嘲、喜劇感、結尾反轉讓人笑出來',instruments:'銅管、電吉他、拍手聲、誇張和聲',vocal:'帶戲劇感與喜劇停頓、介於說話和唱歌之間',key:'G major'}
];

function genSongVersionA(context){
  // 嗆聲 homework：使用核准歌詞；W3/W4 明確 gating（不默默走通用）
  var cw=context.comicWorld;
  if(cw&&context.situationCategory==='homework'&&context.targetCategory==='child'){
    var hwSit=(TARGET_ROAST_DB.child||{}).situations&&TARGET_ROAST_DB.child.situations.homework;
    var wd=hwSit&&hwSit.worlds&&hwSit.worlds[cw];
    if(wd&&wd.songA){
      var sa=wd.songA;
      return {version:'A',label:'小天鼠版',icon:'🐭',style:sa.style||(wd.name||cw)+' / 嗆聲流行',title:sa.title||'《作業·'+(wd.name||cw)+'版》',concept:sa.concept||'用'+(wd.name||cw)+'的角度說完，笑著下台，兩邊都有台階。',lyrics:sa.lyrics,hook:sa.hook,genre:'Comedy Pop / 嗆聲流行',bpm:'96 BPM',mood:'幽默、自我解嘲、界線清楚',instruments:'電子節拍、口語感旋律',vocal:'口語感、帶喜劇停頓',aiPrompt:sa.aiPrompt||'comedy pop, roast humor, child homework, BPM 96, '+cw};
    }
    // W3 尚未核准專屬歌曲，明確回傳世界摘要，不走通用
    if(wd&&!wd.songA){
      return {version:'A',label:'小天鼠版',icon:'🐭',style:(wd.name||cw)+' / 摘要版（歌曲製作中）',title:'《'+( wd.name||cw)+'嗆聲摘要》',concept:(wd.name||cw)+'世界的專屬歌曲正在依核准內容製作中，以下是本次嗆聲的核心句。',lyrics:(context.boundary||wd.nextAction||'')+(context.comicExit?'\n\n——'+context.comicExit:'')+(context.callback?'\n\n「'+context.callback+'」':''),hook:context.callback||wd.nextAction||'',genre:'世界摘要版',bpm:'',mood:'',instruments:'',vocal:'',aiPrompt:''};
    }
  }
  var event=shortInput(context.event||'這件事',16);
  var wish=shortInput(context.wish||context.topic||'吹大夢想',14);
  var trait=context.traits&&context.traits[0]?context.traits[0]:'笑著往前走';
  var title='《'+wish+'，先說出來再說》';
  var hookTpl=pickVaried('song_a_hook',SONG_A_HOOKS);
  var hook=fill(hookTpl,{wish:wish,trait:trait});
  var verse2Tpl=pickVaried('song_a_v2',SONG_A_VERSE2_POOL);
  var bridge=pickVaried('song_a_bridge',SONG_A_BRIDGE_POOL);
  /* Fix 1：style-chip 影響曲風選取 */
  var sh=context.styleHint||'';
  var stylePool=sh==='溫暖療癒'?[SONG_A_STYLES[2]]:sh==='熱血電影感'?[SONG_A_STYLES[1]]:SONG_A_STYLES;
  var style=pickVaried('song_a_style_'+sh,stylePool);
  var lyrics=[
    '【Verse 1】',
    '今天關於'+event+'的事打到我了',
    '我先笑一下，假裝沒什麼大不了',
    '小天鼠說：這不叫輸，叫人生做效果',
    '',
    '【Pre-Chorus】',
    '我不是沒有辦法，只是還在想第幾個',
    '先吹出來再說，反正宇宙會配合',
    '',
    '【Chorus】',
    hook,
    '就算卡關，就算轉場',
    '先把「'+wish+'」說出口，再說行不行',
    '',
    '【Verse 2】',
    fill(verse2Tpl,{trait:trait,wish:wish}),
    '',
    '【Bridge】',
    bridge,
    '',
    '【Outro】',
    '笑鼠人了，先笑一下就好'
  ].join('\n');
  return {version:'A',label:'小天鼠版',icon:'🐭',style:'幽默・自嘲・短影音風',title:title,concept:'用自嘲的方式把這件事翻成一個讓人笑著點頭的故事——不是說教，是讓聽的人覺得「欸，我也這樣！」',lyrics:lyrics,hook:hook,genre:style.genre,bpm:style.bpmVal+' BPM',mood:style.mood,instruments:style.instruments,vocal:style.vocal,aiPrompt:style.genre.toLowerCase().replace(/\//g,',')+', conversational vocals, self-deprecating humor, warm ending, BPM '+style.bpmVal+', '+event+' theme, '+style.key};
}

function genSongVersionB(context){
  // 嗆聲 homework：使用核准歌詞；W3/W4 明確 gating
  var cw=context.comicWorld;
  if(cw&&context.situationCategory==='homework'&&context.targetCategory==='child'){
    var hwSit=(TARGET_ROAST_DB.child||{}).situations&&TARGET_ROAST_DB.child.situations.homework;
    var wd=hwSit&&hwSit.worlds&&hwSit.worlds[cw];
    if(wd&&wd.songB){
      var sb=wd.songB;
      return {version:'B',label:'唬爛虎版',icon:'🐯',style:sb.style||(wd.name||cw)+' / 嗆聲宣言',title:sb.title||'《作業·'+(wd.name||cw)+'宣言版》',concept:sb.concept||'同一世界 B 面，讓孩子和家長都有台階下。',lyrics:sb.lyrics,hook:sb.hook,genre:'Comedy Rock / 嗆聲宣言',bpm:'100 BPM',mood:'幽默、誇張、自嘲收尾',instruments:'銅管、電吉他、拍手聲',vocal:'帶戲劇感與喜劇停頓',aiPrompt:sb.aiPrompt||'comedy rock, roast declaration, child homework, BPM 100, '+cw};
    }
    // W3 尚未核准專屬歌曲，明確回傳世界摘要，不走通用
    if(wd&&!wd.songB){
      return {version:'B',label:'唬爛虎版',icon:'🐯',style:(wd.name||cw)+' / 摘要版（歌曲製作中）',title:'《'+( wd.name||cw)+'宣言摘要》',concept:(wd.name||cw)+'世界的 B 面歌曲正在製作中，以下是唬爛虎接手後的解法摘要。',lyrics:(wd.tiger||'')+(context.resolutionWish?'\n\n'+context.resolutionWish:'')+(context.nextAction?'\n\n今天的入口：'+context.nextAction:''),hook:context.resolutionWish||wd.nextAction||'',genre:'世界摘要版',bpm:'',mood:'',instruments:'',vocal:'',aiPrompt:''};
    }
  }
  var event=shortInput(context.event||'這件事',16);
  var wish=shortInput(context.wish||context.topic||'吹大夢想',14);
  var trait=context.traits&&context.traits[0]?context.traits[0]:'向前走的力量';
  var filmTitle=context.filmTitle?context.filmTitle.replace(/[《》]/g,''):'人生主題曲';
  var title='《'+filmTitle+'》';
  var hookTpl=pickVaried('song_b_hook',SONG_B_HOOKS);
  var hook=fill(hookTpl,{wish:wish,trait:trait});
  var verse2Tpl=pickVaried('song_b_v2',SONG_B_VERSE2_POOL);
  var bridge=pickVaried('song_b_bridge',SONG_B_BRIDGE_POOL);
  /* Fix 1：style-chip 影響 B 版曲風 */
  var sh=context.styleHint||'';
  var styleBPool=sh==='搞笑自嘲'?[SONG_B_STYLES[4]]:sh==='溫暖療癒'?[SONG_B_STYLES[3]]:sh==='熱血電影感'?[SONG_B_STYLES[0]]:SONG_B_STYLES;
  var style=pickVaried('song_b_style_'+sh,styleBPool);
  var lyrics=[
    '【Intro】（電影感鋼琴引子）',
    '',
    '【Verse 1】',
    '那一天，「'+event+'」再次發生',
    '我站在原地，不知道往哪邊',
    '唬爛虎說：先吹出來，方向之後再說',
    '',
    '【Pre-Chorus】',
    '我知道我想改變，但我還沒輸',
    '因為「'+trait+'」，是我一直有的東西',
    '',
    '【Chorus】',
    hook,
    '就算還沒到，但我已經在路上',
    '笑鼠人了，這就是我的微電影',
    '',
    '【Verse 2】',
    fill(verse2Tpl,{trait:trait,wish:wish}),
    '',
    '【Bridge】',
    bridge,
    '',
    '【Final Chorus】',
    '這不是結局，是我的起點',
    '把「'+wish+'」做成作品，讓故事被看見',
    '笑鼠人了，這就是我的微電影',
    '',
    '【Outro】',
    '笑掉煩惱，吹大夢想，把人生做成作品'
  ].join('\n');
  return {version:'B',label:'唬爛虎版',icon:'🐯',style:'熱血・電影感・人生主題曲',title:title,concept:'把這段人生故事拍成電影感主題曲——有衝突、有反轉、有那個讓人想站起來的副歌。',lyrics:lyrics,hook:hook,genre:style.genre,bpm:style.bpmVal+' BPM',mood:style.mood,instruments:style.instruments,vocal:style.vocal,aiPrompt:style.genre.toLowerCase().replace(/\//g,',')+', orchestral, emotional, powerful chorus, BPM '+style.bpmVal+', '+event+' life story, hopeful ending, '+wish+' theme, '+style.key};
}

/* ---------------------------------------------------
   7c. AI 圖像 + MV 指令（根據選定歌曲版本）
--------------------------------------------------- */
function genImageAndMVPrompts(songVer,context){
  var wish=shortInput(context.wish||context.topic||'夢想',14);
  var event=shortInput(context.event||'這件事',16);
  var filmTitle=context.filmTitle||songVer.title;
  return {
    ratCover:'【小天鼠搞笑封面】\n風格：溫暖手繪插畫、米白金橘配色\n主角：可愛老鼠角色、表情疲憊但帶笑意\n文字：'+songVer.title+'\n場景：笑著坐在卡關現場，背景有「錯誤成就」勳章\n負面提示：寫實、恐怖、黑暗',
    tigerPoster:'【唬爛虎電影海報】\n風格：黑金電影感、大量留白、戲劇光影\n主角：老虎角色站在山頂、眼神堅定\n標語：「'+wish+'，先說出來再說能不能」\n副標：'+filmTitle+'\n尺寸建議：9:16 直式',
    mvStoryboard:'【MV 分鏡】\n第1鏡：空景，'+event+'的現場（特寫細節）\n第2鏡：主角靠著牆，低頭，BGM 輕柔鋼琴\n第3鏡：小天鼠出現、吐槽一句話、主角噴笑\n第4鏡：唬爛虎吹大餅、畫面轉為暖金光\n第5鏡：主角抬頭、走向鏡頭、慢動作\n第6鏡：空拍城市、字幕出現歌名',
    videoPrompt:'【影片生成 Prompt（Sora / Runway / Pika）】\nStyle: cinematic short film, warm golden tones\nScene: A person sitting alone in a cluttered room, then gradually smiling and standing up\nMood: from tired to hopeful\nLighting: soft morning light, cafe-warm\nNegative: violence, dark, horror\n1:1 or 9:16\nBPM: '+songVer.bpm
  };
}

/* ---------------------------------------------------
   8. Canvas 社群圖卡
--------------------------------------------------- */
var IMG_CACHE={};
function preloadImages(cb){
  var srcs=['rat.webp','tiger.webp'], loaded=0;
  srcs.forEach(function(src){
    var img=new Image();
    img.onload=function(){IMG_CACHE[src]=img;loaded++;if(loaded===srcs.length&&cb)cb();};
    img.onerror=function(){loaded++;if(loaded===srcs.length&&cb)cb();};
    img.src=src;
  });
}

function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight){
  var lines=[];
  text.split('\n').forEach(function(seg){
    if(!seg){lines.push('');return;}
    var chars=seg.split(''),line='';
    for(var i=0;i<chars.length;i++){
      var test=line+chars[i];
      if(ctx.measureText(test).width>maxWidth&&line.length){lines.push(line);line=chars[i];}else line=test;
    }
    lines.push(line);
  });
  var startY=y-(lines.length-1)*lineHeight/2;
  lines.forEach(function(l,i){ctx.fillText(l,x,startY+i*lineHeight);});
  return startY+(lines.length-1)*lineHeight;
}

function drawSocialCard(type,width,height,context,selectedSong){
  var canvas=document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  var ctx=canvas.getContext('2d');
  var s=width/1080;

  /* 背景 */
  var bg=ctx.createLinearGradient(0,0,width,height);
  if(type==='rat'){bg.addColorStop(0,'#FBF5E8');bg.addColorStop(1,'#F4EBD9');}
  else if(type==='tiger'){bg.addColorStop(0,'#3A2417');bg.addColorStop(1,'#1C1410');}
  else{bg.addColorStop(0,'#3A2417');bg.addColorStop(0.5,'#8C4A33');bg.addColorStop(1,'#D89A3E');}
  ctx.fillStyle=bg; ctx.fillRect(0,0,width,height);

  /* 裝飾圓 */
  ctx.globalAlpha=0.07;
  ctx.fillStyle=type==='rat'?'#D89A3E':'#F4EBD9';
  ctx.beginPath();ctx.arc(0,0,300*s,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(width,height,420*s,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;

  /* 角色圖 */
  var charSize=190*s, charY=height*0.32;
  var rat=IMG_CACHE['rat.webp'], tiger=IMG_CACHE['tiger.webp'];
  if(type==='rat'&&rat) ctx.drawImage(rat,width/2-charSize/2,charY-charSize/2,charSize,charSize);
  else if(type==='tiger'&&tiger) ctx.drawImage(tiger,width/2-charSize/2,charY-charSize/2,charSize,charSize);
  else if(type==='duo'){
    var hs=155*s;
    if(rat) ctx.drawImage(rat,width/2-hs-16*s,charY-hs/2,hs,hs);
    if(tiger) ctx.drawImage(tiger,width/2+16*s,charY-hs/2,hs,hs);
  }

  /* 主標題 */
  var titleColor=type==='rat'?'#3A2417':'#E8C76B';
  var textColor=type==='rat'?'#3A2417':'#F4EBD9';
  var subColor=type==='rat'?'rgba(58,36,23,0.65)':'rgba(244,235,217,0.7)';
  ctx.textAlign='center';

  var filmTitle=context.filmTitle||selectedSong&&selectedSong.title||'笑鼠人了！';
  filmTitle=filmTitle.replace(/[《》]/g,'');
  ctx.fillStyle=titleColor;
  ctx.font='900 '+Math.round(52*s)+'px "Noto Serif TC",serif';
  wrapCanvasText(ctx,filmTitle,width/2,charY+charSize*0.6+55*s,width*0.82,62*s);

  /* 副標 / Hook */
  var sub=selectedSong&&selectedSong.hook?selectedSong.hook:(context.lastQuote||'笑掉煩惱，吹大夢想');
  ctx.fillStyle=subColor;
  ctx.font=Math.round(28*s)+'px "Noto Sans TC",sans-serif';
  wrapCanvasText(ctx,'「'+sub+'」',width/2,height*0.74,width*0.78,40*s);

  /* 底部 bar */
  ctx.fillStyle=type==='rat'?'#D89A3E':'#E8C76B';
  ctx.fillRect(0,height-110*s,width,110*s);
  ctx.fillStyle='#3A2417';
  ctx.font='700 '+Math.round(30*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillText('笑掉煩惱，吹大夢想',width/2,height-66*s);
  ctx.font='500 '+Math.round(24*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillText('笑鼠人了！',width/2,height-32*s);

  return canvas;
}

function downloadCanvas(canvas,filename){
  canvas.toBlob(function(blob){
    if(!blob) return toast('圖卡產生失敗，請重試');
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download=filename; a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},2000);
  },'image/png');
}

function shareCanvas(canvas,text){
  canvas.toBlob(function(blob){
    if(!blob) return toast('圖卡產生失敗');
    var file=new File([blob],'laugh-mouse.png',{type:'image/png'});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      navigator.share({files:[file],text:text}).catch(function(){downloadCanvas(canvas,'laugh-mouse.png');});
    } else {
      downloadCanvas(canvas,'laugh-mouse.png');
      copyToClipboard(text);
    }
  },'image/png');
}

/* ---------------------------------------------------
   9. 畫面渲染
--------------------------------------------------- */
var els={};
function cacheEls(){
  els.home=document.getElementById('screen-home');
  els.mode=document.getElementById('screen-mode');
  els.gate=document.getElementById('screen-gate');
  els.modeGrid=document.getElementById('mode-grid');
  els.advancedBox=document.getElementById('advanced-box');
  els.back=document.getElementById('btn-back');
  els.modeIcon=document.getElementById('mode-icon');
  els.modeTitle=document.getElementById('mode-title');
  els.modeSub=document.getElementById('mode-sub');
  els.inputArea=document.getElementById('mode-input-area');
  els.generateBtn=document.getElementById('btn-generate');
  els.results=document.getElementById('mode-results');
  els.progress=document.getElementById('progress-strip');
  els.draftBanner=document.getElementById('draft-banner');
}

function showScreen(name){
  ['home','mode','gate'].forEach(function(n){
    var el=document.getElementById('screen-'+n);
    if(el) el.classList.toggle('active',n===name);
  });
  if(els.back) els.back.style.display=(name==='home')?'none':'flex';
  window.scrollTo(0,0);
}

function modeMeta(id){ return MODES.filter(function(m){return m.id===id;})[0]; }

/* 快速模式格 */
function renderModeGrid(){
  els.modeGrid.innerHTML=QUICK_MODES.map(function(id){
    var m=modeMeta(id);
    return '<button class="mode-card" data-mode="'+m.id+'"><span class="icon">'+m.icon+'</span><span class="title">'+m.title+'</span><span class="desc">'+m.desc+'</span></button>';
  }).join('');
  Array.prototype.forEach.call(els.modeGrid.querySelectorAll('.mode-card'),function(btn){
    btn.addEventListener('click',function(){logEvent('MODE_SELECT',{mode:btn.dataset.mode});openMode(btn.dataset.mode,{routeB:false});});
  });
}

/* 進階工具箱 */
function renderAdvancedTools(){
  if(!els.advancedBox) return;
  els.advancedBox.innerHTML='<button class="advanced-toggle" id="btn-advanced-toggle">🧰 進階工具箱（獨立使用）<span class="toggle-arrow">▼</span></button>'
    +'<div class="advanced-grid" id="advanced-grid" style="display:none">'
    +ADVANCED_MODES.map(function(id){var m=modeMeta(id);return '<button class="mode-card mode-card-sm" data-mode="'+m.id+'"><span class="icon">'+m.icon+'</span><span class="title">'+m.title+'</span><span class="desc">'+m.desc+'</span></button>';}).join('')
    +'</div>';
  document.getElementById('btn-advanced-toggle').addEventListener('click',function(){
    var grid=document.getElementById('advanced-grid');
    var arrow=document.querySelector('#btn-advanced-toggle .toggle-arrow');
    var open=grid.style.display==='none';
    grid.style.display=open?'grid':'none';
    if(arrow) arrow.textContent=open?'▲':'▼';
  });
  Array.prototype.forEach.call(els.advancedBox.querySelectorAll('.mode-card-sm'),function(btn){
    btn.addEventListener('click',function(){logEvent('MODE_SELECT',{mode:btn.dataset.mode});openMode(btn.dataset.mode,{routeB:false,standalone:true});});
  });
}

/* 草稿提示 */
function checkDraftBanner(){
  if(!els.draftBanner) return;
  var d=loadDraft();
  if(d&&d.context&&d.context.event){
    els.draftBanner.style.display='block';
    els.draftBanner.innerHTML='<div class="draft-inner"><span>📝 上次創作：「'+escapeHtml(shortInput(d.context.event,20))+'」</span><button class="btn-draft-resume" id="btn-draft-resume">繼續創作</button><button class="btn-draft-clear" id="btn-draft-clear">重新開始</button></div>';
    document.getElementById('btn-draft-resume').addEventListener('click',function(){
      flow.context=d.context; flow.stepIndex=d.stepIndex||0; flow.routeB=true; flow.input=d.input||'';
      openMode(ROUTE_B_ORDER[flow.stepIndex],{routeB:true});
    });
    document.getElementById('btn-draft-clear').addEventListener('click',function(){
      resetFlow(); els.draftBanner.style.display='none';
      toast('已清除草稿，可以重新開始 ✅');
    });
  } else {
    els.draftBanner.style.display='none';
  }
}

/* 進度列（含步驟名稱） */
function renderProgress(){
  if(!flow.routeB){els.progress.style.display='none';return;}
  var steps=ROUTE_B_ORDER;
  var stepLabel=STEP_NAMES[flow.stepIndex]||'';
  els.progress.style.display='block';
  els.progress.innerHTML='<div class="progress-dots">'+steps.map(function(id,i){
    var cls=i<flow.stepIndex?'done':(i===flow.stepIndex?'current':'');
    return '<span class="'+cls+'"></span>';
  }).join('')+'</div><div class="progress-label">步驟 '+(flow.stepIndex+1)+' / '+steps.length+' ▸ '+stepLabel+'</div>';
}

/* 開啟模式畫面 */
function openMode(id,opts){
  opts=opts||{};
  flow.routeB=!!opts.routeB;
  if(flow.routeB) flow.stepIndex=ROUTE_B_ORDER.indexOf(id);
  var meta=modeMeta(id);
  els.modeIcon.innerHTML=meta.icon;
  els.modeTitle.textContent=meta.title;
  var sub=meta.desc;
  if(flow.routeB&&STEP_QUESTIONS[flow.stepIndex]) sub=STEP_QUESTIONS[flow.stepIndex];
  els.modeSub.textContent=sub;
  els.results.innerHTML='';
  if(id==='roast') setActiveEngine('roast',ENGINE_REGISTRY.roast.defaultEngine);
  if(id==='bigdream') setActiveEngine('bigdream',ENGINE_REGISTRY.bigdream.defaultEngine);
  renderProgress();
  renderInputArea(id,opts);
  els.generateBtn.style.display=(id==='workshop'||id==='share')?'none':'block';
  els.generateBtn.onclick=function(){runGenerate(id);};
  showScreen('mode');
  if(id==='workshop'){logEvent('ENTER_WORKSHOP',{});renderWorkshopArea();}
  if(id==='share') renderShareArea();
}

function getStepPrefill(id){
  if(id==='lost') return flow.context.event||'';
  if(id==='bigdream') return needToWish(flow.context.need)||flow.context.wish||'';
  if(id==='strength') return flow.context.action||'';
  if(id==='director') return flow.context.ending||flow.context.wish||'';
  if(id==='workshop') return flow.context.wish||flow.context.topic||'';
  return '';
}
function renderInputArea(id,opts){
  var placeholder=flow.routeB&&STEP_QUESTIONS[flow.stepIndex]?STEP_QUESTIONS[flow.stepIndex]:'例如：客戶今天又改稿第18次…';
  var prefill=flow.routeB?getStepPrefill(id):(flow.input||'');
  var sharedInput='<div class="field-block"><label for="main-input">'+placeholder+'</label><textarea id="main-input" placeholder="'+placeholder+'">'+escapeHtml(prefill)+'</textarea></div>';
  if(id==='roast'){
    roastV2State.pendingGuidedInput=null;
    var roastNotice='<div class="roast-notice" style="font-size:0.85em;color:#888;margin-top:0.5em;line-height:1.5;">小天鼠幫你把悶氣說清楚，不幫你霸凌、威脅或公開羞辱別人。分享前請拿掉姓名與私人資料。<button id="roast-rules-btn" class="link-btn" style="font-size:inherit;color:#aaa;background:none;border:none;cursor:pointer;padding:0 0 0 0.3em;">完整守則 ▾</button><div id="roast-rules-detail" style="display:none;margin-top:0.4em;">禁止生成：① 暴力體罰意圖 ② 威脅報復 ③ 公開電話地址等個資 ④ 號召霸凌羞辱 ⑤ 仇恨歧視內容。高風險輸入不生成、不扣額度，只記匿名分類。</div></div>';
    var guidedWrap='<div id="v2-guided-wrap" style="margin:0.4em 0 0.1em;"><button type="button" id="btn-v2-guided" class="link-btn" style="font-size:0.88em;color:#999;">幫我開個頭 ▾</button><div style="font-size:0.8em;color:#bbb;margin-top:0.15em;line-height:1.4;">懶得分類也沒關係，直接打一行，小天鼠會自己找靶心。</div><div id="v2-guided-panel" style="display:none;margin-top:0.4em;padding:0.6em 0.7em;background:#f8f8f8;border-radius:8px;"></div></div>';
    els.inputArea.innerHTML=situationChipsHtml('roast')+sharedInput+chipBlock('target-chip','對象',['老闆/主管','客戶','同事','孩子','爸媽/長輩','兄弟姊妹','另一半','朋友','其他'])+guidedWrap+roastNotice;
    bindSituationChips(ROAST_CHIPS);
    var rulesBtn=els.inputArea.querySelector('#roast-rules-btn');
    if(rulesBtn) rulesBtn.addEventListener('click',function(){toggleRoastRules(rulesBtn);});
    /* 幫我開個頭 toggle */
    var gBtn=document.getElementById('btn-v2-guided');
    var gPanel=document.getElementById('v2-guided-panel');
    if(gBtn&&gPanel){
      gBtn.addEventListener('click',function(){
        var open=gPanel.style.display!=='none';
        if(open){gPanel.style.display='none';gBtn.textContent='幫我開個頭 ▾';return;}
        gPanel.style.display='block';gBtn.textContent='幫我開個頭 ▴';
        buildAndBindGuidedPanel(gPanel);
      });
    }
    /* 切換對象 chip 時同步重建 guided panel */
    Array.prototype.forEach.call(
      els.inputArea.querySelectorAll('[data-chip-group="target-chip"] .chip'),
      function(chip){
        chip.addEventListener('click',function(){
          roastV2State.pendingGuidedInput=null;
          var gp=document.getElementById('v2-guided-panel');
          if(gp&&gp.style.display!=='none') setTimeout(function(){buildAndBindGuidedPanel(gp);},10);
        });
      }
    );
  } else if(id==='bigdream'){
    els.inputArea.innerHTML=situationChipsHtml('bigdream')+sharedInput+chipBlock('topic-chip','主題',['財富','健康','事業','旅行','品牌','影響力']);
    bindSituationChips(BIGDREAM_CHIPS);
  } else if(id==='lost'){
    els.inputArea.innerHTML=sharedInput+chipBlock('emotion-chip','最接近的感覺',Object.keys(LOST_MAP));
  } else if(id==='strength'&&opts&&opts.standalone&&!flow.context.event){
    els.inputArea.innerHTML='<div class="field-block"><label for="main-input">說說你最近做了什麼或擅長什麼事？</label><textarea id="main-input" placeholder="例如：我喜歡旅行、教別人做料理、整理流程…"></textarea></div>';
  } else if(id==='director'&&opts&&opts.standalone&&!flow.context.event){
    els.inputArea.innerHTML='<div class="field-block"><label for="main-input">發生了什麼事？主角（你）想要什麼？</label><textarea id="main-input" placeholder="例如：一直想開始做某件事，但一直在等準備好的那天…"></textarea></div>';
  } else {
    els.inputArea.innerHTML=sharedInput;
  }
  bindChips();
}
function chipBlock(name,label,options){
  return '<div class="field-block"><label>'+label+'</label><div class="chip-row" data-chip-group="'+name+'">'+options.map(function(o){return '<button type="button" class="chip" data-value="'+o+'">'+o+'</button>';}).join('')+'</div></div>';
}
function bindChips(){
  Array.prototype.forEach.call(els.inputArea.querySelectorAll('.chip-row'),function(group){
    Array.prototype.forEach.call(group.querySelectorAll('.chip'),function(chip){
      chip.addEventListener('click',function(){
        Array.prototype.forEach.call(group.querySelectorAll('.chip'),function(c){c.classList.remove('selected');});
        chip.classList.add('selected');
      });
    });
  });
}
function getChipValue(name){
  var group=els.inputArea.querySelector('[data-chip-group="'+name+'"]');
  if(!group) return null;
  var sel=group.querySelector('.chip.selected');
  return sel?sel.dataset.value:null;
}
function situationChipsHtml(mode){
  var isRoast=mode==='roast';
  var title=isRoast?'🐭 今天誰惹你？':'🐯 今天想吹哪個夢？';
  var pool=isRoast?ROAST_CHIPS:BIGDREAM_CHIPS;
  var html=pool.map(function(c){
    return '<button type="button" class="chip sit-chip" data-sittext="'+escapeAttr(c.text)+'">'+c.label+'</button>';
  }).join('');
  html+='<button type="button" class="chip sit-chip sit-chip-rnd" data-sitrnd="1">'+(isRoast?'🎲 小天鼠幫我選':'🎲 唬爛虎幫我吹')+'</button>';
  return '<div class="sit-chips-wrap">'
    +'<div class="sit-chips-title">'+title+'</div>'
    +'<div class="chip-row">'+html+'</div>'
    +'</div>';
}
function _setSitSecondaryVisible(visible){
  var names=['target-chip','topic-chip'];
  names.forEach(function(n){
    var g=document.querySelector('[data-chip-group="'+n+'"]');
    if(g){var b=g.closest('.field-block');if(b)b.style.display=visible?'':'none';}
  });
  var gw=document.getElementById('v2-guided-wrap');
  if(gw) gw.style.display=visible?'':'none';
}
function bindSituationChips(pool){
  Array.prototype.forEach.call(document.querySelectorAll('.sit-chip'),function(btn){
    btn.addEventListener('click',function(){
      var wasSelected=btn.classList.contains('selected');
      Array.prototype.forEach.call(document.querySelectorAll('.sit-chip'),function(b){b.classList.remove('selected');});
      var ta=document.getElementById('main-input');
      if(wasSelected){
        if(ta){ta.value='';ta.focus();}
        _setSitSecondaryVisible(true);
        return;
      }
      btn.classList.add('selected');
      var text=btn.dataset.sitrnd
        ?pool[Math.floor(Math.random()*pool.length)].text
        :btn.dataset.sittext;
      if(!ta) return;
      ta.value=text;
      ta.focus();
      var len=ta.value.length;
      ta.setSelectionRange(len,len);
      _setSitSecondaryVisible(false);
    });
  });
}

/* 主生成邏輯 */
function runGenerate(id){
  var inputEl=document.getElementById('main-input');
  var input=inputEl?inputEl.value.trim():'';
  flow.input=input;

  if(!input&&id!=='share'&&id!=='workshop'){
    if(inputEl){inputEl.classList.add('input-error');inputEl.focus();inputEl.addEventListener('input',function onT(){inputEl.classList.remove('input-error');inputEl.removeEventListener('input',onT);});}
    toast('先打幾個字告訴小天鼠發生什麼事 🐭'); return;
  }

  /* 安全防護優先：危機/暴力不扣額度 */
  var safety=checkSafety(input);
  if(safety.level==='crisis'){els.results.innerHTML=renderCrisisCard();logEvent('GENERATE',{mode:id,safety:'crisis'});return;}
  if(safety.level==='violence'){els.results.innerHTML=renderViolenceRedirectCard();logEvent('GENERATE',{mode:id,safety:'violence'});return;}

  /* 嗆聲模式防濫用：攻擊意圖攔截，不扣額度，只記匿名分類 */
  if(id==='roast'){
    var roastSafety=checkRoastSafety(input);
    if(roastSafety.level==='roast_abuse'){
      els.results.innerHTML=renderRoastAbuseCard();
      logEvent('GENERATE',{mode:'roast',safety:'roast_abuse',category:roastSafety.cat});
      return;
    }
  }

  /* Route B 步驟不扣 quick（旅程費已在起點扣除） */
  var qType=quotaTypeForMode(id);
  if(flow.routeB){
    if(safety.level==='mild'){els.results.innerHTML=renderMildAngerCard(id)+renderOutputFor(id,input);bindResultActions(id);return;}
    els.results.innerHTML=renderOutputFor(id,input);
    bindResultActions(id);
    logGenerateEvent(id,input);
    saveDraft();
    return;
  }

  /* 非 Route B：需向伺服器確認額度 */
  if(id==='roast'||id==='bigdream') startCharacterLoading(id);
  tryConsumeQuota(qType).then(function(qResult){
    if(!qResult.ok){showQuotaExhausted(qType,qResult.reason);return;}
    if(qResult.remaining===0) toast('已使用今日最後一次'+(qType==='workshop'?'工坊':'快速')+'額度 🎨');
    if(safety.level==='mild'){els.results.innerHTML=renderMildAngerCard(id)+renderOutputFor(id,input);bindResultActions(id);return;}
    els.results.innerHTML=renderOutputFor(id,input);
    bindResultActions(id);
    logGenerateEvent(id,input);
    saveDraft();
  });
}

function startCharacterLoading(id){
  if(_loadingTimer){clearTimeout(_loadingTimer);_loadingTimer=null;}
  var isRoast=id==='roast';
  var icon=isRoast?'🐭':'🐯';
  var scripts=isRoast?RAT_LOADING_SCRIPTS:TIGER_LOADING_SCRIPTS;
  var seq=scripts[Math.floor(Math.random()*scripts.length)];
  els.results.innerHTML='<div class="result-card" style="text-align:center;padding:2em 1em;">'
    +'<div style="font-size:2.2em;margin-bottom:0.6em">'+icon+'</div>'
    +'<div id="char-loading-line" style="font-weight:700;font-size:1.05em;line-height:1.9;min-height:3em;white-space:pre-line;">'+seq[0]+'</div>'
    +'</div>';
  var step=1;
  function next(){
    if(step>=seq.length) return;
    _loadingTimer=setTimeout(function(){
      var el=document.getElementById('char-loading-line');
      if(!el) return;
      el.textContent+='\n'+seq[step];
      step++;
      next();
    },640);
  }
  next();
}
function renderOutputFor(id,input){
  var data, html='';
  var _usedRoastV2=false;
  if(id==='roast'){
    var _tLabel=getChipValue('target-chip')||'其他';
    var v2r=runRoastV2(input,_tLabel,roastV2State.pendingGuidedInput);
    var _v1d=genRoast(input,_tLabel);
    if(v2r){
      var _mv=v2r.roast.mouseOutput;
      flow.context.event=input;
      flow.context.targetCategory=v2r.classification.targetRole||_tLabel;
      flow.context.situationCategory=v2r.evidence.layerKey||'general';
      flow.context.matchType=v2r.evidence.layer||'general';
      flow.context.comicWorld=_mv.comicWorld||null;
      flow.context.truth=_mv.truth||'';
      flow.context.analogy=_mv.analogy||'';
      flow.context.honest=_mv.honest||'';
      flow.context.boundary=_mv.boundary||'';
      flow.context.comicExit=_mv.comicExit||'';
      flow.context.callback=_mv.callback||'';
      flow.context.nextAction='';flow.context.resolutionWish='';
      flow.context.v1={truth:_v1d.truth||'',analogy:_v1d.analogy||'',honest:_v1d.honest||'',boundary:_v1d.boundary||'',comicExit:_v1d.comicExit||'',nextAction:_v1d.nextAction||''};
      roastResult.engines.spicy=v2r;
      roastResult.engines.original=_v1d;
      html=renderRoastResult(input,_tLabel);
      _usedRoastV2=true;
    } else {
      html='<div class="result-card" style="text-align:center;padding:2em 1em;">'
        +'<div style="font-size:1.5em;margin-bottom:0.5em">🐭</div>'
        +'<div style="font-weight:700;margin-bottom:0.5em">嗆聲引擎啟動中</div>'
        +'<div style="color:#888;font-size:0.9em">請重新整理頁面（Ctrl+Shift+R）後再試一次</div>'
        +'</div>';
    }
  } else if(id==='selfmock'){
    data=genSelfmock(input);
    flow.context.event=flow.context.event||input;
    html=renderTextBlocks(data);
  } else if(id==='bigdream'){
    /* 使用者在輸入框確認或修改的願望草稿 */
    var wish=input||needToWish(flow.context.need)||flow.context.wish||flow.context.topic||'';
    flow.context.topic=getChipValue('topic-chip')||shortInput(wish,14);
    flow.context.wish=wish;
    bigDreamResult.engines.small=generateBigDreamSmall(wish,flow.context.topic);
    bigDreamResult.engines.crazy=generateBigDreamCrazy(wish,flow.context.topic);
    data=bigDreamResult.engines.small;
    html=renderBigDreamResult();
  } else if(id==='lost'){
    var emo=getChipValue('emotion-chip')||detectEmotion(input);
    data=genLost(input,emo);
    flow.context.emotion=emo;
    flow.context.need=data.need?data.need.join('、'):'';
    flow.context.translation=data.translation||'';
    flow.context.event=flow.context.event||input;
    html=renderTextBlocks(data);
  } else if(id==='strength'){
    flow.context.action=input;
    var sInput=[flow.context.event,flow.context.wish,input].filter(Boolean).join(' ');
    data=genStrength(sInput);
    flow.context.traits=data.traits||[];
    html=renderTextBlocks(data);
  } else if(id==='director'){
    data=genDirector(input,flow.context);
    flow.context.filmTitle=data.title;
    flow.context.story=data;
    flow.context.topic=flow.context.topic||shortInput(input,16);
    html=renderCinemaTicket(data);
  }
  if(data&&data.quote) flow.context.lastQuote=data.quote;

  var isQuick=QUICK_MODES.indexOf(id)!==-1&&!flow.routeB;
  var actionHtml;
  if(_usedRoastV2){
    actionHtml=roastDualActionRowHtml()+(flow.routeB?routeBNextHtml(id):'');
  } else if(id==='bigdream'){
    actionHtml=bigDreamActionRowHtml()+(flow.routeB?routeBNextHtml(id):'');
  } else {
    actionHtml=actionRowHtml()+(isQuick?'<button class="btn-primary btn-make-work" id="btn-make-work" style="margin-top:10px;">🎬 把這件事變成作品</button>':'')+(flow.routeB?routeBNextHtml(id):'');
  }
  return html+actionHtml;
}

function bindResultActions(id){
  if(id==='roast') bindRoastClarifyEvents();
  /* 複製（roast/bigdream 依 activeEngine；其他模式抓 .result-card 文字） */
  var copyBtn=document.getElementById('btn-copy-result');
  if(copyBtn){
    copyBtn.addEventListener('click',function(){
      if(id==='roast'&&roastResult.engines.original){
        var activeRoastKey=roastResult.activeEngine;
        var lines=[];
        if(activeRoastKey==='spicy'&&roastResult.engines.spicy){
          var m=roastResult.engines.spicy.roast.mouseOutput;
          [m.truth,m.analogy,m.honest,m.boundary,m.selfOwn,m.comicExit].forEach(function(v){if(v) lines.push(v);});
        } else {
          var v1=roastResult.engines.original;
          [v1.truth,v1.analogy,v1.honest,v1.boundary,v1.comicExit].forEach(function(v){if(v) lines.push(v);});
        }
        copyToClipboard(lines.join('\n'),'收好了，這句可以拿去笑。 🐭');
        logEvent('COPY',{mode:'roast',engine:activeRoastKey});
        return;
      }
      if(id==='bigdream'){
        var activeBdKey=bigDreamResult.activeEngine;
        var bd=bigDreamResult.engines[activeBdKey];
        var lines2=[];
        if(bd){[bd.wish,bd.pie,bd.brag,bd.parallel,bd.step].forEach(function(v){if(v) lines2.push(v);});}
        copyToClipboard(lines2.join('\n'),'收好了，這個夢先放口袋。 🐯');
        logEvent('COPY',{mode:'bigdream',engine:activeBdKey});
        return;
      }
      var texts=[];
      Array.prototype.forEach.call(els.results.querySelectorAll('.result-card'),function(card){
        var who=card.querySelector('.who'); var body=card.querySelector('.body-text'); var q=card.querySelector('.quote');
        if(who) texts.push(who.innerText);
        if(body) texts.push(body.innerText);
        if(q) texts.push(q.innerText);
        texts.push('');
      });
      copyToClipboard(texts.join('\n').trim());
      logEvent('COPY',{mode:id});
    });
  }
  /* 再來一版 */
  var regenBtn=document.getElementById('btn-regen-result');
  if(regenBtn){ regenBtn.addEventListener('click',function(){
    if(flow.routeB){logEvent('REGENERATE',{mode:id});els.results.innerHTML=renderOutputFor(id,flow.input);bindResultActions(id);saveDraft();return;}
    var qType2=quotaTypeForMode(id);
    tryConsumeQuota(qType2).then(function(qResult){
      if(!qResult.ok){showQuotaExhausted(qType2,qResult.reason);return;}
      logEvent('REGENERATE',{mode:id});els.results.innerHTML=renderOutputFor(id,flow.input);bindResultActions(id);saveDraft();
    });
  }); }
  /* 嗆聲：圖卡（依目前 activeEngine） */
  var roastCardBtn=document.getElementById('btn-roast-card');
  if(roastCardBtn){ roastCardBtn.addEventListener('click',function(){
    var eng=roastResult.activeEngine;
    var t,a,h;
    if(eng==='spicy'&&roastResult.engines.spicy){
      var m=roastResult.engines.spicy.roast.mouseOutput;
      t=m.truth||'';a=m.analogy||'';h=m.honest||'';
    } else {
      var v1=roastResult.engines.original||{};
      t=v1.truth||'';a=v1.analogy||'';h=v1.honest||'';
    }
    var card=drawRoastCard(t,a,h,eng);
    _showRoastCardInline('roast-card-active',card,t+(a?'\n'+a:''));
    logEvent('SHARE_CARD',{mode:'roast',engine:eng});
  }); }
  /* 畫大餅：圖卡 */
  var bigdreamCardBtn=document.getElementById('btn-bigdream-card');
  if(bigdreamCardBtn){ bigdreamCardBtn.addEventListener('click',function(){
    var eng=bigDreamResult.activeEngine;
    var bd=bigDreamResult.engines[eng]||{};
    var mainLine=eng==='crazy'?(bd.brag||''):(bd.wish||'');
    var secondLine=eng==='crazy'?(bd.parallel||'').split('\n')[0]:(bd.pie||'');
    var card=drawBigDreamCard(mainLine,secondLine,eng);
    _showRoastCardInline('bigdream-card-active',card,mainLine+(secondLine?'\n'+secondLine:''));
    logEvent('SHARE_CARD',{mode:'bigdream',engine:eng});
  }); }
  /* 嗆聲：分享（依目前 activeEngine） */
  var roastShareBtn=document.getElementById('btn-roast-share');
  if(roastShareBtn&&navigator.share){ roastShareBtn.addEventListener('click',function(){
    var eng=roastResult.activeEngine;
    var mainLine,subLine;
    if(eng==='spicy'&&roastResult.engines.spicy){var m=roastResult.engines.spicy.roast.mouseOutput;mainLine=m.truth||'';subLine=m.honest||'';}
    else{var v1=roastResult.engines.original||{};mainLine=v1.truth||'';subLine=v1.honest||'';}
    var txt='🐭 小天鼠開嗆\n'+(mainLine?mainLine+'\n':'')+(subLine?subLine+'\n':'')+'\n人生的荒謬哈哈 #笑鼠人了';
    navigator.share({text:txt}).catch(function(){copyToClipboard(txt);});
  }); }
  /* 嗆聲：切換 engine 按鈕 */
  function bindRoastEngineToggle(){
    var btn=document.getElementById('btn-engine-toggle-roast');
    if(!btn) return;
    btn.addEventListener('click',function(){
      var nextEngine=roastResult.activeEngine==='original'?'spicy':'original';
      setActiveEngine('roast',nextEngine);
      var block=document.getElementById('roast-engine-block');
      if(!block) return;
      if(nextEngine==='spicy'){
        btn.textContent='🐭 小天鼠：你今天火氣很大喔？好，那我不客氣了 🌶🌶🌶';
        btn.style.pointerEvents='none';
        setTimeout(function(){
          var tmp=document.createElement('div');
          tmp.innerHTML=renderRoastResult(flow.input,getChipValue('target-chip')||'其他');
          block.parentNode.replaceChild(tmp.firstChild,block);
          bindRoastEngineToggle();
        },900);
      } else {
        var tmp=document.createElement('div');
        tmp.innerHTML=renderRoastResult(flow.input,getChipValue('target-chip')||'其他');
        block.parentNode.replaceChild(tmp.firstChild,block);
        bindRoastEngineToggle();
      }
      logEvent('ENGINE_SWITCH',{mode:'roast',engine:roastResult.activeEngine});
    });
  }
  bindRoastEngineToggle();
  /* 畫大餅：切換 engine 按鈕 */
  function bindBigDreamEngineToggle(){
    var btn=document.getElementById('btn-engine-toggle-bigdream');
    if(!btn) return;
    btn.addEventListener('click',function(){
      var nextEngine=bigDreamResult.activeEngine==='small'?'crazy':'small';
      setActiveEngine('bigdream',nextEngine);
      var block=document.getElementById('bigdream-engine-block');
      if(!block) return;
      if(nextEngine==='crazy'){
        btn.textContent='🐯 吹牛不用繳稅金！唬爛虎幫你吹到宇宙去 🚀';
        btn.style.pointerEvents='none';
        setTimeout(function(){
          if(!block.parentNode) return;
          var tmp=document.createElement('div');
          tmp.innerHTML=renderBigDreamResult();
          block.parentNode.replaceChild(tmp.firstChild,block);
          bindBigDreamEngineToggle();
        },900);
      } else {
        var tmp=document.createElement('div');
        tmp.innerHTML=renderBigDreamResult();
        block.parentNode.replaceChild(tmp.firstChild,block);
        bindBigDreamEngineToggle();
      }
      logEvent('ENGINE_SWITCH',{mode:'bigdream',engine:bigDreamResult.activeEngine});
    });
  }
  bindBigDreamEngineToggle();
  /* 嗆聲 / 畫大餅：唱成歌 → 以產出文案為副歌條件，生成 AI 協作指令 */
  var makeSongBtn=document.getElementById('btn-make-song');
  if(makeSongBtn){ makeSongBtn.addEventListener('click',function(){
    var isRoast=(id==='roast');
    var chorus,styleLabel,sunoStyle;
    if(isRoast){
      var re=roastResult.activeEngine;var rd=roastResult.engines[re]||{};
      chorus=(re==='spicy'&&rd.roast)?rd.roast.mouseOutput.truth||'':rd.truth||'';
      styleLabel=re==='spicy'?'台語搖滾·嗆聲版':'民謠流行·原味版';
      sunoStyle=re==='spicy'
        ?'Taiwanese indie rock, electric guitar, sardonic wit, 95bpm'
        :'Taiwanese folk pop, acoustic guitar, warm but frustrated, 85bpm';
    } else {
      var be=bigDreamResult.activeEngine;var bd2=bigDreamResult.engines[be]||{};
      chorus=be==='crazy'?(bd2.brag||''):(bd2.wish||'');
      styleLabel=be==='crazy'?'史詩搖滾·狂吹版':'溫暖民謠·小吹版';
      sunoStyle=be==='crazy'
        ?'Epic anthemic rock, orchestral build, inspirational, cinematic, 105bpm'
        :'Warm indie folk, acoustic piano, hopeful and grounded, 90bpm';
    }
    /* AI 協作寫詞指令：貼給 Claude / ChatGPT */
    var aiCollab='我有一句話想變成歌曲副歌，請幫我以這句話為核心，協作完成一首完整歌詞。\n\n'
      +'【副歌（請保留原文，不要改動）】\n'+chorus+'\n\n'
      +'【風格】'+styleLabel+'\n\n'
      +'請幫我補：\n'
      +'- Verse 1（鋪陳情境，2-4行）\n'
      +'- Pre-Chorus（情緒升溫，1-2行）\n'
      +'- Verse 2（深一層，2-4行）\n'
      +'- Bridge（轉折或看開，2-3行）\n'
      +'副歌不用改，整首完成後輸出完整歌詞格式。';
    /* Suno 指令：詞完成後貼這裡 */
    var sunoGuide='完成歌詞後，請幫我生成 Suno.ai 可用的完整指令格式：\n\n'
      +'1. 在開頭加上風格標籤：['+sunoStyle+']\n'
      +'2. 歌詞用 [Verse]、[Pre-Chorus]、[Chorus]、[Bridge] 標記段落\n'
      +'3. 輸出可以直接貼進 Suno「Custom Mode」歌詞欄的格式\n\n'
      +'完成後也請告訴我：\n'
      +'- Suno.ai 怎麼進入（免費帳號）\n'
      +'- 歌詞欄和風格欄分別在哪裡貼\n'
      +'- 有什麼小技巧讓生成結果更好';
    var anchorId=isRoast?'roast-song-active':'bigdream-song-active';
    var taId=anchorId+'-ta';var outId=anchorId+'-out';
    var old=document.getElementById(anchorId);if(old)old.remove();
    var tc=isRoast?'#3d1a00':'#1a3a5c';
    var bg=isRoast?'#fff9f0':'#f0f9ff';
    function copyBtn(label,txt){
      return '<button class="btn-copy" style="font-size:0.78em;padding:5px 14px;margin:4px 4px 0 0;" onclick="copyToClipboard('+JSON.stringify(txt)+');showToast(\'已複製！\')">'+label+'</button>';
    }
    /* 存到 window 供 inline onclick 呼叫 */
    window._buildSunoOutput=function(){
      var ta=document.getElementById(taId);
      if(!ta||!ta.value.trim()){showToast('請先貼上 AI 寫好的歌詞');return;}
      var lyrics=ta.value.trim();
      var formatted='['+sunoStyle+']\n\n'+lyrics;
      var steps='📌 怎麼在 Suno.ai 做成歌曲\n\n'
        +'步驟1：開新分頁，前往 suno.ai\n'
        +'步驟2：用 Google 帳號登入（完全免費）\n'
        +'步驟3：點右上角「Create」按鈕\n'
        +'步驟4：找到「Custom Mode」開關，打開它\n'
        +'步驟5：在「Lyrics」欄貼上你的歌詞\n'
        +'步驟6：在「Style of Music」欄貼上風格描述\n'
        +'步驟7：點「Create」，等 30 秒就出來了！\n\n'
        +'💡 小技巧：\n'
        +'・歌詞超過 3000 字元 Suno 會截斷，請控制長度\n'
        +'・風格欄用英文效果更好\n'
        +'・可以生成兩次選你喜歡的版本';
      var outEl=document.getElementById(outId);if(!outEl)return;
      outEl.innerHTML='<div style="font-size:0.82em;font-weight:700;color:'+tc+';margin:14px 0 4px;">🎛 Suno 格式（複製貼到「Lyrics + Style」欄）</div>'
        +'<div style="background:#f8f8f8;border:1px solid #ddd;border-radius:7px;padding:10px 12px;font-family:monospace;font-size:0.78em;line-height:1.7;white-space:pre-wrap;max-height:200px;overflow-y:auto;">'+escapeHtml(formatted)+'</div>'
        +'<div>'+copyBtn('🎛 複製 Suno 格式',formatted)+'</div>'
        +'<div style="font-size:0.82em;font-weight:700;color:'+tc+';margin:14px 0 4px;">📌 去 Suno 做成歌曲</div>'
        +'<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:7px;padding:12px 14px;font-size:0.82em;line-height:2;white-space:pre-line;color:#92400e;">'+escapeHtml(steps)+'</div>'
        +'<div>'+copyBtn('📌 複製操作步驟',steps)+'</div>';
    };
    var html='<div class="result-card" style="margin-top:12px;">'
      +'<div class="who">🎵 你的歌 AI 協作指令</div>'
      +'<div class="body-text">'
      +'<div style="font-size:0.8em;color:'+tc+';margin-bottom:6px;">這句話將成為你的副歌 ↓</div>'
      +'<div style="background:'+bg+';border-left:4px solid '+tc+';border-radius:6px;padding:12px 14px;font-size:0.95em;font-weight:700;color:'+tc+';line-height:1.8;white-space:pre-line;">'+escapeHtml(chorus)+'</div>'
      +'<div style="font-size:0.82em;font-weight:700;color:'+tc+';margin:14px 0 4px;">① 複製指令 → <span style="color:#d97706;">開新分頁</span>找 AI 夥伴補完整歌詞</div>'
      +'<div style="background:#f8f8f8;border:1px solid #ddd;border-radius:7px;padding:10px 12px;font-size:0.82em;line-height:1.7;white-space:pre-wrap;max-height:150px;overflow-y:auto;color:#333;">'+escapeHtml(aiCollab)+'</div>'
      +'<div>'+copyBtn('📋 複製 AI 寫詞指令',aiCollab)+'</div>'
      +'<div style="font-size:0.75em;color:#d97706;background:#fffbeb;border-radius:6px;padding:8px 10px;margin:8px 0;">⚠️ 請開<b>新分頁</b>去找 AI，不要關掉這個頁面，寫好的歌詞等一下要貼回這裡</div>'
      +'<div style="font-size:0.82em;font-weight:700;color:'+tc+';margin:14px 0 4px;">② AI 寫好後，把歌詞貼在這裡 ↓</div>'
      +'<textarea id="'+taId+'" rows="7" style="width:100%;border:1.5px solid #e0d0c0;border-radius:8px;padding:10px 12px;font-size:0.88em;line-height:1.8;resize:vertical;font-family:inherit;" placeholder="把 AI 生成的完整歌詞貼在這裡…"></textarea>'
      +'<button class="btn-primary" style="width:100%;margin-top:8px;padding:12px;" onclick="window._buildSunoOutput()">幫我轉成 Suno 格式 + 教我做 🎛</button>'
      +'<div id="'+outId+'"></div>'
      +'<div style="font-size:0.75em;color:#aaa;margin-top:14px;line-height:1.8;">推薦免費音樂 AI：Suno.ai ／ Udio.com ／ Mureka.ai（中文歌詞效果好）</div>'
      +'</div></div>';
    var wrap=document.createElement('div');wrap.id=anchorId;wrap.innerHTML=html;
    var el=document.getElementById('mode-results');if(el)el.appendChild(wrap);
    logEvent('SONG_GEN',{mode:id});
  }); }
  /* 嗆聲 / 畫大餅：拍成電影 → 直接出 AI 繪圖指令 */
  var makeFilmBtn=document.getElementById('btn-make-film');
  if(makeFilmBtn){ makeFilmBtn.addEventListener('click',function(){
    var isRoast=(id==='roast');
    var scene1,scene2,scene3,imgPrompt1,imgPrompt2,imgPrompt3;
    if(isRoast){
      var re2=roastResult.activeEngine;
      var rd2=roastResult.engines[re2]||{};
      var t2=(re2==='spicy'&&rd2.roast)?rd2.roast.mouseOutput.truth||'':rd2.truth||'';
      var h2=(re2==='spicy'&&rd2.roast)?rd2.roast.mouseOutput.honest||'':rd2.honest||'';
      scene1='場景1：困住你的那個當下';scene2='場景2：說出那句話的瞬間';scene3='場景3：走出去之後';
      imgPrompt1='Cinematic still, person staring at screen in dim office, frustrated, dramatic side lighting, film noir, 16:9';
      imgPrompt2='Close-up portrait, person with slight confident smirk, warm golden backlight, decisive moment, shallow DOF';
      imgPrompt3='Wide shot, person walking out into evening light, sunset glow, slow motion feel, hopeful mood, cinematic';
    } else {
      var be2=bigDreamResult.activeEngine;
      var bd3=bigDreamResult.engines[be2]||{};
      var m2=be2==='crazy'?(bd3.brag||''):(bd3.wish||'');
      scene1='場景1：你現在在哪裡';scene2='場景2：夢想成真的那一刻';scene3='場景3：帶著這個夢繼續走';
      imgPrompt1='Cinematic portrait, person looking at horizon at golden hour, contemplative, warm tones, 16:9';
      imgPrompt2='Epic wide shot, person standing on rooftop or hilltop, arms open, triumphant, sunrise, lens flare';
      imgPrompt3='Steadicam walk shot, person moving forward with purpose, city lights bokeh background, cinematic';
    }
    var tools='・<b>Bing Image Creator</b>（微軟免費）— 用 Edge 瀏覽器開，免費無限制<br>'
      +'・<b>Adobe Firefly</b>（免費版）— 每月有額度，畫質乾淨<br>'
      +'・<b>Leonardo.ai</b> — 每天贈送免費點數，功能最多<br>'
      +'・<b>Canva AI</b> — 直接在設計稿裡生成，排版方便';
    var anchorId2=isRoast?'roast-film-active':'bigdream-film-active';
    var old2=document.getElementById(anchorId2);if(old2)old2.remove();
    function sceneBlock(label,prompt){
      return '<div style="margin-bottom:14px;">'
        +'<div style="font-size:0.82em;font-weight:700;color:#3d1a00;margin-bottom:4px;">'+label+'</div>'
        +'<div style="background:#f8f8f8;border:1px solid #e0d0c0;border-radius:7px;padding:9px 12px;font-family:monospace;font-size:0.8em;line-height:1.6;white-space:pre-wrap;">'+escapeHtml(prompt)+'</div>'
        +'<button class="btn-copy" style="margin-top:5px;font-size:0.78em;padding:5px 10px;" onclick="copyToClipboard('+JSON.stringify(prompt)+');showToast(\'已複製！\')">複製此場景指令</button>'
        +'</div>';
    }
    var html2='<div class="result-card" style="margin-top:12px;">'
      +'<div class="who">🎬 '+(isRoast?'你的嗆聲微電影':'你的大夢微電影')+'</div>'
      +'<div class="body-text">'
      +sceneBlock(scene1,imgPrompt1)
      +sceneBlock(scene2,imgPrompt2)
      +sceneBlock(scene3,imgPrompt3)
      +'<div style="font-size:0.8em;color:#888;line-height:1.9;margin-top:8px;">'
      +'<b>🎁 推薦免費 AI 繪圖工具：</b><br>'+tools
      +'</div>'
      +'</div></div>';
    var wrap2=document.createElement('div');wrap2.id=anchorId2;wrap2.innerHTML=html2;
    var el2=document.getElementById('mode-results');if(el2)el2.appendChild(wrap2);
    logEvent('FILM_GEN',{mode:id});
  }); }
  /* 畫大餅：分享 */
  var bigdreamShareBtn=document.getElementById('btn-bigdream-share');
  if(bigdreamShareBtn&&navigator.share){ bigdreamShareBtn.addEventListener('click',function(){
    var d=bigDreamResult.engines[bigDreamResult.activeEngine];
    var mainLine=(d&&(d.brag||d.wish))||'';
    var txt='🐯 唬爛虎開吹\n'+mainLine+'\n\n吹牛不用繳稅金 #笑鼠人了';
    navigator.share({text:txt}).catch(function(){copyToClipboard(txt);});
  }); }
  /* 舊版相容：把這句變成作品 */
  var makeWorkRoastBtn=document.getElementById('btn-make-work-roast');
  if(makeWorkRoastBtn){ makeWorkRoastBtn.addEventListener('click',function(){
    tryConsumeQuota('journey').then(function(jq){
      if(!jq.ok){showQuotaExhausted('journey',jq.reason);return;}
      logEvent('MODE_SELECT',{mode:'workshop_from_roast'});
      flow.routeB=true; flow.stepIndex=0; openMode(ROUTE_B_ORDER[0],{routeB:true});
    });
  }); }
  /* 下一步 */
  var nextBtn=document.getElementById('btn-route-next');
  if(nextBtn){ nextBtn.addEventListener('click',function(){flow.stepIndex=ROUTE_B_ORDER.indexOf(id)+1; openMode(ROUTE_B_ORDER[flow.stepIndex],{routeB:true}); saveDraft();}); }
  /* 完成 */
  var finishBtn=document.getElementById('btn-route-finish');
  if(finishBtn){ finishBtn.addEventListener('click',function(){ toast('創作之旅完成！記得分享出去讓朋友笑一下 🎉'); showScreen('home'); checkDraftBanner(); }); }
  /* 把這件事變成作品（舊版 V1 fallback 路徑） */
  var makeWorkBtn=document.getElementById('btn-make-work');
  if(makeWorkBtn){ makeWorkBtn.addEventListener('click',function(){
    tryConsumeQuota('journey').then(function(jq){
      if(!jq.ok){showQuotaExhausted('journey',jq.reason);return;}
      logEvent('MODE_SELECT',{mode:'route_b_from_result'});
      flow.routeB=true; flow.stepIndex=0; openMode(ROUTE_B_ORDER[0],{routeB:true});
    });
  }); }
}

function renderTextBlocks(data){
  var tagClass=data.tagClass||'';
  var html=data.blocks.map(function(b){return '<div class="result-card '+tagClass+'"><div class="who">'+b[0]+'</div><div class="body-text">'+escapeHtml(b[1])+'</div></div>';}).join('');
  if(data.quote) html+='<div class="result-card '+tagClass+'"><div class="who">✨ 笑鼠金句</div><div class="quote">「'+escapeHtml(data.quote)+'」</div></div>';
  return html;
}
function renderCinemaTicket(d){
  return '<div class="cinema-wrap"><div class="cinema-ticket"><div class="film-genre">'+escapeHtml(d.genre)+'</div><div class="film-title">'+escapeHtml(d.title)+'</div><div class="act"><div class="label">最大反派</div><div class="content">'+escapeHtml(d.antagonist)+'</div></div><div class="act"><div class="label">第一幕</div><div class="content">'+escapeHtml(d.act1)+'</div></div><div class="act"><div class="label">第二幕</div><div class="content">'+escapeHtml(d.act2)+'</div></div><div class="act"><div class="label">第三幕</div><div class="content">'+escapeHtml(d.act3)+'</div></div><div class="ending">「'+escapeHtml(d.ending)+'」</div></div></div>';
}
function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function actionRowHtml(){
  return '<div class="action-row"><button class="btn-copy" id="btn-copy-result">📋 複製</button><button class="btn-regen" id="btn-regen-result">🎲 再來一版</button></div>';
}
function roastV2ActionRowHtml(){
  var shareBtn=navigator.share?'<button class="btn-copy" id="btn-roast-share">↗ 分享</button>':'';
  return '<div class="action-row">'
    +'<button class="btn-regen" id="btn-regen-result">🔁 再嗆一版</button>'
    +'<button class="btn-copy" id="btn-copy-result">📋 複製</button>'
    +'<button class="btn-copy" id="btn-roast-share-card">🖼 產生分享圖卡</button>'
    +shareBtn
    +'</div>'
    +'<button type="button" id="btn-make-work-roast" style="width:100%;margin-top:8px;padding:9px;background:transparent;border:1px solid #e0d0c0;border-radius:8px;color:#bbb;font-size:0.85em;cursor:pointer;">把這句變成作品</button>';
}
function roastDualActionRowHtml(){
  var shareBtn=navigator.share?'<button class="btn-copy" id="btn-roast-share">↗ 分享</button>':'';
  var secStyle='width:100%;margin-top:6px;padding:10px;min-height:52px;background:transparent;border:1px solid #e0d0c0;border-radius:8px;color:#bbb;font-size:0.83em;cursor:pointer;';
  var toggleStyle='width:100%;margin:8px 0 2px;padding:11px;min-height:52px;border-radius:9px;font-weight:700;cursor:pointer;font-size:0.95em;';
  var toggleBtn=roastResult.activeEngine==='spicy'
    ?'<button type="button" id="btn-engine-toggle-roast" style="'+toggleStyle+'background:#f0fdf4;border:1.5px dashed #4ade80;color:#166534;">🫙 今天先冷靜一下</button>'
    :'<button type="button" id="btn-engine-toggle-roast" style="'+toggleStyle+'background:#fff7ed;border:1.5px dashed #fb923c;color:#c2650a;">🤣 再辣一點</button>';
  var regenLabel=roastResult.activeEngine==='spicy'?'🌶 加辣再嗆':'🐭 還有別的嗆法';
  return '<div class="action-row">'
    +'<button class="btn-regen" id="btn-regen-result">'+regenLabel+'</button>'
    +'<button class="btn-copy" id="btn-copy-result">收下這句</button>'
    +'<button class="btn-copy" id="btn-roast-card">🖼 圖卡</button>'
    +shareBtn
    +'</div>'
    +toggleBtn
    +'<div style="display:flex;gap:6px;margin-top:6px;">'
    +'<button type="button" id="btn-make-song" style="'+secStyle+'flex:1;">🎤 唱成歌</button>'
    +'<button type="button" id="btn-make-film" style="'+secStyle+'flex:1;">🎬 拍成電影</button>'
    +'</div>';
}
function bigDreamActionRowHtml(){
  var shareBtn=navigator.share?'<button class="btn-copy" id="btn-bigdream-share">↗ 分享</button>':'';
  var secStyle='width:100%;margin-top:6px;padding:10px;min-height:52px;background:transparent;border:1px solid #e0d0c0;border-radius:8px;color:#bbb;font-size:0.83em;cursor:pointer;';
  var toggleStyle='width:100%;margin:8px 0 2px;padding:11px;min-height:52px;border-radius:9px;font-weight:700;cursor:pointer;font-size:0.95em;';
  var toggleBtn=bigDreamResult.activeEngine==='crazy'
    ?'<button type="button" id="btn-engine-toggle-bigdream" style="'+toggleStyle+'background:#e0f2fe;border:1.5px dashed #38bdf8;color:#0369a1;">☁️ 今天先收一點</button>'
    :'<button type="button" id="btn-engine-toggle-bigdream" style="'+toggleStyle+'background:#fef9c3;border:1.5px dashed #facc15;color:#a16207;">🚀 再吹大一點</button>';
  var bdRegenLabel=bigDreamResult.activeEngine==='crazy'?'🚀 繼續吹大一點':'🐯 換一個夢';
  return '<div class="action-row">'
    +'<button class="btn-regen" id="btn-regen-result">'+bdRegenLabel+'</button>'
    +'<button class="btn-copy" id="btn-copy-result">收下這個夢</button>'
    +'<button class="btn-copy" id="btn-bigdream-card">🖼 圖卡</button>'
    +shareBtn
    +'</div>'
    +toggleBtn
    +'<div style="display:flex;gap:6px;margin-top:6px;">'
    +'<button type="button" id="btn-make-song" style="'+secStyle+'flex:1;">🎤 唱成歌</button>'
    +'<button type="button" id="btn-make-film" style="'+secStyle+'flex:1;">🎬 拍成電影</button>'
    +'</div>';
}
function _showRoastCardInline(anchorId,card,shareText){
  var existing=document.getElementById(anchorId);
  if(existing) existing.remove();
  var pw=Math.min(360,window.innerWidth-48);
  var previewEl=document.createElement('canvas');
  previewEl.width=pw;previewEl.height=pw;
  previewEl.getContext('2d').drawImage(card,0,0,pw,pw);
  previewEl.style.cssText='display:block;margin:12px auto;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15);max-width:100%;';
  var container=document.createElement('div');
  container.id=anchorId;container.style.marginTop='12px';
  container.appendChild(previewEl);
  var hintEl=document.createElement('p');
  hintEl.style.cssText='text-align:center;font-size:12px;color:#999;margin:2px 0 8px;';
  hintEl.textContent='長按圖片儲存（手機）';
  container.appendChild(hintEl);
  var actRow=document.createElement('div');
  actRow.className='action-row';actRow.style.justifyContent='center';
  var dlBtn=document.createElement('button');
  dlBtn.className='btn-copy';dlBtn.textContent='⬇ 下載';
  dlBtn.addEventListener('click',function(){downloadCanvas(card,'laugh-mouse-roast.png');});
  var cpBtn=document.createElement('button');
  cpBtn.className='btn-copy';cpBtn.textContent='📋 複製文案';
  cpBtn.addEventListener('click',function(){copyToClipboard(shareText);});
  actRow.appendChild(dlBtn);actRow.appendChild(cpBtn);
  if(navigator.share){
    var shBtn=document.createElement('button');
    shBtn.className='btn-copy';shBtn.textContent='↗ 分享';
    shBtn.addEventListener('click',function(){shareCanvas(card,shareText);});
    actRow.appendChild(shBtn);
  }
  container.appendChild(actRow);
  els.results.appendChild(container);
}
/* ── BIGDREAM_SITUATIONS 情境庫 ──────────────────────────────────── */
var BIGDREAM_SITUATIONS={
  travel:{
    keywords:['旅行','出去玩','出國','環遊','背包','機票','海外'],
    small:{
      wish:'你不是只想旅行。\n你是想換一個地方呼吸。',
      pie:'先想像你站在海邊。\n手機沒有一直響。\n風也沒有問你報表做完沒。',
      step:'今天先打開地圖，選一個你最想去的地方。'
    },
    crazy:{
      brag:'你不是想旅行。\n你是想把人生從待辦清單裡救出來。',
      parallel:'很好。直接安排世界巡演。\n\n第一站金門。\n第二站冰島。\n第三站南極。\n\n企鵝都在排隊跟你拍照。\n護照蓋章蓋到要加班。',
      step:'今天先查一張機票。\n不用買，先讓夢想看到入口。'
    }
  },
  startup:{
    keywords:['創業','開店','開公司','做生意','自己的品牌','副業','接案','做老闆'],
    small:{
      wish:[
        '你不是只想創業。\n你是想證明自己也可以做出一點東西。',
        '你不是想當老闆。\n你是想有一天，做的東西是你自己決定的。',
        '你不是只想賺錢。\n你是想讓「這是我做的」這句話說出口。'
      ],
      pie:[
        '先想像有一天，\n有人不是問你在哪裡上班，\n而是問你：這個品牌怎麼想出來的？',
        '先想像三年後，\n你在解釋你的品牌，\n對方說：原來你一開始就這樣想。',
        '先想像某個人問你：你怎麼開始的？\n你說的那個故事，\n就是今天要留下來的第一句話。'
      ],
      step:[
        '今天先寫下品牌名字。\n不好也沒關係，反正第一個名字通常都很像早餐店。',
        '今天先說出這是要給誰用的。\n不是市場，不是目標客群，是一個具體的人。',
        '今天先寫一句：我做這個是因為——\n不管好不好聽，先寫出來。'
      ]
    },
    crazy:{
      brag:[
        '你不是想創業。\n你是想讓世界知道：\n你腦袋裡那鍋湯其實很有料。',
        '你不是想開公司。\n你是要讓五年後的人說：\n哦，原來這個是他做出來的。',
        '你不是要做老闆。\n你要讓某個人說：\n這正是我要的——然後你說：我做的。'
      ],
      parallel:[
        '很好。五年後你開記者會。\n\n記者問：當初怎麼開始？\n你說：我本來只是想試試看，\n結果試到公司有茶水間了。\n\n隔壁親戚以前說你想太多，\n現在改口說：我早就知道你不簡單。',
        '很好。三年後你的品牌上了某個版面。\n\n標題是：這個人只是不想再替別人工作了。\n\n他當初說你想太多的那個人，已經默默追蹤了。',
        '很好。兩年後你的客戶說：\n找了很多人，最後還是你做的最對味。\n\n你說：我一開始也不確定。\n他說：就是那個不確定，做出來才有味道。'
      ],
      step:[
        '今天先開一個資料夾。\n名字叫：我的事業帝國第一天。',
        '今天先回答：如果只能做一件事，你做什麼？\n不用對，先說出來。',
        '今天先找到那個\n你最確定不想再替別人做的事，\n寫下來，這就是起點。'
      ]
    }
  },
  kids:{
    keywords:['孩子','小孩','兒子','女兒','讓他聽話','聽我的','教小孩','育兒','管小孩'],
    small:{
      wish:[
        '不是孩子聽話。\n是有一天你不用吼到隔壁鄰居都知道，\n孩子也願意回頭聽你一句。',
        '不是孩子乖。\n是你說完，他點個頭，\n你知道他有聽進去了。',
        '不是要管他。\n是他有一天遇到事情，\n第一個想到的人是你。'
      ],
      pie:[
        '先想像今晚。\n你少講三句。\n孩子少頂兩句。\n家裡安靜到連電鍋都覺得奇怪。',
        '先想像明天早上。\n你說一句，他說：好。\n就這樣，沒有爭論，沒有眼神翻白。\n你們都出門了。',
        '先想像有一天，\n他做到了你說的那件事，\n然後跑回來說：我做完了。\n那個感覺，就是你在找的。'
      ],
      step:[
        '今天先不要講十句。\n只講一句最重要的。',
        '今天先不急著說你要什麼。\n先問他一件事就好。',
        '今天先少說一句，\n留那個空間給他填進來。'
      ]
    },
    crazy:{
      brag:[
        '不是孩子聽話。\n是你還沒開口，\n孩子就說：好，我知道了。',
        '不是要他乖。\n是他自己說：等一下，我先把這個做完。\n然後他真的做完了。',
        '不是要管他。\n是他有一天說：\n你之前講的那句話，我後來懂了。'
      ],
      parallel:[
        '很好。我們直接吹到十年後。\n\n全世界的父母都來向你取經。\n孩子一看到你，不是逃跑，\n是自己搬椅子坐好。\n\n功課寫好了。房間整理好了。手機先收起來了。\n\n連老師都打電話來：\n不好意思，我們想借您的孩子去示範自動自發。',
        '很好。五年後，\n你的孩子在某個場合說：\n「我爸（媽）教我的，不要怕麻煩。」\n旁邊的人說：哇，你家長真的很厲害。\n他說：對，但他以前也很煩。\n（這句是讚美。）',
        '很好。十五年後，\n他打電話說：我知道以前我很難帶，\n但謝謝你沒有放棄跟我說那些話。\n你說：我早忘了說什麼了。\n他說：我沒有忘。'
      ],
      step:[
        '今天先不要想怎麼讓他完全聽話。\n先問他一句：\n今天有沒有一件事，讓你覺得很開心？',
        '今天先給他做到一件事的機會，\n讓他說：我做完了。\n你說：好。就這樣。',
        '今天先不說那句你最想說的。\n看看沒有那句話，他會說什麼。'
      ]
    }
  }
};

function detectBigDreamSituation(input){
  var text=(input||'').toLowerCase();
  var keys=Object.keys(BIGDREAM_SITUATIONS);
  for(var i=0;i<keys.length;i++){
    var sit=BIGDREAM_SITUATIONS[keys[i]];
    for(var j=0;j<sit.keywords.length;j++){
      if(text.indexOf(sit.keywords[j])!==-1) return keys[i];
    }
  }
  return null;
}

/* ── generateBigDreamSmall / generateBigDreamCrazy ──────────────── */
function generateBigDreamSmall(input,topic){
  topic=topic||shortInput(input,14);
  var sit=detectBigDreamSituation(input);
  if(sit){
    var s=BIGDREAM_SITUATIONS[sit].small;
    var wArr=Array.isArray(s.wish)?s.wish:[s.wish];
    var pArr=Array.isArray(s.pie)?s.pie:[s.pie];
    var stArr=Array.isArray(s.step)?s.step:[s.step];
    return {role:'tiger',tagClass:'tag-tiger',
      wish:pickVaried('bd_'+sit+'_sw',wArr),
      pie:pickVaried('bd_'+sit+'_sp',pArr),
      step:pickVaried('bd_'+sit+'_ss',stArr),
      topic:topic,quote:pickGoldenQuote('bigdream')};
  }
  var wishLine=fill(pickVaried('tiger_wish_s',TIGER_WISH),{topic:topic});
  var pie=fill(pickVaried('tiger_pie_s',TIGER_PIE),{topic:topic});
  return {role:'tiger',tagClass:'tag-tiger',
    wish:wishLine,pie:pie,
    step:'先把「'+topic+'」說出口，這就是第一步。',
    topic:topic,quote:pickGoldenQuote('bigdream')};
}
function generateBigDreamCrazy(input,topic){
  topic=topic||shortInput(input,14);
  var sit=detectBigDreamSituation(input);
  if(sit){
    var c=BIGDREAM_SITUATIONS[sit].crazy;
    var bArr=Array.isArray(c.brag)?c.brag:[c.brag];
    var paArr=Array.isArray(c.parallel)?c.parallel:[c.parallel];
    var stArr=Array.isArray(c.step)?c.step:[c.step];
    return {role:'tiger',tagClass:'tag-tiger',
      brag:pickVaried('bd_'+sit+'_cb',bArr),
      parallel:pickVaried('bd_'+sit+'_cp',paArr),
      step:pickVaried('bd_'+sit+'_cs',stArr),
      topic:topic,quote:pickGoldenQuote('bigdream')};
  }
  var bragLine=fill(pickVaried('tiger_brag_c',TIGER_BRAG),{topic:topic});
  var parallel=fill(pickVaried('tiger_parallel_c',TIGER_PARALLEL),{topic:topic});
  return {role:'tiger',tagClass:'tag-tiger',
    brag:bragLine,parallel:parallel,
    step:'先說出來，明天再開始努力。吹牛不用繳稅金！🐯',
    topic:topic,quote:pickGoldenQuote('bigdream')};
}

/* ── renderRoastResult / renderRoastEngineResult ─────────────────── */
function renderRoastResult(input,targetLabel){
  var engineKey=roastResult.activeEngine;
  var data=roastResult.engines[engineKey];
  return renderRoastEngineResult(engineKey,data,input,targetLabel);
}

function renderRoastEngineResult(engineKey,data,input,targetLabel){
  var tc='vent tag-rat';
  var labelStyle='display:inline-block;font-size:0.78em;font-weight:800;padding:0.22em 0.75em;border-radius:20px;margin-bottom:0.75em;';
  var engineLabel=engineKey==='spicy'
    ?'<span style="'+labelStyle+'background:#fef3c7;color:#b45309;">🌶 加辣版</span>'
    :'<span style="'+labelStyle+'background:#f0fdf4;color:#166534;">🫙 原味版</span>';
  var contentHtml;
  if(engineKey==='spicy'&&data){
    var m=data.roast.mouseOutput;
    contentHtml=[
      _v2Section('嗆聲版',[m.truth,m.analogy]),
      _v2Section('給你好看版',[m.honest,m.boundary]),
      _v2Section('下樓梯版',[m.selfOwn,m.comicExit])
    ].join('');
  } else if(data){
    contentHtml=[
      _v2Section('嗆聲版',[data.truth,data.analogy]),
      _v2Section('給你好看版',[data.honest,data.boundary]),
      _v2Section('下樓梯版',[data.comicExit,data.nextAction])
    ].join('');
  } else {
    contentHtml='<div>資料載入中…</div>';
  }
  var clarifyHtml='';
  if(engineKey==='original'&&roastResult.engines.spicy&&roastResult.engines.spicy.clarifyOpts&&roastResult.engines.spicy.clarifyOpts.length>0){
    clarifyHtml=renderRoastClarifyBlock(roastResult.engines.spicy.clarifyOpts[0],input||'',targetLabel||'');
  }
  var _ratTier=Math.min(_sessionUseCount.roast,RAT_SESSION_PHRASES.length-1);
  var ratEntrance=pickVaried('rat_session_'+_ratTier,RAT_SESSION_PHRASES[_ratTier]);
  _sessionUseCount.roast++;
  return '<div id="roast-engine-block">'
    +'<div class="result-card '+tc+'">'
    +'<div class="who">🐭 '+ratEntrance+'</div>'
    +'<div class="body-text">'+engineLabel+contentHtml+'</div>'
    +'</div>'
    +'</div>'
    +clarifyHtml;
}

/* ── renderBigDreamResult / renderBigDreamEngineResult ───────────── */
function renderBigDreamResult(){
  var engineKey=bigDreamResult.activeEngine;
  var data=bigDreamResult.engines[engineKey];
  return renderBigDreamEngineResult(engineKey,data);
}

function renderBigDreamEngineResult(engineKey,data){
  var tc='tag-tiger';
  var labelStyle='display:inline-block;font-size:0.78em;font-weight:800;padding:0.22em 0.75em;border-radius:20px;margin-bottom:0.75em;';
  var engineLabel=engineKey==='crazy'
    ?'<span style="'+labelStyle+'background:#fef9c3;color:#a16207;">🚀 狂吹版</span>'
    :'<span style="'+labelStyle+'background:#e0f2fe;color:#0369a1;">☁️ 小吹版</span>';
  var contentHtml;
  if(engineKey==='crazy'&&data){
    contentHtml=[
      _v2Section('你真正想要的是',[data.brag]),
      _v2Section('吹到宇宙去',[data.parallel]),
      _v2Section('今天偷一小步',[data.step||'先說出來，明天再開始努力。吹牛不用繳稅金！🐯'])
    ].join('');
  } else if(data){
    contentHtml=[
      _v2Section('你真正想要的是',[data.wish]),
      _v2Section('小吹一下',[data.pie]),
      _v2Section('今天偷一小步',[data.step||'先把「'+escapeHtml(data.topic||'')+'」說出口，這就是第一步。'])
    ].join('');
  } else {
    contentHtml='<div>資料載入中…</div>';
  }
  var _tigerTier=Math.min(_sessionUseCount.bigdream,TIGER_SESSION_PHRASES.length-1);
  var tigerEntrance=pickVaried('tiger_session_'+_tigerTier,TIGER_SESSION_PHRASES[_tigerTier]);
  _sessionUseCount.bigdream++;
  return '<div id="bigdream-engine-block">'
    +'<div class="result-card '+tc+'">'
    +'<div class="who">🐯 '+tigerEntrance+'</div>'
    +'<div class="body-text">'+engineLabel+contentHtml+'</div>'
    +'</div>'
    +'</div>';
}

function renderRoastDualBlock(v2r,v1data,input,targetLabel){
  var m=v2r.roast.mouseOutput;
  var tc='vent tag-rat';
  var fTagStyle='display:inline-block;font-size:0.78em;font-weight:800;padding:0.22em 0.75em;border-radius:20px;margin-bottom:0.75em;';
  var fActStyle='display:flex;gap:8px;margin-top:0.85em;';
  var fBtnStyle='flex:1;padding:9px;border:1px solid #e0d0c0;border-radius:8px;background:#fff;font-size:0.88em;cursor:pointer;font-weight:600;';
  var divider='<div style="margin:1.3em 0;border-top:1.5px dashed #e8dcc8;"></div>';
  /* 加辣版 */
  var spicyTag='<span style="'+fTagStyle+'background:#fef3c7;color:#b45309;">🌶 加辣版</span>';
  var spicyBody=[
    _v2Section('嗆聲版',[m.truth,m.analogy]),
    _v2Section('給你好看版',[m.honest,m.boundary]),
    _v2Section('下樓梯版',[m.selfOwn,m.comicExit])
  ].join('');
  var spicyActs='<div style="'+fActStyle+'">'
    +'<button style="'+fBtnStyle+'" id="btn-copy-spicy">📋 複製</button>'
    +'<button style="'+fBtnStyle+'" id="btn-card-spicy">🖼 圖卡</button>'
    +'</div>';
  /* 原味版 */
  var origTag='<span style="'+fTagStyle+'background:#f0fdf4;color:#166534;">🫙 原味版</span>';
  var origBody=[
    _v2Section('嗆聲版',[v1data.truth,v1data.analogy]),
    _v2Section('給你好看版',[v1data.honest,v1data.boundary]),
    _v2Section('下樓梯版',[v1data.comicExit,v1data.nextAction])
  ].join('');
  var origActs='<div style="'+fActStyle+'">'
    +'<button style="'+fBtnStyle+'" id="btn-copy-original">📋 複製</button>'
    +'<button style="'+fBtnStyle+'" id="btn-card-original">🖼 圖卡</button>'
    +'</div>';
  var cardHtml='<div class="result-card '+tc+'">'
    +'<div class="who">🐭 小天鼠開嗆</div>'
    +'<div class="body-text">'
    +spicyTag+spicyBody+spicyActs
    +divider
    +origTag+origBody+origActs
    +'</div></div>';
  var clarifyHtml='';
  if(v2r.clarifyOpts&&v2r.clarifyOpts.length>0){
    clarifyHtml=renderRoastClarifyBlock(v2r.clarifyOpts[0],input,targetLabel);
  }
  return cardHtml+clarifyHtml;
}
function drawRoastCard(truthLine,analogyLine,subLine,flavor){
  var isOrig=flavor==='original';
  var topColor=isOrig?'#166534':'#6d28d9';
  var topLabel=isOrig?'🫙 原味版':'🌶 加辣版';
  var width=1080,height=1080;
  var canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  var ctx=canvas.getContext('2d');
  var s=width/1080;

  /* 背景：純淨米白，讓文字對比最大 */
  ctx.fillStyle='#FEFAF3';
  ctx.fillRect(0,0,width,height);
  ctx.globalAlpha=0.04;ctx.fillStyle=topColor;
  ctx.beginPath();ctx.arc(width*0.92,height*0.5,340*s,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;
  /* 角色大水印 */
  var ratWm=IMG_CACHE['rat.webp'];
  if(ratWm){
    var wmSz=420*s;
    ctx.globalAlpha=0.10;
    ctx.drawImage(ratWm,width-wmSz-24*s,height/2-wmSz/2,wmSz,wmSz);
    ctx.globalAlpha=1;
  }

  /* 頂欄：老鼠縮成 logo（44px），左對齊，右側加 #嗆聲 標籤 */
  var barH=72*s,pad=32*s;
  ctx.fillStyle=topColor;
  ctx.fillRect(0,0,width,barH);
  var rat=IMG_CACHE['rat.webp'];
  var ratSz=44*s;
  if(rat) ctx.drawImage(rat,pad,barH/2-ratSz/2,ratSz,ratSz);
  ctx.fillStyle='#ffffff';
  ctx.textAlign='left';
  ctx.font='800 '+Math.round(28*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillText('小天鼠',pad+ratSz+12*s,barH*0.44);
  ctx.font='400 '+Math.round(19*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillStyle='rgba(255,255,255,0.75)';
  ctx.fillText('今天幫你講一句',pad+ratSz+12*s,barH*0.80);
  ctx.textAlign='right';
  ctx.fillStyle='rgba(255,255,255,0.65)';
  ctx.font='600 '+Math.round(22*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillText(topLabel,width-pad,barH*0.68);

  /* ── 主文字區：字是主角 ── */
  ctx.textAlign='center';

  /* 嗆聲版 line 1：超大標，視覺第一焦點 */
  var t1Y=barH+200*s;
  ctx.fillStyle='#1a0500';
  ctx.font='900 '+Math.round(96*s)+'px "Noto Serif TC",serif';
  var t1Bot=wrapCanvasText(ctx,truthLine,width/2,t1Y,width*0.86,Math.round(110*s));

  /* 嗆聲版 line 2：大標，品牌紫，視覺第二焦點 */
  var t2Y=Math.max(t1Bot+80*s,t1Y+230*s);
  ctx.fillStyle='#6d28d9';
  ctx.font='700 '+Math.round(64*s)+'px "Noto Sans TC",sans-serif';
  wrapCanvasText(ctx,analogyLine,width/2,t2Y,width*0.86,Math.round(76*s));

  /* 分隔線 */
  var divY=height-220*s;
  ctx.strokeStyle='rgba(109,40,217,0.18)';
  ctx.lineWidth=1.5*s;
  ctx.beginPath();ctx.moveTo(width*0.08,divY);ctx.lineTo(width*0.92,divY);ctx.stroke();

  /* 給你好看版 line 1：分隔線下小字提示 */
  if(subLine){
    ctx.fillStyle='rgba(58,36,23,0.45)';
    ctx.font=Math.round(28*s)+'px "Noto Sans TC",sans-serif';
    wrapCanvasText(ctx,subLine,width/2,divY+50*s,width*0.78,Math.round(38*s));
  }

  /* 底部品牌欄 */
  var footH=130*s;
  var catchphrase=isOrig?'「嗆得有水準，說得有才華」':'「今天是辣的，說話不客氣」';
  ctx.fillStyle='#D89A3E';
  ctx.fillRect(0,height-footH,width,footH);
  ctx.textAlign='left';
  ctx.fillStyle='rgba(26,5,0,0.5)';
  ctx.font='400 '+Math.round(20*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillText(catchphrase,pad,height-footH+26*s);
  ctx.textAlign='center';
  ctx.fillStyle='#1a0500';
  ctx.font='800 '+Math.round(36*s)+'px "Noto Serif TC",serif';
  ctx.fillText('笑鼠人了！',width/2,height-footH+72*s);
  ctx.font='400 '+Math.round(18*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillStyle='rgba(26,5,0,0.55)';
  ctx.fillText('笑掉煩惱，吹大夢想，把人生活成作品',width/2,height-footH+102*s);

  return canvas;
}
function drawBigDreamCard(mainLine,secondLine,flavor){
  var isCrazy=flavor==='crazy';
  var topColor=isCrazy?'#a16207':'#0369a1';
  var topLabel=isCrazy?'🚀 狂吹版':'☁️ 小吹版';
  var width=1080,height=1080;
  var canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  var ctx=canvas.getContext('2d');
  var s=width/1080;

  /* 背景 */
  ctx.fillStyle=isCrazy?'#FFFBEB':'#F0F9FF';
  ctx.fillRect(0,0,width,height);
  ctx.globalAlpha=0.06;ctx.fillStyle=topColor;
  ctx.beginPath();ctx.arc(width*0.9,height*0.45,320*s,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;
  /* 角色大水印 */
  var tigerWm=IMG_CACHE['tiger.webp'];
  if(tigerWm){
    var wmSz=420*s;
    ctx.globalAlpha=0.10;
    ctx.drawImage(tigerWm,width-wmSz-24*s,height/2-wmSz/2,wmSz,wmSz);
    ctx.globalAlpha=1;
  }

  /* 頂欄 */
  var barH=72*s,pad=32*s;
  ctx.fillStyle=topColor;
  ctx.fillRect(0,0,width,barH);
  var tiger=IMG_CACHE['tiger.webp'];
  var tigerSz=44*s;
  if(tiger) ctx.drawImage(tiger,pad,barH/2-tigerSz/2,tigerSz,tigerSz);
  ctx.fillStyle='#ffffff';
  ctx.textAlign='left';
  ctx.font='800 '+Math.round(28*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillText('唬爛虎',pad+tigerSz+12*s,barH*0.44);
  ctx.font='400 '+Math.round(19*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillStyle='rgba(255,255,255,0.75)';
  ctx.fillText('今天幫你吹一個',pad+tigerSz+12*s,barH*0.80);
  ctx.textAlign='right';
  ctx.fillStyle='rgba(255,255,255,0.65)';
  ctx.font='600 '+Math.round(22*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillText(topLabel,width-pad,barH*0.68);

  /* 主文字區 */
  ctx.textAlign='center';
  var t1Y=barH+200*s;
  ctx.fillStyle='#1a0500';
  ctx.font='900 '+Math.round(88*s)+'px "Noto Serif TC",serif';
  var t1Bot=wrapCanvasText(ctx,mainLine,width/2,t1Y,width*0.86,Math.round(104*s));

  var t2Y=Math.max(t1Bot+75*s,t1Y+220*s);
  ctx.fillStyle=topColor;
  ctx.font='700 '+Math.round(58*s)+'px "Noto Sans TC",sans-serif';
  wrapCanvasText(ctx,secondLine,width/2,t2Y,width*0.86,Math.round(70*s));

  /* 分隔線 */
  var divY=height-220*s;
  var rgbStr=isCrazy?'161,98,7':'3,105,161';
  ctx.strokeStyle='rgba('+rgbStr+',0.18)';
  ctx.lineWidth=1.5*s;
  ctx.beginPath();ctx.moveTo(width*0.08,divY);ctx.lineTo(width*0.92,divY);ctx.stroke();

  /* 底部品牌欄 */
  var footH=130*s;
  var catchphrase=isCrazy?'「吹牛不用繳稅金」':'「先吹，先開始」';
  ctx.fillStyle=isCrazy?'#D89A3E':'#38BDF8';
  ctx.fillRect(0,height-footH,width,footH);
  ctx.textAlign='left';
  ctx.fillStyle='rgba(26,5,0,0.5)';
  ctx.font='400 '+Math.round(20*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillText(catchphrase,pad,height-footH+26*s);
  ctx.textAlign='center';
  ctx.fillStyle=isCrazy?'#1a0500':'#0c4a6e';
  ctx.font='800 '+Math.round(36*s)+'px "Noto Serif TC",serif';
  ctx.fillText('笑鼠人了！',width/2,height-footH+72*s);
  ctx.font='400 '+Math.round(18*s)+'px "Noto Sans TC",sans-serif';
  ctx.fillStyle='rgba(26,5,0,0.55)';
  ctx.fillText('笑掉煩惱，吹大夢想，把人生活成作品',width/2,height-footH+102*s);

  return canvas;
}
function routeBNextHtml(currentId){
  var idx=ROUTE_B_ORDER.indexOf(currentId);
  var isLast=idx===ROUTE_B_ORDER.length-1;
  if(isLast) return '<button class="btn-primary" id="btn-route-finish" style="margin-top:10px;">完成創作之旅 🎉</button>';
  var nextMeta=modeMeta(ROUTE_B_ORDER[idx+1]);
  return '<button class="btn-primary" id="btn-route-next" style="margin-top:10px;">繼續下一步：'+nextMeta.icon+' '+nextMeta.title+'</button>';
}
function copyToClipboard(text,msg){
  msg=msg||'收好了。拿去用。';
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){toast(msg);}).catch(function(){toast('複製失敗，請手動選取文字');});
  } else { toast('此瀏覽器不支援自動複製，請手動選取文字'); }
}

/* ---------------------------------------------------
   創作工坊（雙版）
--------------------------------------------------- */
function renderWorkshopArea(){
  els.inputArea.innerHTML='<div class="field-block"><label>補充說明（可留空，會沿用你的故事）</label>'
    +'<textarea id="main-input" placeholder="例如：想做搞笑版 / 想強調電影感…">'+(flow.context.wish||flow.context.topic||flow.input||'')+'</textarea></div>'
    +chipBlock('style-chip','作品風格',['搞笑自嘲','溫暖療癒','熱血電影感']);
  bindChips();
  els.results.innerHTML='<button class="btn-primary" id="btn-workshop-go">🎤 免費產生兩版 AI 歌曲指令 🎬</button>';
  document.getElementById('btn-workshop-go').addEventListener('click',runWorkshop);
}

function runWorkshop(){
  // W3（機場塔台）歌曲製作中：不進工坊、不扣額度
  var _cw=flow.context.comicWorld;
  var _hwGated=_cw==='W3'&&flow.context.situationCategory==='homework'&&flow.context.targetCategory==='child';
  if(_hwGated){
    els.results.innerHTML='<div class="info-box" style="padding:1em;border-radius:8px;background:#f5f5f5;margin:1em 0;"><b>W3 機場塔台</b>的專屬歌曲正在依核准內容製作中。<br>歌曲完成前此世界不進入工坊，本次不扣除額度。</div>';
    return;
  }
  tryConsumeQuota('workshop').then(function(qResult){
    if(!qResult.ok){showQuotaExhausted('workshop',qResult.reason);return;}
    var inputEl=document.getElementById('main-input');
    var extra=inputEl?inputEl.value.trim():'';
    if(extra) flow.context.topic=flow.context.topic||extra;
    flow.context.wish=flow.context.wish||flow.context.topic||extra;
    var styleHint=getChipValue('style-chip')||'';
    flow.context.styleHint=styleHint;

    var vA=genSongVersionA(flow.context);
    var vB=genSongVersionB(flow.context);
    flow.context.songVersions=[vA,vB];

    var isFullPack=flow.context.situationCategory==='homework'&&flow.context.targetCategory==='child'&&flow.context.comicWorld==='chef';

    var html='';
    html+=renderWorkshopSection('🎵 歌曲成品包','歌詞 → Suno / Udio → Lyrics｜曲風 → Suno Custom Mode → Style of Music',
      renderSongVersionCard(vA)+renderSongVersionCard(vB));

    if(isFullPack){
      var memeCards=genMemeCards(flow.context);
      var illusPrompts=genIllustrationPrompts(flow.context);
      var videoFrames=genThreeFrames(flow.context);
      html+=renderWorkshopSection('🖼 社群梗圖卡','複製文案 → 貼到 Canva 模板，或直接截圖分享',
        renderMemeCardsSection(memeCards));
      html+=renderWorkshopSection('🎨 插畫 Prompt','貼到 Midjourney / DALL·E / Flux 生成插畫',
        renderIllustrationSection(illusPrompts));
      html+=renderWorkshopSection('🎞 短影片三畫面','複製三畫面 → 貼到 CapCut AI / Runway / Pika 場景輸入',
        renderThreeFramesSection(videoFrames));
    }else{
      html+='<div class="workshop-pack-block"><div style="padding:14px 16px;background:#f9f5ef;border-radius:10px;font-size:13.5px;color:var(--coffee-soft);line-height:1.7;">🎨 梗圖卡、插畫 Prompt、短影片三畫面<br>正在為這個情境整理中，先帶走歌曲成品！</div></div>';
    }

    html+='<div class="workshop-actions"><button class="btn-regen btn-workshop-regen" id="btn-workshop-regen">🔄 再生成一版</button></div>';
    html+='<div id="mv-area"></div>';

    els.results.innerHTML=html;
    document.getElementById('btn-workshop-regen').addEventListener('click',runWorkshop);
    bindWorkshopSelect();
    logEvent('GENERATE_SONG',{styleHint:styleHint});
    saveDraft();
    if(qResult.remaining===0) toast('已使用今日最後一次工坊額度 🎨');
  });
}

function renderSongVersionCard(v){
  var lyricsCopy=v.lyrics||'';
  var promptCopy=v.aiPrompt||'';
  var fullPack=(v.title||'')+'\n\n'+lyricsCopy+'\n\n曲風 Prompt:\n'+promptCopy;
  return '<div class="song-card" data-version="'+v.version+'">'
    +'<div class="song-card-head"><span class="song-icon">'+v.icon+'</span><span class="song-label">'+v.label+'</span><span class="song-style">'+escapeHtml(v.style)+'</span></div>'
    +'<div class="song-title">'+escapeHtml(v.title)+'</div>'
    +'<div class="song-concept">'+escapeHtml(v.concept)+'</div>'
    +'<pre class="song-lyrics">'+escapeHtml(lyricsCopy)+'</pre>'
    +'<div style="margin-top:10px;font-size:13px;color:var(--maroon);font-weight:700;">🎸 曲風 Prompt</div>'
    +'<div class="prompt-box" style="font-size:12px;">'+escapeHtml(promptCopy)+'</div>'
    +'<div class="song-card-actions" style="flex-wrap:wrap;">'
    +'<button class="btn-copy" data-copy="'+escapeAttr(lyricsCopy)+'">📋 複製歌詞</button>'
    +'<button class="btn-copy" data-copy="'+escapeAttr(promptCopy)+'">🎸 複製曲風</button>'
    +'<button class="btn-copy" style="width:100%;margin-top:8px;" data-copy="'+escapeAttr(fullPack)+'">📦 複製整包</button>'
    +'</div></div>';
}

function bindWorkshopSelect(){
  Array.prototype.forEach.call(document.querySelectorAll('#mode-results .btn-copy'),function(btn){
    if(btn.dataset.copy!==undefined){
      btn.addEventListener('click',function(){copyToClipboard(btn.dataset.copy);});
    }
  });
}

function renderWorkshopSection(title,hint,content){
  return '<div class="workshop-pack-block">'
    +'<div class="workshop-pack-header">'+title+'</div>'
    +'<div class="workshop-hint-top">'+hint+'</div>'
    +content
    +'</div>';
}

function genMemeCards(context){
  var isHW=context.situationCategory==='homework'&&context.targetCategory==='child';
  if(isHW){
    return [
      {label:'🐭 小天鼠吐槽卡',text:'作業跟你很有禮貌：\n它不碰你，你也不碰它。'},
      {label:'🐯 唬爛虎吹大卡',text:'打開作業本那一刻，\n主廚正式復出。'},
      {label:'🐭🐯 雙角色反差卡',text:'🐭 今天不供應「我等等」套餐。\n🐯 主廚入場，醬油先借。'}
    ];
  }
  var event=shortInput(context.event||'',12);
  var truth=(context.truth||'').split('。')[0];
  var boundary=(context.boundary||'').split('。')[0];
  var comicExit=(context.comicExit||'').split('。')[0];
  var wish=shortInput(context.wish||context.topic||'大夢想',10);
  var card1=truth?(truth+'。'):('「'+(event||'這件事')+'」，先接住，再說。');
  var card2=wish?('「'+wish+'」那一刻，\n主角正式復出。'):'準備好了，\n今天正式出發。';
  var card3='🐭 '+(boundary||'先選一個，其他先排號')+'。\n🐯 '+(comicExit||'今天就這一步，先做再說')+'。';
  return [
    {label:'🐭 小天鼠吐槽卡',text:card1},
    {label:'🐯 唬爛虎吹大卡',text:card2},
    {label:'🐭🐯 雙角色反差卡',text:card3}
  ];
}

function renderMemeCardsSection(cards){
  return cards.map(function(c){
    return '<div class="meme-card">'
      +'<div class="meme-card-label">'+escapeHtml(c.label)+'</div>'
      +'<div class="meme-card-text">'+escapeHtml(c.text).replace(/\n/g,'<br>')+'</div>'
      +'<div class="meme-card-actions">'
      +'<button class="btn-copy" data-copy="'+escapeAttr(c.text)+'">📋 複製文案</button>'
      +'</div></div>';
  }).join('');
}

function genIllustrationPrompts(context){
  var isHW=context.situationCategory==='homework'&&context.targetCategory==='child';
  if(isHW){
    return [
      {title:'插畫 1：封面圖',
       spec:'用途：社群封面 / APP 主視覺\n畫面：作業本攤在燈下，小天鼠坐旁邊攤手，孩子不在畫面。\n角色：小天鼠（攤手，無奈表情）\n風格：溫暖手繪，橘黃夜燈，細線條\n比例：1:1\n可貼到：Midjourney / DALL·E / Flux',
       en:'Open notebook under warm desk lamp, small cartoon mouse sitting beside with a helpless shrug, no child in frame, cozy fine-line illustration, warm orange palette —ar 1:1'},
      {title:'插畫 2：主角卡住圖',
       spec:'用途：嗆聲結果頁\n畫面：孩子背對觀眾坐書桌前，作業本合著。\n角色：孩子背影（圓頭無臉）\n風格：扁平插圖，夜間冷光，俯視角\n比例：16:9\n可貼到：Midjourney / DALL·E / Flux',
       en:"Bird's eye view, child sitting at desk from behind, closed notebook, flat illustration, cool night light, faceless round-head character —ar 16:9"},
      {title:'插畫 3：誇飾世界圖',
       spec:'用途：唬爛虎段 / 歌曲視覺\n畫面：唬爛虎穿廚師服站廚房入口，菜單燈亮著，外頭有人等著。\n角色：唬爛虎（廚師帽，正式入場姿勢）\n風格：飽和喜劇插畫，誇張構圖\n比例：16:9\n可貼到：Midjourney / DALL·E / Flux',
       en:"Cartoon tiger in chef's hat standing at kitchen doorway, menu sign lit up, audience waiting outside, dramatic entry pose, saturated comic style —ar 16:9"},
      {title:'插畫 4：下樓梯和解圖',
       spec:'用途：嗆聲「下樓梯版」結果頁\n畫面：深夜孩子翻開作業本，大人在旁邊喝茶，小天鼠坐在茶杯上。\n角色：小天鼠（放鬆版），孩子側臉，大人\n風格：繪本風，月光加暖燈\n比例：1:1\n可貼到：Midjourney / DALL·E / Flux',
       en:'Late night, child opening notebook, adult beside with tea, small cartoon mouse sitting on the teacup, moonlight and warm lamp, soft picture book style —ar 1:1'},
      {title:'插畫 5：梗圖模板圖',
       spec:'用途：梗圖卡背景 / 分享圖\n畫面：純色背景，小天鼠舉空白牌子，表情誇張委屈。\n角色：小天鼠（全身，舉牌）\n風格：扁平迷因風，粗邊框，無陰影\n比例：1:1\n可貼到：Midjourney / DALL·E / Canva',
       en:'Flat meme style, small cartoon mouse holding a blank sign, exaggerated sad face, solid background, thick outlines, no shadows —ar 1:1'}
    ];
  }
  var event=shortInput(context.event||'這件事',14);
  var targetMap={'child':'孩子','boss':'老闆','parent':'家長','partner':'另一半','friend':'朋友','colleague':'同事'};
  var targetDesc=targetMap[context.targetCategory]||'對方';
  return [
    {title:'插畫 1：封面圖',
     spec:'用途：社群封面 / APP 主視覺\n畫面：「'+event+'」場景，小天鼠在旁邊攤手。\n角色：小天鼠（攤手，無奈表情）\n風格：溫暖手繪，橘黃色調，細線條\n比例：1:1\n可貼到：Midjourney / DALL·E / Flux',
     en:'Small cartoon mouse with helpless shrug, minimal scene about "'+event+'", warm fine-line illustration, orange tone —ar 1:1'},
    {title:'插畫 2：卡住圖',
     spec:'用途：嗆聲結果頁\n畫面：主角背對觀眾，面對「'+event+'」還沒動作。\n角色：主角背影（圓頭無臉）\n風格：扁平插圖，冷光，俯視角\n比例：16:9\n可貼到：Midjourney / DALL·E / Flux',
     en:'Person from behind facing "'+event+'", flat illustration, cool light, bird\'s-eye view, faceless character —ar 16:9'},
    {title:'插畫 3：唬爛虎出場圖',
     spec:'用途：唬爛虎段 / 歌曲視覺\n畫面：唬爛虎舉手宣告，場景誇張，充滿氣勢。\n角色：唬爛虎（誇張宣告姿勢）\n風格：飽和喜劇插畫，誇張構圖\n比例：16:9\n可貼到：Midjourney / DALL·E / Flux',
     en:'Cartoon tiger making a grand announcement, dramatic background, exaggerated entry pose, saturated comic style —ar 16:9'},
    {title:'插畫 4：和解圖',
     spec:'用途：嗆聲下樓梯版結果頁\n畫面：夜間，主角翻開新頁，小天鼠在旁邊放鬆坐著。\n角色：小天鼠（放鬆版），主角側臉\n風格：繪本風，月光加暖燈\n比例：1:1\n可貼到：Midjourney / DALL·E / Flux',
     en:'Late night, person turning to a new page, small cartoon mouse sitting nearby relaxed, moonlight and warm lamp, soft picture book style —ar 1:1'},
    {title:'插畫 5：梗圖模板',
     spec:'用途：梗圖卡背景 / 分享圖\n畫面：純色背景，小天鼠舉空白牌子，表情誇張。\n角色：小天鼠（全身，舉牌）\n風格：扁平迷因風，粗邊框，無陰影\n比例：1:1\n可貼到：Midjourney / DALL·E / Canva',
     en:'Flat meme style, small cartoon mouse holding a blank sign, exaggerated expression, solid background, thick outlines, no shadows —ar 1:1'}
  ];
}

function renderIllustrationSection(prompts){
  return prompts.map(function(p){
    var fullCopy=p.spec+'\n\n英文 Prompt:\n'+p.en;
    return '<div class="illus-card">'
      +'<div class="illus-card-title">'+escapeHtml(p.title)+'</div>'
      +'<div class="prompt-box" style="font-size:12px;white-space:pre-wrap;">'+escapeHtml(p.spec)+'</div>'
      +'<div class="prompt-box" style="font-size:12px;margin-top:6px;">'+escapeHtml(p.en)+'</div>'
      +'<div class="illus-card-actions">'
      +'<button class="btn-copy" data-copy="'+escapeAttr(p.en)+'">📋 複製英文 Prompt</button>'
      +'<button class="btn-copy" data-copy="'+escapeAttr(fullCopy)+'">📦 複製完整規格</button>'
      +'</div></div>';
  }).join('');
}

function genThreeFrames(context){
  var isHW=context.situationCategory==='homework'&&context.targetCategory==='child';
  if(isHW){
    return [
      '畫面 1：作業攤在桌上，孩子和作業互不打擾。',
      '畫面 2：小天鼠拿著菜單吐槽「今天不供應我等等套餐」。',
      '畫面 3：孩子翻開作業本，唬爛虎宣布主廚復出。'
    ];
  }
  var event=shortInput(context.event||'這件事',14);
  var truth=(context.truth||'').split('。')[0];
  var comicExit=(context.comicExit||'').split('。')[0];
  return [
    '畫面 1：「'+event+'」，主角和問題各站一邊，互不打擾。',
    '畫面 2：小天鼠出場吐槽——「'+(truth||'先笑一下再說')+'」。',
    '畫面 3：唬爛虎宣告，主角翻開新頁，'+(comicExit||'今天就這一步')+'。'
  ];
}

function renderThreeFramesSection(frames){
  var allText=frames.join('\n');
  return '<div class="three-frames-card">'
    +frames.map(function(f,i){
      return '<div class="frame-item"><span class="frame-no">'+(i+1)+'</span><span class="frame-text">'+escapeHtml(f)+'</span></div>';
    }).join('')
    +'<div class="three-frames-actions">'
    +'<button class="btn-copy" style="width:100%;min-height:var(--tap-min);" data-copy="'+escapeAttr(allText)+'">📋 複製三畫面</button>'
    +'</div></div>';
}

function renderNextStepsGuide(){
  return '<div class="next-steps-card">'
    +'<div class="next-steps-title">🚀 接下來這樣做</div>'
    +'<div class="next-step-item">'
      +'<div class="step-badge">第一步</div>'
      +'<div class="step-body">'
        +'<div class="step-label">🎵 把歌詞貼進 Suno 做歌</div>'
        +'<div class="step-desc">複製上面的「AI 音樂生成 Prompt」→ 開啟 Suno → 貼進 Create 欄位 → 點 Create 生成你的歌</div>'
        +'<a href="https://suno.com" target="_blank" rel="noopener" class="btn-tool-link" onclick="window.logPartnerClick&&window.logPartnerClick(\'suno\',\'https://suno.com\')">開啟 Suno →</a>'
      +'</div>'
    +'</div>'
    +'<div class="next-step-item">'
      +'<div class="step-badge">第二步</div>'
      +'<div class="step-body">'
        +'<div class="step-label">🎬 用 CapCut 做影片（兩種方法）</div>'
        +'<div class="step-desc">'
          +'<strong>方法 A（最快）：</strong>複製「MV 分鏡」→ 開啟 CapCut → 點「AI 文字生成影片」→ 貼上分鏡文字 → 自動生成畫面，再匯入你的 Suno 歌曲<br><br>'
          +'<strong>方法 B（手動）：</strong>分鏡每一行 = 一張圖的指令。把每一行複製給 ChatGPT 或 Midjourney 生成圖片，再把圖片放進 CapCut 按順序排好，加上 Suno 歌曲當背景音樂'
        +'</div>'
        +'<a href="https://www.capcut.com/zh-tw/" target="_blank" rel="noopener" class="btn-tool-link" onclick="window.logPartnerClick&&window.logPartnerClick(\'capcut\',\'https://www.capcut.com/zh-tw/\')">開啟 CapCut →</a>'
      +'</div>'
    +'</div>'
    +'<div class="next-step-item">'
      +'<div class="step-badge">第三步</div>'
      +'<div class="step-body">'
        +'<div class="step-label">🖼 用 AI 生成封面插圖</div>'
        +'<div class="step-desc">複製上面的「繪圖提示」→ 貼給以下任一工具 → 生成你的專屬封面圖</div>'
        +'<div class="tool-link-row">'
          +'<a href="https://gemini.google.com" target="_blank" rel="noopener" class="btn-tool-link" onclick="window.logPartnerClick&&window.logPartnerClick(\'gemini\',\'https://gemini.google.com\')">Gemini →</a>'
          +'<a href="https://chat.openai.com" target="_blank" rel="noopener" class="btn-tool-link" onclick="window.logPartnerClick&&window.logPartnerClick(\'chatgpt\',\'https://chat.openai.com\')">ChatGPT →</a>'
          +'<a href="https://www.midjourney.com" target="_blank" rel="noopener" class="btn-tool-link" onclick="window.logPartnerClick&&window.logPartnerClick(\'midjourney\',\'https://www.midjourney.com\')">Midjourney →</a>'
        +'</div>'
      +'</div>'
    +'</div>'
  +'</div>';
}

/* MV + 圖像指令（Fix 2: 用固定 mv-area 容器覆蓋，不追加） */
function renderMVAndImageArea(songVer){
  logEvent('GENERATE_IMAGE',{title:songVer.title});
  logEvent('GENERATE_VIDEO',{title:songVer.title});
  var prompts=genImageAndMVPrompts(songVer,flow.context);
  var html='<hr style="margin:18px 0; border-color:#E5D6B8;">'
    +'<div class="result-card"><div class="who">🎬 已選定：'+songVer.icon+' '+escapeHtml(songVer.title)+'</div>'
    +'<div class="body-text">副歌 Hook：「'+escapeHtml(songVer.hook)+'」</div></div>';
  ['ratCover','tigerPoster','mvStoryboard','videoPrompt'].forEach(function(key){
    html+='<div class="creative-card"><div class="prompt-box">'+escapeHtml(prompts[key])+'</div>'
      +'<button class="btn-copy mv-copy-btn" style="margin-top:6px;width:100%;" data-copy="'+escapeAttr(prompts[key])+'">📋 複製</button></div>';
  });
  html+=renderNextStepsGuide();
  if(flow.routeB){
    html+='<button class="btn-primary" style="margin-top:12px;" id="btn-go-share">➡ 繼續：製作分享圖卡 📣</button>';
  }
  /* Fix 2：覆蓋固定容器，重複選歌不會累加 MV 區塊 */
  var mvArea=document.getElementById('mv-area');
  if(mvArea){ mvArea.innerHTML=html; }
  else { els.results.innerHTML+=html; }
  Array.prototype.forEach.call(document.querySelectorAll('.mv-copy-btn'),function(btn){
    btn.addEventListener('click',function(){copyToClipboard(btn.dataset.copy);});
  });
  var goShare=document.getElementById('btn-go-share');
  if(goShare) goShare.addEventListener('click',function(){flow.stepIndex=ROUTE_B_ORDER.indexOf('workshop')+1;openMode('share',{routeB:true});saveDraft();});
}

/* ---------------------------------------------------
   分享模式（含 Canvas 圖卡）
--------------------------------------------------- */
function renderShareArea(){
  els.inputArea.innerHTML='';
  var t=genShareCopy(flow.context);
  var intro=flow.context.event?'你的創作素材：「'+shortInput(flow.context.event,18)+'」':'我本來只是想抱怨，結果AI幫我寫成了一段人生劇本。';

  var selectedSong=null;
  if(flow.context.songVersions&&flow.context.selectedSongVersion){
    selectedSong=(flow.context.songVersions||[]).filter(function(v){return v.version===flow.context.selectedSongVersion;})[0]||null;
  }

  var html='<div class="result-card"><div class="who">📣 分享文案</div><div class="body-text">'+escapeHtml(intro)+'</div></div>';
  html+='<div class="share-grid">'+shareCard('LINE 分享',t.line,'line')+shareCard('FB 貼文',t.fb,'fb')+shareCard('IG 文案',t.ig,'ig')+shareCard('Threads 短句',t.threads,'threads')+'</div>';

  /* Canvas 圖卡區 */
  html+='<div class="card-section"><h4>🖼 社群圖卡（免費下載）</h4>';
  html+='<div class="card-type-row">'+['rat','tiger','duo'].map(function(t){return '<button class="btn-card-type chip" data-ctype="'+t+'">'+({rat:'🐭 小天鼠吐槽卡',tiger:'🐯 唬爛虎夢想卡',duo:'🌟 雙角色作品卡'})[t]+'</button>';}).join('')+'</div>';
  html+='<div class="card-size-row">'+[{k:'1080x1080',l:'1:1 方形'},{k:'1080x1350',l:'4:5 直立'},{k:'1080x1920',l:'9:16 限時'}].map(function(s){return '<button class="btn-card-size chip" data-size="'+s.k+'">'+s.l+'</button>';}).join('')+'</div>';
  html+='<div id="card-preview-wrap" style="text-align:center;margin:12px 0;"></div>';
  html+='<div class="card-actions-row"><button class="btn-primary" id="btn-gen-card">產生圖卡 🖼</button></div>';
  html+='<div id="card-download-wrap"></div></div>';

  if(flow.routeB) html+=routeBNextHtml('share');
  els.results.innerHTML=html;

  /* 分享按鈕 */
  Array.prototype.forEach.call(els.results.querySelectorAll('[data-share]'),function(btn){
    btn.addEventListener('click',function(){
      var text=btn.dataset.share;
      if(navigator.share){navigator.share({text:text}).catch(function(){copyToClipboard(text);});}
      else copyToClipboard(text);
      logEvent('SHARE',{platform:btn.dataset.platform});
    });
  });

  /* 圖卡選擇 */
  var selType='rat', selSize='1080x1080';
  Array.prototype.forEach.call(document.querySelectorAll('.btn-card-type'),function(btn){
    btn.addEventListener('click',function(){Array.prototype.forEach.call(document.querySelectorAll('.btn-card-type'),function(b){b.classList.remove('selected');});btn.classList.add('selected');selType=btn.dataset.ctype;});
  });
  Array.prototype.forEach.call(document.querySelectorAll('.btn-card-size'),function(btn){
    btn.addEventListener('click',function(){Array.prototype.forEach.call(document.querySelectorAll('.btn-card-size'),function(b){b.classList.remove('selected');});btn.classList.add('selected');selSize=btn.dataset.size;});
  });
  // 預設選中第一個
  var firstType=document.querySelector('.btn-card-type'); if(firstType) firstType.classList.add('selected');
  var firstSize=document.querySelector('.btn-card-size'); if(firstSize) firstSize.classList.add('selected');

  /* 產生圖卡 */
  document.getElementById('btn-gen-card').addEventListener('click',function(){
    var dims=selSize.split('x');
    var w=parseInt(dims[0]),h=parseInt(dims[1]);
    var canvas=drawSocialCard(selType,w,h,flow.context,selectedSong);
    /* 縮圖預覽 */
    var previewCanvas=document.createElement('canvas');
    var pw=Math.min(w,320),ph=Math.round(h*pw/w);
    previewCanvas.width=pw;previewCanvas.height=ph;
    previewCanvas.getContext('2d').drawImage(canvas,0,0,pw,ph);
    previewCanvas.style.borderRadius='12px';previewCanvas.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)';
    var wrap=document.getElementById('card-preview-wrap');
    wrap.innerHTML=''; wrap.appendChild(previewCanvas);
    /* 下載/分享按鈕 */
    var fname='laugh-mouse-'+(selType)+'-'+selSize+'.png';
    var shareText=t.ig||'笑鼠人了！#笑鼠人了';
    document.getElementById('card-download-wrap').innerHTML='<div class="card-dl-row"><button class="btn-primary btn-dl" id="btn-dl-card">⬇ 下載 PNG</button><button class="btn-copy" id="btn-share-card">📤 分享圖片+文案</button></div>';
    document.getElementById('btn-dl-card').addEventListener('click',function(){downloadCanvas(canvas,fname);});
    document.getElementById('btn-share-card').addEventListener('click',function(){shareCanvas(canvas,shareText);});
    logEvent('GENERATE_CARD',{type:selType,size:selSize});
  });

  /* route-b next */
  var nextBtn=document.getElementById('btn-route-next');
  if(nextBtn) nextBtn.addEventListener('click',function(){flow.stepIndex=ROUTE_B_ORDER.indexOf('share')+1;if(ROUTE_B_ORDER[flow.stepIndex])openMode(ROUTE_B_ORDER[flow.stepIndex],{routeB:true});});
  var finishBtn=document.getElementById('btn-route-finish');
  if(finishBtn) finishBtn.addEventListener('click',function(){toast('創作之旅完成！記得分享出去讓朋友笑一下 🎉');showScreen('home');checkDraftBanner();});
}

function shareCard(label,text,platform){
  return '<div class="share-card"><h5>'+label+'</h5><div>'+escapeHtml(text)+'</div><button class="btn-copy" style="margin-top:8px;width:100%;" data-share="'+escapeAttr(text)+'" data-platform="'+platform+'">分享 / 複製</button></div>';
}

/* ---------------------------------------------------
   10. 導覽
--------------------------------------------------- */
function bindNav(){
  els.back.addEventListener('click',function(){
    if(flow.routeB&&flow.stepIndex>0){
      flow.stepIndex--;
      openMode(ROUTE_B_ORDER[flow.stepIndex],{routeB:true});
    } else {
      showScreen('home');
      checkDraftBanner();
    }
  });
  document.getElementById('btn-route-b').addEventListener('click',function(){
    tryConsumeQuota('journey').then(function(jq){
      if(!jq.ok){showQuotaExhausted('journey',jq.reason);return;}
      logEvent('MODE_SELECT',{mode:'route_b'});
      flow.routeB=true; flow.stepIndex=0;
      openMode(ROUTE_B_ORDER[0],{routeB:true});
    });
  });
  document.getElementById('btn-origin').addEventListener('click',function(){
    document.getElementById('origin-card').classList.toggle('show');
  });
  document.getElementById('btn-gate').addEventListener('click',function(){
    logPartnerClick('wisdom-gate','');
    showScreen('gate');
  });
  document.getElementById('btn-waitlist-join').addEventListener('click',function(){
    var contact=document.getElementById('waitlist-contact').value.trim();
    logEvent('JOIN_WAITLIST',{contact:contact?'provided':'empty'});
    saveRecordToGAS({mode:'waitlist',input:contact});
    toast('已加入候補名單，開放時會優先通知你 🧭');
    document.getElementById('waitlist-contact').value='';
  });
}

function bindThemeVideos(){
  Array.prototype.forEach.call(document.querySelectorAll('.theme-video'),function(v){
    v.addEventListener('play',function(){logEvent('PLAY_THEME_SONG',{character:v.dataset.event});},{once:true});
    var errBox=v.parentNode&&v.parentNode.querySelector('.video-err-box');
    if(!errBox) return;
    v.addEventListener('error',function(){
      v.style.display='none';
      errBox.hidden=false;
      var retryBtn=errBox.querySelector('.btn-video-retry');
      if(retryBtn) retryBtn.addEventListener('click',function(){
        errBox.hidden=true;
        v.style.display='';
        v.load();
      },{once:true});
    });
  });
}

/* ---------------------------------------------------
   Phase 5 嗆聲 V2 接線（只動嗆聲模式）
   橋接：window.RoastEngineV2（roast-engine-v2.js，type=module，異步載入）
   V1 genRoast 保留作 fallback
--------------------------------------------------- */

var ROAST_TARGET_TO_KEY={
  '老闆/主管':'boss','客戶':'client','同事':'coworker','孩子':'child',
  '爸媽/長輩':'parents','兄弟姊妹':'sibling','另一半':'partner',
  '朋友':'friend','其他':'other'
};

function runRoastV2(input,targetLabel,guidedInput){
  if(!window.RoastEngineV2){console.error('[RoastV2] window.RoastEngineV2 未載入');return null;}
  try{
    var loi=guidedInput||targetLabel;
    var r=window.RoastEngineV2.run(input,loi,roastV2State.lastWorld);
    if(!r){console.warn('[RoastV2] run() 回傳 null，input:',input,'label:',loi);return null;}
    roastV2State.lastWorld=r.roast.mouseOutput.comicWorld||null;
    return r;
  }catch(e){console.error('[RoastV2] runRoastV2 例外:',e);return null;}
}

function _v2Section(title,lines){
  var content=lines.filter(Boolean).map(function(l){return escapeHtml(l);}).join('<br>');
  if(!content) return '';
  return '<div style="margin-bottom:1em">'
    +'<div style="font-size:0.72em;font-weight:800;color:#9333ea;letter-spacing:.07em;text-transform:uppercase;margin-bottom:0.35em">'+title+'</div>'
    +'<div style="line-height:1.85">'+content+'</div>'
    +'</div>';
}

function renderRoastV2Block(result,input,targetLabel){
  var m=result.roast.mouseOutput;
  var t=result.roast.tigerOutput;
  var tc='vent tag-rat';

  // 小天鼠：三段式精簡版
  var mBody=[
    _v2Section('嗆聲版',[m.truth,m.analogy]),
    _v2Section('給你好看版',[m.honest,m.boundary]),
    _v2Section('下樓梯版',[m.selfOwn,m.comicExit])
  ].join('');
  var mouseHtml='<div class="result-card '+tc+'"><div class="who">🐭 小天鼠開嗆</div><div class="body-text">'+mBody+'</div></div>';

  // 唬爛虎：預設收起，點 CTA 才展開
  var tBody=[
    _v2Section('吹大版',[t.l1,t.l2]),
    _v2Section('落地版',[t.landing])
  ].join('');
  var tigerContentHtml='<div id="roast-tiger-content" style="display:none"><div class="result-card '+tc+'"><div class="who">🐯 唬爛虎吹大</div><div class="body-text">'+tBody+'</div></div></div>';
  var tigerToggleHtml='<button type="button" id="btn-roast-tiger-toggle" style="width:100%;margin:8px 0;padding:10px;background:#fff7ed;border:1.5px dashed #d89a3e;border-radius:8px;color:#c2650a;font-weight:700;cursor:pointer;font-size:0.95em;">🐯 讓唬爛虎吹大這件事</button>';

  // 補充選項（只在需要時出現）
  var clarifyHtml='';
  if(result.clarifyOpts&&result.clarifyOpts.length>0){
    clarifyHtml=renderRoastClarifyBlock(result.clarifyOpts[0],input,targetLabel);
  }
  return mouseHtml+tigerToggleHtml+tigerContentHtml+clarifyHtml;
}

var _clarifyHeadIdx=0;
var V2_CLARIFY_HEADS=[
  '要嗆準一點？選靶心。',
  '我現在有點泛，給我一個方向。',
  '補一句，我少亂猜一點。'
];
function renderRoastClarifyBlock(opt,input,targetLabel){
  var head=V2_CLARIFY_HEADS[_clarifyHeadIdx%V2_CLARIFY_HEADS.length];
  _clarifyHeadIdx++;
  var preamble='<div class="result-card v2-clarify-block" id="v2-clarify-block">'
    +'<div class="who">🎯 嗆準一點</div>'
    +'<div class="body-text" style="margin-bottom:0.35em;">'+escapeHtml(head)+'</div>'
    +'<div class="body-text" style="font-size:0.88em;color:#888;margin-bottom:0.5em;">'+escapeHtml(opt.prompt)+'</div>';
  if(opt.type==='guided'&&opt.options&&opt.options.length){
    var btnHtml=opt.options.map(function(o){
      return '<button type="button" class="chip v2-clarify-opt" data-sit="'+escapeAttr(o.key)+'" data-inp="'+escapeAttr(input)+'" data-tgt="'+escapeAttr(targetLabel)+'">'+escapeHtml(o.label)+'</button>';
    }).join('');
    return preamble+'<div class="chip-row" style="flex-wrap:wrap;">'+btnHtml+'</div></div>';
  }
  return preamble
    +'<div style="display:flex;gap:0.4em;">'
    +'<input id="v2-clarify-inp" type="text" placeholder="補一句" style="flex:1;padding:0.38em 0.6em;border:1px solid #ddd;border-radius:6px;font-size:0.9em;" data-inp="'+escapeAttr(input)+'" data-tgt="'+escapeAttr(targetLabel)+'">'
    +'<button type="button" class="btn-copy" id="v2-clarify-go">補一刀</button>'
    +'</div></div>';
}

function bindRoastClarifyEvents(){
  Array.prototype.forEach.call(
    els.results.querySelectorAll('.v2-clarify-opt'),
    function(btn){
      btn.addEventListener('click',function(){
        var sitKey=btn.dataset.sit;
        var inp=btn.dataset.inp;
        var tgt=btn.dataset.tgt;
        var gi=window.RoastEngineV2?window.RoastEngineV2.buildGuidedInput(tgt,sitKey):null;
        rerunRoastV2(inp,tgt,gi);
      });
    }
  );
  var ftBtn=document.getElementById('v2-clarify-go');
  if(ftBtn){
    var ftInp=document.getElementById('v2-clarify-inp');
    ftBtn.addEventListener('click',function(){
      var extra=ftInp?ftInp.value.trim():'';
      var inp=ftInp?ftInp.dataset.inp:'';
      var tgt=ftInp?ftInp.dataset.tgt:'其他';
      if(!extra){if(ftInp)ftInp.focus();return;}
      rerunRoastV2(inp+(extra?'；'+extra:''),tgt,null);
    });
  }
}

function rerunRoastV2(input,targetLabel,guidedInput){
  var result=runRoastV2(input,targetLabel,guidedInput);
  if(!result) return;
  var v1d=genRoast(input,targetLabel);
  var m=result.roast.mouseOutput;
  flow.context.event=input;
  flow.context.comicWorld=m.comicWorld||null;
  flow.context.truth=m.truth||'';
  flow.context.analogy=m.analogy||'';
  flow.context.honest=m.honest||'';
  flow.context.boundary=m.boundary||'';
  flow.context.comicExit=m.comicExit||'';
  flow.context.callback=m.callback||'';
  flow.context.targetCategory=result.classification.targetRole||targetLabel;
  flow.context.situationCategory=result.evidence.layerKey||'general';
  flow.context.v1={truth:v1d.truth||'',analogy:v1d.analogy||'',honest:v1d.honest||'',boundary:v1d.boundary||'',comicExit:v1d.comicExit||'',nextAction:v1d.nextAction||''};
  var actionHtml=roastDualActionRowHtml()+(flow.routeB?routeBNextHtml('roast'):'');
  els.results.innerHTML=renderRoastDualBlock(result,v1d,input,targetLabel)+actionHtml;
  bindResultActions('roast');
  saveDraft();
}

function buildAndBindGuidedPanel(panel){
  var re=window.RoastEngineV2;
  if(!re){panel.innerHTML='<div style="color:#aaa;font-size:0.85em;">引導模組載入中，請稍等…</div>';return;}
  var targetLabel=getChipValue('target-chip');
  var targetKey=targetLabel?ROAST_TARGET_TO_KEY[targetLabel]||'other':null;
  var menu=re.GUIDED_MENU;
  if(!targetKey||targetKey==='other'||!menu[targetKey]||!menu[targetKey].situations.length){
    panel.innerHTML='<div style="color:#aaa;font-size:0.85em;">'
      +(targetLabel?'「'+targetLabel+'」直接寫，小天鼠會判斷情境。':'請先選對象，再點「幫我開個頭」。')
      +'</div>';
    return;
  }
  var sits=menu[targetKey].situations;
  var html='<div class="chip-row" id="v2-sit-chips" style="flex-wrap:wrap;">'
    +sits.map(function(s){
      return '<button type="button" class="chip v2-sit-btn" data-key="'+escapeAttr(s.key)+'" data-has-sub="'+(s.subSituations&&s.subSituations.length?'1':'0')+'">'+escapeHtml(s.label)+'</button>';
    }).join('')+'</div>'
    +'<div id="v2-sub-panel"></div>'
    +'<div id="v2-guided-status" style="margin-top:0.4em;font-size:0.83em;color:#777;min-height:1.2em;"></div>';
  panel.innerHTML=html;
  Array.prototype.forEach.call(panel.querySelectorAll('.v2-sit-btn'),function(btn){
    btn.addEventListener('click',function(){
      Array.prototype.forEach.call(panel.querySelectorAll('.v2-sit-btn'),function(b){b.classList.remove('selected');});
      btn.classList.add('selected');
      var sitKey=btn.dataset.key;
      var hasSub=btn.dataset.hasSub==='1';
      var statusEl=panel.querySelector('#v2-guided-status');
      var subPanel=panel.querySelector('#v2-sub-panel');
      subPanel.innerHTML='';
      if(hasSub){
        var sit=null;
        for(var i=0;i<sits.length;i++){if(sits[i].key===sitKey){sit=sits[i];break;}}
        if(!sit||!sit.subSituations){return;}
        var subHtml='<div class="chip-row" style="flex-wrap:wrap;margin-top:0.3em;">'
          +sit.subSituations.map(function(sub){
            return '<button type="button" class="chip v2-subsit-btn" data-parent="'+escapeAttr(sitKey)+'" data-key="'+escapeAttr(sub.key)+'">'+escapeHtml(sub.label)+'</button>';
          }).join('')+'</div>';
        subPanel.innerHTML=subHtml;
        Array.prototype.forEach.call(subPanel.querySelectorAll('.v2-subsit-btn'),function(sbtn){
          sbtn.addEventListener('click',function(){
            Array.prototype.forEach.call(subPanel.querySelectorAll('.v2-subsit-btn'),function(b){b.classList.remove('selected');});
            sbtn.classList.add('selected');
            roastV2State.pendingGuidedInput=re.buildGuidedInput(targetLabel,sitKey,sbtn.dataset.key);
            statusEl.textContent='已選：'+btn.textContent+' → '+sbtn.textContent+' ✓';
          });
        });
      } else {
        roastV2State.pendingGuidedInput=re.buildGuidedInput(targetLabel,sitKey);
        statusEl.textContent='已選：'+btn.textContent+' ✓';
      }
    });
  });
}

/* ---------------------------------------------------
   11. 初始化
--------------------------------------------------- */
document.addEventListener('DOMContentLoaded',function(){
  cacheEls();
  renderModeGrid();
  renderAdvancedTools();
  renderQuotaUI();
  fetchQuotaFromServer();
  checkDraftBanner();
  bindNav();
  bindThemeVideos();
  preloadImages(function(){});
  window._redeemCode=redeemGiftCode;
  window.logPartnerClick=logPartnerClick;
});

})();
