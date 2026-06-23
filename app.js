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
logEvent('APP_OPEN',{});

/* ---------------------------------------------------
   1b. 額度系統（localStorage 柔性限制）
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
function quotaTypeForMode(id){return id==='workshop'?'workshop':'quick';}
function tryConsumeQuota(type){
  initQuota();
  var state=getQuotaState();
  if(type==='workshop'&&state.workshop<=0&&state.bonus>0){
    localStorage.setItem('quota_bonus',String(state.bonus-1));
    renderQuotaBadges();
    callGASQuota('consumeQuota',{userId:USER_ID,quotaType:type});
    return {ok:true,source:'bonus',remaining:state.bonus-1};
  }
  if(state[type]<=0) return {ok:false,type:type};
  var key='quota_'+type;
  localStorage.setItem(key,String(parseInt(localStorage.getItem(key)||'0',10)+1));
  renderQuotaBadges();
  callGASQuota('consumeQuota',{userId:USER_ID,quotaType:type});
  return {ok:true,source:'daily',remaining:state[type]-1};
}
function callGASQuota(action,data){
  if(!window.GAS_API_URL) return;
  fetch(window.GAS_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action:action},data))})
    .then(function(r){return r.json();}).then(function(res){
      if(res&&typeof res.bonus==='number') localStorage.setItem('quota_bonus',String(res.bonus));
      if(res&&res.bonusBalance!=null) localStorage.setItem('quota_bonus',String(res.bonusBalance));
      if(res&&res.planType) localStorage.setItem('quota_plan',res.planType);
      renderQuotaBadges();
    }).catch(function(){});
}
function showQuotaExhausted(type){
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
function redeemGiftCode(code){
  if(!code){toast('請輸入兌換碼');return;}
  if(!window.GAS_API_URL){toast('系統未就緒，請稍後再試');return;}
  toast('兌換中…');
  fetch(window.GAS_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'redeemCode',code:code.trim().toUpperCase(),userId:USER_ID})})
    .then(function(r){return r.json();}).then(function(res){
      if(res&&res.ok){
        toast(res.message||'兌換成功！');
        if(typeof res.bonusBalance==='number') localStorage.setItem('quota_bonus',String(res.bonusBalance));
        if(res.planType) localStorage.setItem('quota_plan',res.planType);
        renderQuotaBadges();
        var box=document.getElementById('redeem-input');
        if(box) box.value='';
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

/* ---------------------------------------------------
   2. 安全防護
--------------------------------------------------- */
var SELF_HARM_WORDS=['想死','自殺','不想活','活不下去','傷害自己','自殘','結束生命'];
var VIOLENCE_OTHERS_WORDS=['想殺','殺死','砍他','捅他','放火燒','打死他'];
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

/* ---------------------------------------------------
   3. 變化引擎
--------------------------------------------------- */
function recentKey(k){ return 'lsr_recent_'+k; }
function pickVaried(bankKey,arr){
  if(!arr||!arr.length) return '';
  if(arr.length===1) return arr[0];
  var raw=sessionStorage.getItem(recentKey(bankKey));
  var recent=raw?JSON.parse(raw):[];
  var max=Math.max(1,Math.floor(arr.length/2));
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
var RAT_ROAST=[
  '{target}不是在{action}。他是在玩「大家來找碴至尊無限版」，而你剛好是NPC。',
  '你不是反應太大，你是被「{action}」這四個字打到靈魂出竅，正常人都會。',
  '{target}的邏輯是：先讓你崩潰，再說「沒事啊就改一下」。',
  '這不是溝通，這是耐力賽，而你已經默默撐到第N關。',
  '你不是脾氣差，你只是把今天的份額提前花光了。',
  '{target}大概覺得自己很合理，但宇宙不是這樣運作的。'
];
/* 嗆聲專屬詞庫（對對方說話，不混入自嘲） */
var ROAST_TRUTH=[
  '你做了沒被看見，還被說沒做到。',
  '你的時間和努力被當作理所當然。',
  '你被用力說話，但從來沒有被好好聽。',
  '對方用音量代替了道理。',
  '你的界線被踩了，對方完全沒意識到。',
  '被要求完美，但從沒被感謝過。',
  '事情沒做好，情緒卻全加在你身上。'
];
var ROAST_SPEAK_TO=[
  '{target}，你說「再改一下」，好，我想知道你的「一下」是幾個工作天？因為我的「一下」快要變成「下輩子」了。',
  '{target}，你每次說話的方式讓我學到一件事：有一種壓力，不需要解釋理由，只需要音量夠大。',
  '{target}，你的邏輯很有特色：對你有利的叫規定，對你不利的叫例外，我研究了一下，確實自洽。',
  '{target}，你說「就這樣而已」——對，對你來說是這樣；對做的人來說，那是我整個下午。',
  '{target}，你知道什麼叫做許願池嗎？就是你每說一句「再小改一下」，池子裡就少一點水，而你從來不看水位。',
  '你把「破口大罵」當管理工具用，我研究了一下，這個工具的說明書上沒有寫「讓人想繼續做好」。',
  '{target}，你講話的方式有個特點：讓人完全聽不清楚方向，但又完全感受得到壓力，這個技術含量其實很高。'
];
var ROAST_SNAP=[
  '你說「隨便」，我做了；你說「不對」，我改了；你說「就這樣」，我才知道你從頭就不知道自己要什麼。',
  '{target}的決策速度和退稿速度成反比，是一種很特殊的才能。',
  '我消化完你的情緒，誰來消化我的？我問了一下，沒有人。',
  '一句「這很簡單」，從來都是說這句話的人最簡單。',
  '你把我當許願池，池子也有底——我只是還沒讓你看見。',
  '{target}，你的「馬上」和我的「馬上」，我懷疑是兩個不同的時區。',
  '改稿第N版，我的身體還在桌前，靈魂已經先去辦離職手續了。'
];
var ROAST_BOUNDARY=[
  '你說什麼我可以不同意，但這個語氣，是我今天唯一想要你改的東西。',
  '事情可以繼續討論，但先讓我把剛剛那句話還給你——你說的話比你要求的事更難處理。',
  '我可以接受不完美的結果，但我沒辦法接受被當作理所當然的努力。',
  '下次再說「就這樣而已」之前，先來做一次，讓我看看你的「而已」要花多久。',
  '我沒有在生氣，我只是把笑容暫時寄存起來，等這件事說清楚了再拿回來。',
  '這件事的問題我來解決，但你說話的方式，我需要你也當成一個問題來解決。',
  '我繼續做，你繼續說——但我希望你記得，繼續做的那個人是我，不是你的語氣。'
];
var RAT_BITTER_SOUP=[
  '別難過。你不是沒效率，你只是被需求變更練成了仙。',
  '你不是沒用，你只是今天被生活打到當機，重開機就好。',
  '崩潰不是失敗，是人生在幫你做特效，記得截圖。',
  '你不是太敏感，你只是把別人隨口的話聽得太認真，因為你是個認真的人。',
  '今天累，是因為你一直在硬扛，而硬扛這件事，本身就很厲害了。'
];
/* RAT_SELFMOCK 通用情境 fallback：必須帶入 {event}，不可含飲食／體重／購物等特定題材 */
var RAT_SELFMOCK=[
  '關於「{event}」，我的表面很平靜，腦內已經重剪了五個版本。',
  '「{event}」發生的時候，我表面點頭，靈魂已經坐電梯去透氣了。',
  '我不是把「{event}」看得太嚴重，我只是把每個細節都拍成了腦內紀錄片。',
  '我不是沒出力，只是力氣花在「{event}」上，別人通常注意不到那個地方。',
  '不是我太敏感，是「{event}」這件事剛好戳到我一個藏很深的地方。'
];
var RAT_BRAIN_TRANSLATE=[
  '你的大腦不是玻璃心，是它發現事情一直失控，所以開始拉警報。',
  '你的大腦現在像手機開太多App，開始發燙，先關幾個分頁吧。',
  '你的情緒不是無理取鬧，是身體在說「我真的撐很久了」。'
];
var TIGER_BRAG=[
  '先不要管現在有幾個人，先想像十年後，大家提到{topic}，第一個想到你。',
  '今天吹牛，明天努力，後天說不定就成真——這不是說謊，這是願景草稿。',
  '夢想如果不夠唬爛，通常也不夠大，先把餅畫大一點。',
  '{topic}這件事，未來回頭看，會發現你今天的猶豫根本不算什麼。',
  '十年後，你不是在做{topic}，你是在帶一群人重新喜歡人生。'
];
var TIGER_PIE=[
  '未來有：12條相關路線。100位夥伴。1000個故事。還有一群人說：還好當年你先唬爛了一下。',
  '想像一下：有一天{topic}做起來了，你會回頭跟自己說「對，就是這個」。',
  '畫大餅版：{topic}不只是你一個人的事，它會變成一群人的依靠。'
];
var TIGER_PARALLEL=[
  '在平行宇宙裡，那個{topic}已經做起來的你，現在正在感謝今天敢吹牛的你。',
  '平行宇宙提醒：每一個成功的{topic}，都從某個人「先唬爛再說」開始。'
];
var TIGER_WISH=[
  '你說的「{topic}」翻譯成人話就是：你準備好讓這件事變真的了。',
  '你輸入「{topic}」這幾個字，唬爛虎解讀為：我想要，而且我認真的。',
  '把「{topic}」這個想法翻出來，代表你已經跨過最難的那步——承認你想要。'
];

var LOST_MAP={
  '羨慕':{brain:'你看到別人抵達目的地，大腦可能偷偷問：那我呢？',translate:'我也想要',need:['被看見','有成果','有選擇權'],action:'先寫下：我最羨慕的是哪一個部分？',rat:'酸可以，但不要醃到自己。',tiger:'很好，願望已經冒頭了，接下來換你開始唬爛。'},
  '嫉妒':{brain:'你不一定是討厭他成功，也許只是看到「原來這條路有人走到了」。',translate:'我不敢承認我想要',need:['被肯定','有選擇權','被看見'],action:'先寫下：我最羨慕的是哪一個部分？',rat:'酸可以，但不要醃到自己。',tiger:'好消息：嫉妒可能就是願望的雛形。'},
  '生氣':{brain:'有東西可能踩到你的底線，大腦拉了警報。',translate:'有東西踩到我的底線',need:['被尊重','有界線'],action:'先寫下：這次到底是哪一條線被踩了？',rat:'先去揍空氣，空氣比較耐打。',tiger:'界線清楚的人，才有資格畫大餅。'},
  '委屈':{brain:'你不是小題大作，可能是這件事剛好戳到你很在意的地方。',translate:'我其實很在意',need:['被理解','被重視'],action:'先寫下：我希望對方知道的是什麼？',rat:'委屈不用忍，先讓小天鼠幫你翻譯成笑話。',tiger:'在意，代表你還沒放棄期待，這很珍貴。'},
  '焦慮':{brain:'你的大腦現在像手機開太多App，可能在幫你預測風險。',translate:'我的大腦正在拼命保護我',need:['安全感','可預測性'],action:'先寫下：我最擔心的最壞結果是什麼？有時候寫出來會發現沒那麼大。',rat:'焦慮不是弱，是大腦太認真上班了。',tiger:'對細節敏感的人，往往也很謹慎——這是一種能力。'},
  '拖延':{brain:'也許不是你懶，是這個任務在大腦裡看起來太大、太模糊。',translate:'我可能怕失敗，或任務太大',need:['安全感','小一點的第一步'],action:'先把任務切成一個5分鐘就能做完的小動作。',rat:'拖延的人通常很會想，只是還沒開始動。',tiger:'先做最小的一步，氣勢有時候就會自己跟上來。'},
  '完美主義':{brain:'你不一定是要求高，可能只是擔心被看見失敗的那一面。',translate:'我可能擔心做出來被否定',need:['安全感','被接納的失敗空間'],action:'先允許自己做一個「故意不完美」的版本。',rat:'完美主義是高標準穿著焦慮的外套。',tiger:'先吹個不完美的草稿，比完美的空想值錢多了。'},
  '想放棄':{brain:'你的電量可能真的低了，這不一定代表你不行，比較像手機需要充電。',translate:'我累了，不一定是我不行',need:['休息','支持'],action:'先休息一天，再決定要不要放棄。',rat:'累的時候做的決定，通常不是最真實的決定。',tiger:'休息完再回來，餅還在這裡，沒人會搶走。'}
};
var LOST_FALLBACK={brain:'你的大腦其實沒那麼討厭你，它只是在用很笨拙的方式保護你。',translate:'我有一個還沒被說出來的需求',need:['被理解','被看見'],action:'先寫下：這個感覺最像哪一種情緒？',rat:'說不清楚也沒關係，小天鼠先陪你坐一下。',tiger:'迷航不是退步，是還在找方向而已。'};

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
  work:{keywords:['老闆','主管','加班','改稿','客戶','同事','上班','專案','報告','會議','開會','工作','廠商','業績'],lines:['工作不是看誰比較會做事，是看誰比較會甩鍋，你顯然還沒練到那一關。','「再小改一下」翻成人話就是：重做一次，但語氣裝得很輕鬆。','會議開三小時，結論是「我們再討論一次」，你的人生正在被消耗成 PPT。','不是你效率差，是需求一直在動，你只是個一直在追的人。']},
  family:{keywords:['媽','爸','婆婆','公公','小孩','孩子','家人','老公','老婆','另一半'],lines:['家人講話比較直，是因為他們知道你不會真的翻臉，於是就放心地一直戳。','他不是不關心你，他是用「碎念」這個很奇怪的方式在表達。','家裡的帳，永遠算不清楚是因為大家用的都是「感情換算法」。']},
  money:{keywords:['錢','薪水','帳單','房租','貸款','存款','花費','收入','負債'],lines:['錢包扁的時候，連呼吸都覺得在花成本。','不是你不會理財，是支出每次都比計畫早到一步。','存錢這件事，你的決心很強，意外開銷的決心更強。']}
};
var SELFMOCK_CATEGORIES={
  work:{keywords:['老闆','主管','客戶','同事','被罵','挨罵','破口大罵','工作','開會','改稿','上班','報告','廠商'],lines:[
    '老闆罵完，我表面點頭，腦內已經開了三場離職記者會。',
    '我不是沒反應，是靈魂先去樓下避難，身體留下來說「好的」。',
    '客戶改第N次，我已經默默在腦內蓋了一棟廢稿博物館。',
    '開完這個會，我需要三杯水、兩塊餅乾，和一個隔音艙。',
    '我沒有崩潰，靈魂只是去停車場透個氣，身體繼續上班。'
  ]},
  diet:{keywords:['減肥','宵夜','吃','胖','體重','健身','卡路里','節食'],lines:[
    '我不是胖，我是把福氣存得比較均勻。',
    '運動計畫排得很滿，滿到都沒時間真的去運動。',
    '減肥輸給宵夜，不是意志力問題，是宵夜真的太香。',
    '我不是沒毅力，只是遇到了非常強勁的對手。'
  ]},
  procrastinate:{keywords:['拖延','deadline','截止','還沒做','來不及','明天再說','懶得'],lines:[
    '不是拖延，是在等十一點五十九分那股爆發力。',
    '我的待辦清單很長，長到連「開始」都還排在後面。',
    '我不是沒計畫，是計畫太多，多到忘記第一條是什麼。',
    '截止日前一小時，我的效率是平常的七倍，這是天賦。'
  ]},
  money_self:{keywords:['亂花錢','又買了','購物','刷卡'],lines:[
    '錢包瘦得很均勻，跟我的決心一樣。',
    '我不是亂花錢，我是在做「未來會後悔」的市場調查。'
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

var LOST_SYNONYMS={'羨慕':['羨慕','想要他那樣'],'嫉妒':['嫉妒','吃醋'],'生氣':['生氣','氣死','火大','不爽','怒'],'委屈':['委屈','很受傷','不被理解'],'焦慮':['焦慮','緊張','不安','慌','睡不著'],'拖延':['拖延','懶得做','deadline'],'完美主義':['完美','怕做不好','怕丟臉'],'想放棄':['想放棄','撐不下去','不想做了','累了']};
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
  '被接納的失敗空間':'我想允許自己先做出來，不完美也沒關係',
  '小一點的第一步':'我想找到一個五分鐘就能開始的小動作，先動起來再說',
  '休息':'我想先充個電，然後帶著更清醒的頭腦繼續',
  '支持':'我想找到至少一個人，讓我說說看這段時間有多不容易'
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
  {id:'lost',   icon:'🧭',title:'迷航模式',  desc:'我不知道自己怎麼了。',role:'lost'},
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
  return {event:'',emotion:'',translation:'',need:'',wish:'',traits:[],filmTitle:'',story:{},songVersions:[],selectedSongVersion:'',imagePrompts:[],storyboard:[],shareCopy:{},shareCard:null,lastQuote:'',topic:''};
}
var flow={routeB:false,stepIndex:0,input:'',context:emptyContext()};

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
  target=target||'對方';
  var summary='你不是單純生氣，你是被「'+shortInput(input)+'」打到靈魂出竅。';
  var truth=pickVaried('roast_truth',ROAST_TRUTH);
  var speakTo=fill(pickVaried('roast_speak',ROAST_SPEAK_TO),{target:target});
  var snap=fill(pickVaried('roast_snap',ROAST_SNAP),{target:target});
  var boundary=pickVaried('roast_boundary',ROAST_BOUNDARY);
  return {role:'rat',tagClass:'vent tag-rat',blocks:[
    ['🧠 情緒摘要',summary],
    ['🔥 你真正氣的是',truth],
    [RAT_ICON+' 小天鼠替你講',speakTo],
    ['😤 有梗放話版',snap],
    ['🧱 有底線版',boundary]
  ],quote:pickGoldenQuote('roast')};
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
  topic=topic||shortInput(input,14);
  var wishLine=fill(pickVaried('tiger_wish',TIGER_WISH),{topic:topic});
  var bragLine=fill(pickVaried('tiger_brag',TIGER_BRAG),{topic:topic});
  var pie=fill(pickVaried('tiger_pie',TIGER_PIE),{topic:topic});
  var parallel=fill(pickVaried('tiger_parallel',TIGER_PARALLEL),{topic:topic});
  return {role:'tiger',tagClass:'tag-tiger',blocks:[[TIGER_ICON+' 唬爛虎翻譯',wishLine],[TIGER_ICON+' 吹牛版',bragLine],['🥞 畫大餅版',pie],['🌌 平行宇宙版',parallel]],quote:pickGoldenQuote('bigdream')};
}
function genLost(input,emotionKey){
  var entry=LOST_MAP[emotionKey]||LOST_FALLBACK;
  return {role:'lost',tagClass:'tag-lost',need:entry.need,translation:entry.translate,blocks:[['🧭 迷航摘要','你輸入的是：「'+shortInput(input,24)+'」'],['🧠 大腦偷偷話',entry.brain],['🔁 情緒翻譯',(emotionKey||'這個感覺')+' 翻譯成人話就是：'+entry.translate],['💡 真正需求',entry.need.join('、')],['👣 下一步小行動',entry.action],[RAT_ICON+' 小天鼠補一句',entry.rat],[TIGER_ICON+' 唬爛虎補一句',entry.tiger]],quote:pickGoldenQuote('lost')};
}
function genStrength(input){
  var lower=input||'';
  var matched=STRENGTH_MAP.filter(function(item){return item.kw.some(function(k){return lower.indexOf(k)!==-1;});});
  if(!matched.length) matched=[NEUTRAL_TRAITS[Math.floor(Math.random()*NEUTRAL_TRAITS.length)]];
  var traits=matched.slice(0,3);
  var keywordList=traits.map(function(t){return t.trait;}).join('、');
  var powerLine=traits.map(function(t){return t.power;}).join('\n');
  return {role:'shine',tagClass:'tag-shine',traits:traits.map(function(t){return t.trait;}),blocks:[['🔑 我聽見的關鍵字',shortInput(input,30)],['💎 可能亮點',keywordList],['⚡ 你的超能力',powerLine],['🧩 適合你的創作方向',traits.map(function(t){return t.trait;}).join(' x ')+' 的內容創作或服務']],quote:pickGoldenQuote('strength')};
}
function genDirector(input,context){
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
  var chars=text.split(''), line='', lines=[];
  for(var i=0;i<chars.length;i++){
    var test=line+chars[i];
    if(ctx.measureText(test).width>maxWidth&&line.length){lines.push(line);line=chars[i];}else line=test;
  }
  lines.push(line);
  var startY=y-(lines.length-1)*lineHeight/2;
  lines.forEach(function(l,i){ctx.fillText(l,x,startY+i*lineHeight);});
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
  renderProgress();
  renderInputArea(id,opts);
  els.generateBtn.style.display=(id==='workshop'||id==='share')?'none':'block';
  els.generateBtn.onclick=function(){runGenerate(id);};
  showScreen('mode');
  if(id==='workshop') renderWorkshopArea();
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
    els.inputArea.innerHTML=sharedInput+chipBlock('target-chip','對象',['老闆','客戶','同事','家人','另一半','陌生人']);
  } else if(id==='bigdream'){
    els.inputArea.innerHTML=sharedInput+chipBlock('topic-chip','主題',['財富','健康','事業','旅行','品牌','影響力']);
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

/* 主生成邏輯 */
function runGenerate(id){
  var inputEl=document.getElementById('main-input');
  var input=inputEl?inputEl.value.trim():'';
  flow.input=input;

  if(!input&&id!=='share'&&id!=='workshop'){
    if(inputEl){inputEl.classList.add('input-error');inputEl.focus();inputEl.addEventListener('input',function onT(){inputEl.classList.remove('input-error');inputEl.removeEventListener('input',onT);});}
    toast('先打幾個字告訴小天鼠發生什麼事 🐭'); return;
  }

  /* 額度檢查（safety guard 通過後才扣） */
  var qType=quotaTypeForMode(id);
  var qResult=tryConsumeQuota(qType);
  if(!qResult.ok){showQuotaExhausted(qType);return;}
  /* 工坊最後一次提示 */
  if(qType==='workshop'&&qResult.remaining===0) toast('已使用今日最後一次免費工坊額度 🎨');

  var safety=checkSafety(input);
  if(safety.level==='crisis'){els.results.innerHTML=renderCrisisCard();logEvent('GENERATE',{mode:id,safety:'crisis'});return;}
  if(safety.level==='violence'){els.results.innerHTML=renderViolenceRedirectCard();logEvent('GENERATE',{mode:id,safety:'violence'});return;}
  if(safety.level==='mild'){els.results.innerHTML=renderMildAngerCard(id)+renderOutputFor(id,input);bindResultActions(id);return;}

  els.results.innerHTML=renderOutputFor(id,input);
  bindResultActions(id);
  logEvent('GENERATE',{mode:id});
  saveRecordToGAS({mode:id,input:input,summary:JSON.stringify(flow.context).slice(0,300)});
  saveDraft();
}

function renderOutputFor(id,input){
  var data, html='';
  if(id==='roast'){
    data=genRoast(input,getChipValue('target-chip'));
    flow.context.event=input;
    html=renderTextBlocks(data);
  } else if(id==='selfmock'){
    data=genSelfmock(input);
    flow.context.event=flow.context.event||input;
    html=renderTextBlocks(data);
  } else if(id==='bigdream'){
    /* 使用者在輸入框確認或修改的願望草稿 */
    var wish=input||needToWish(flow.context.need)||flow.context.wish||flow.context.topic||'';
    data=genBigDream(wish,getChipValue('topic-chip'));
    flow.context.topic=getChipValue('topic-chip')||shortInput(wish,14);
    flow.context.wish=wish;
    html=renderTextBlocks(data);
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
  var actionHtml=actionRowHtml()
    +(isQuick?'<button class="btn-primary btn-make-work" id="btn-make-work" style="margin-top:10px;">🎬 把這件事變成作品</button>':'')
    +(flow.routeB?routeBNextHtml(id):'');
  return html+actionHtml;
}

function bindResultActions(id){
  /* 複製（只複製內容文字，不含按鈕） */
  var copyBtn=document.getElementById('btn-copy-result');
  if(copyBtn){
    copyBtn.addEventListener('click',function(){
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
  if(regenBtn){ regenBtn.addEventListener('click',function(){logEvent('REGENERATE',{mode:id}); els.results.innerHTML=renderOutputFor(id,flow.input); bindResultActions(id); saveDraft();}); }
  /* 下一步 */
  var nextBtn=document.getElementById('btn-route-next');
  if(nextBtn){ nextBtn.addEventListener('click',function(){flow.stepIndex=ROUTE_B_ORDER.indexOf(id)+1; openMode(ROUTE_B_ORDER[flow.stepIndex],{routeB:true}); saveDraft();}); }
  /* 完成 */
  var finishBtn=document.getElementById('btn-route-finish');
  if(finishBtn){ finishBtn.addEventListener('click',function(){ toast('創作之旅完成！記得分享出去讓朋友笑一下 🎉'); showScreen('home'); checkDraftBanner(); }); }
  /* 把這件事變成作品 */
  var makeWorkBtn=document.getElementById('btn-make-work');
  if(makeWorkBtn){ makeWorkBtn.addEventListener('click',function(){ flow.routeB=true; flow.stepIndex=0; openMode(ROUTE_B_ORDER[0],{routeB:true}); }); }
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
function routeBNextHtml(currentId){
  var idx=ROUTE_B_ORDER.indexOf(currentId);
  var isLast=idx===ROUTE_B_ORDER.length-1;
  if(isLast) return '<button class="btn-primary" id="btn-route-finish" style="margin-top:10px;">完成創作之旅 🎉</button>';
  var nextMeta=modeMeta(ROUTE_B_ORDER[idx+1]);
  return '<button class="btn-primary" id="btn-route-next" style="margin-top:10px;">繼續下一步：'+nextMeta.icon+' '+nextMeta.title+'</button>';
}
function copyToClipboard(text){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){toast('已複製，貼去哪裡都可以 ✅');}).catch(function(){toast('複製失敗，請手動選取文字');});
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
  var inputEl=document.getElementById('main-input');
  var extra=inputEl?inputEl.value.trim():'';
  if(extra) flow.context.topic=flow.context.topic||extra;
  flow.context.wish=flow.context.wish||flow.context.topic||extra;
  /* Fix 1：讀取作品風格 chip，存入 context 供生成器使用 */
  var styleHint=getChipValue('style-chip')||'';
  flow.context.styleHint=styleHint;

  var vA=genSongVersionA(flow.context);
  var vB=genSongVersionB(flow.context);
  flow.context.songVersions=[vA,vB];

  /* Fix 2：加固定 mv-area 容器，重複選歌只覆蓋不追加 */
  var html=renderSongVersionCard(vA)+renderSongVersionCard(vB);
  html+='<div class="workshop-actions"><button class="btn-regen btn-workshop-regen" id="btn-workshop-regen">🔄 免費再生成兩版</button></div>';
  html+='<div id="mv-area"></div>';

  els.results.innerHTML=html;

  document.getElementById('btn-workshop-regen').addEventListener('click',runWorkshop);

  bindWorkshopSelect();
  logEvent('GENERATE_SONG',{styleHint:styleHint});
  saveDraft();
}

function renderSongVersionCard(v){
  return '<div class="song-card" data-version="'+v.version+'">'
    +'<div class="song-card-head"><span class="song-icon">'+v.icon+'</span><span class="song-label">'+v.label+'</span><span class="song-style">'+v.style+'</span></div>'
    +'<div class="song-title">'+escapeHtml(v.title)+'</div>'
    +'<div class="song-concept">'+escapeHtml(v.concept)+'</div>'
    +'<pre class="song-lyrics">'+escapeHtml(v.lyrics)+'</pre>'
    +'<div class="song-meta"><span>🎵 '+escapeHtml(v.genre)+'</span><span>⏱ '+escapeHtml(v.bpm)+'</span></div>'
    +'<div class="song-meta-ext">🎭 情緒：'+escapeHtml(v.mood)+'</div>'
    +'<div class="song-meta-ext">🎸 編曲：'+escapeHtml(v.instruments)+'</div>'
    +'<div class="song-meta-ext">🎤 演唱方式：'+escapeHtml(v.vocal)+'</div>'
    +'<div class="song-ai-prompt"><strong>AI 音樂生成 Prompt：</strong><div class="prompt-box">'+escapeHtml(v.aiPrompt)+'</div></div>'
    +'<div class="song-card-actions">'
    +'<button class="btn-copy btn-copy-song" data-copy="'+escapeAttr(v.title+'\n'+v.lyrics+'\n\n情緒：'+v.mood+'\n編曲：'+v.instruments+'\n演唱：'+v.vocal+'\n\nAI Prompt: '+v.aiPrompt)+'">📋 複製'+v.icon+'指令</button>'
    +'<button class="btn-primary btn-select-song" data-version="'+v.version+'" style="flex:1;">✅ 選擇此版本製作 MV</button>'
    +'</div></div>';
}

function bindWorkshopSelect(){
  Array.prototype.forEach.call(document.querySelectorAll('.btn-copy-song'),function(btn){
    btn.addEventListener('click',function(){copyToClipboard(btn.dataset.copy);});
  });
  Array.prototype.forEach.call(document.querySelectorAll('.btn-select-song'),function(btn){
    btn.addEventListener('click',function(){
      var ver=btn.dataset.version;
      var chosen=(flow.context.songVersions||[]).filter(function(v){return v.version===ver;})[0];
      if(!chosen) return;
      flow.context.selectedSongVersion=ver;
      saveDraft();
      renderMVAndImageArea(chosen);
    });
  });
}

function renderNextStepsGuide(){
  return '<div class="next-steps-card">'
    +'<div class="next-steps-title">🚀 接下來這樣做</div>'
    +'<div class="next-step-item">'
      +'<div class="step-badge">第一步</div>'
      +'<div class="step-body">'
        +'<div class="step-label">🎵 把歌詞貼進 Suno 做歌</div>'
        +'<div class="step-desc">複製上面的「AI 音樂生成 Prompt」→ 開啟 Suno → 貼進 Create 欄位 → 點 Create 生成你的歌</div>'
        +'<a href="https://suno.com" target="_blank" rel="noopener" class="btn-tool-link">開啟 Suno →</a>'
      +'</div>'
    +'</div>'
    +'<div class="next-step-item">'
      +'<div class="step-badge">第二步</div>'
      +'<div class="step-body">'
        +'<div class="step-label">🎬 用剪映 / CapCut 做影片</div>'
        +'<div class="step-desc">下載 Suno 生成的歌 → 開啟剪映或 CapCut → 把上面「MV 分鏡」當腳本，配上你的歌和照片</div>'
        +'<a href="https://www.capcut.com/zh-tw/" target="_blank" rel="noopener" class="btn-tool-link">開啟 CapCut →</a>'
      +'</div>'
    +'</div>'
    +'<div class="next-step-item">'
      +'<div class="step-badge">第三步</div>'
      +'<div class="step-body">'
        +'<div class="step-label">🖼 用 ChatGPT 生成封面插圖</div>'
        +'<div class="step-desc">複製上面的「繪圖提示」→ 貼給 ChatGPT（或 Midjourney）→ 生成你的專屬封面圖</div>'
        +'<a href="https://chat.openai.com" target="_blank" rel="noopener" class="btn-tool-link">開啟 ChatGPT →</a>'
      +'</div>'
    +'</div>'
  +'</div>';
}

/* MV + 圖像指令（Fix 2: 用固定 mv-area 容器覆蓋，不追加） */
function renderMVAndImageArea(songVer){
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
    var jq=tryConsumeQuota('journey');
    if(!jq.ok){showQuotaExhausted('journey');return;}
    logEvent('MODE_SELECT',{mode:'route_b'});
    flow.routeB=true; flow.stepIndex=0;
    openMode(ROUTE_B_ORDER[0],{routeB:true});
  });
  document.getElementById('btn-origin').addEventListener('click',function(){
    document.getElementById('origin-card').classList.toggle('show');
  });
  document.getElementById('btn-gate').addEventListener('click',function(){showScreen('gate');});
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
   11. 初始化
--------------------------------------------------- */
document.addEventListener('DOMContentLoaded',function(){
  cacheEls();
  renderModeGrid();
  renderAdvancedTools();
  renderQuotaUI();
  checkDraftBanner();
  bindNav();
  bindThemeVideos();
  preloadImages(function(){});
  window._redeemCode=redeemGiftCode;
});

})();
