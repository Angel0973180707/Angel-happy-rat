/* =====================================================
   笑鼠人了！ app.js
   單檔前端引擎：模式定義、詞庫、變化引擎、流程控制、
   分享/複製、安全防護、分析事件、GAS 串接。
   ===================================================== */
(function(){
"use strict";

/* ---------------------------------------------------
   0. 基礎工具：使用者 / Session / 本機儲存 / Toast
--------------------------------------------------- */
function randId(prefix){
  return prefix + '_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
}
function getUserId(){
  var id = localStorage.getItem('lsr_user_id');
  if(!id){ id = randId('user'); localStorage.setItem('lsr_user_id', id); }
  return id;
}
function getSessionId(){
  var id = sessionStorage.getItem('lsr_session_id');
  if(!id){ id = randId('session'); sessionStorage.setItem('lsr_session_id', id); }
  return id;
}
var USER_ID = getUserId();
var SESSION_ID = getSessionId();

/* 角色圖像（取代 🐭🐯 emoji，用真實角色插畫） */
var RAT_ICON = '<img src="rat.webp" class="char-icon char-icon-sm" alt="小天鼠">';
var TIGER_ICON = '<img src="tiger.webp" class="char-icon char-icon-sm" alt="唬爛虎">';
var RAT_ICON_MD = '<img src="rat.webp" class="char-icon char-icon-mc" alt="小天鼠">';
var TIGER_ICON_MD = '<img src="tiger.webp" class="char-icon char-icon-mc" alt="唬爛虎">';

function toast(msg){
  var t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function(){ t.classList.remove('show'); }, 1800);
}

/* ---------------------------------------------------
   1. 分析事件 + GAS 串接（皆為 fire-and-forget，失敗不影響使用）
--------------------------------------------------- */
function logEvent(eventType, payload){
  payload = payload || {};
  try{
    if(window.gtag){ window.gtag('event', eventType, payload); }
  }catch(e){}
  try{
    if(window.GAS_API_URL){
      fetch(window.GAS_API_URL, {
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify(Object.assign({
          action:'logEvent',
          time: new Date().toISOString(),
          userId: USER_ID,
          sessionId: SESSION_ID,
          eventType: eventType,
          device: navigator.userAgent
        }, payload))
      }).catch(function(){});
    }
  }catch(e){}
}
function saveRecordToGAS(record){
  try{
    if(window.GAS_API_URL){
      fetch(window.GAS_API_URL, {
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify(Object.assign({
          action:'saveRecord',
          time: new Date().toISOString(),
          userId: USER_ID,
          sessionId: SESSION_ID
        }, record))
      }).catch(function(){});
    }
  }catch(e){}
}
logEvent('APP_OPEN', {});

/* ---------------------------------------------------
   2. 安全防護（十一、安全邊界）
   不是醫療/心理治療判斷，僅做關鍵字溫柔轉向。
--------------------------------------------------- */
var SELF_HARM_WORDS = ['想死','自殺','不想活','活不下去','傷害自己','自殘','結束生命'];
var VIOLENCE_OTHERS_WORDS = ['想殺','殺死','砍他','捅他','放火燒','打死他'];
var MILD_ANGER_WORDS = ['想揍人','想打人','氣到想揍'];

function checkSafety(text){
  text = text || '';
  for(var i=0;i<SELF_HARM_WORDS.length;i++){
    if(text.indexOf(SELF_HARM_WORDS[i]) !== -1){
      return { level:'crisis' };
    }
  }
  for(var j=0;j<VIOLENCE_OTHERS_WORDS.length;j++){
    if(text.indexOf(VIOLENCE_OTHERS_WORDS[j]) !== -1){
      return { level:'violence' };
    }
  }
  return { level:'ok' };
}
function renderCrisisCard(){
  return '<div class="result-card" style="border-left-color:#A23B2E;">'
    + '<div class="who">💛 先停一下</div>'
    + '<div class="body-text">這句話聽起來，你現在可能真的很不好受。\n'
    + '笑鼠人了不是醫療或心理治療工具，沒辦法真正陪你走過這個時刻——但有人可以。\n\n'
    + '台灣安心專線 1925（24 小時、免費）\n'
    + '生命線 1995　張老師專線 1980\n\n'
    + '如果身邊有信任的人，現在也很適合打給他們。你不需要一個人扛著這個。</div>'
    + '</div>';
}
function renderViolenceRedirectCard(){
  return '<div class="result-card tag-rat">'
    + '<div class="who">' + RAT_ICON + ' 小天鼠先攔一下</div>'
    + '<div class="body-text">先不要動手，這個我們不開玩笑。\n'
    + '人不能打，後面真的很麻煩——但空氣很耐打，枕頭也很耐打。\n\n'
    + '先去揍空氣三拳，再回來讓小天鼠幫你把這股火氣翻譯成好笑的版本。</div>'
    + '<div class="quote">「氣可以很大，但手要留給打枕頭。」</div>'
    + '</div>';
}

/* ---------------------------------------------------
   3. 變化引擎：weightedPick + avoidRepeat
--------------------------------------------------- */
function recentKey(bankKey){ return 'lsr_recent_' + bankKey; }
function pickVaried(bankKey, arr){
  if(!arr || !arr.length) return '';
  if(arr.length === 1) return arr[0];
  var recentRaw = sessionStorage.getItem(recentKey(bankKey));
  var recent = recentRaw ? JSON.parse(recentRaw) : [];
  var maxRecent = Math.max(1, Math.floor(arr.length / 2));
  var candidates = arr.map(function(_, i){ return i; }).filter(function(i){ return recent.indexOf(i) === -1; });
  if(!candidates.length) candidates = arr.map(function(_, i){ return i; });
  var idx = candidates[Math.floor(Math.random() * candidates.length)];
  recent.push(idx);
  while(recent.length > maxRecent) recent.shift();
  sessionStorage.setItem(recentKey(bankKey), JSON.stringify(recent));
  return arr[idx];
}
function fill(tpl, vars){
  return tpl.replace(/\{(\w+)\}/g, function(_, k){ return (vars && vars[k] != null) ? vars[k] : ''; });
}
function shortInput(text, len){
  text = (text || '').trim();
  if(!text) return '這件事';
  return text.length > (len||16) ? text.slice(0, len||16) + '…' : text;
}

/* ---------------------------------------------------
   4. 詞庫（02～11：對應 Google Sheets 分頁的內容範本）
   ※ 量足夠啟動 MVP，可依 README 指示擴充
--------------------------------------------------- */
var OPENERS = [
  '先不要急著掙脫，我們先把它翻譯成人話。',
  '深呼吸一下，小天鼠跟唬爛虎都到了。',
  '這件事聽起來不簡單，讓我們先笑一下再說。',
  '先別自責，這只是人生在做效果。',
  '收到，正在啟動翻譯模式……'
];

var RAT_ROAST = [
  '{target}不是在{action}。他是在玩「大家來找碴至尊無限版」，而你剛好是NPC。',
  '你不是反應太大，你是被「{action}」這四個字打到靈魂出竅，正常人都會。',
  '{target}的邏輯是：先讓你崩潰，再說「沒事啊就改一下」。',
  '這不是溝通，這是耐力賽，而你已經默默撐到第N關。',
  '你不是脾氣差，你只是把今天的份額提前花光了。',
  '{target}大概覺得自己很合理，但宇宙不是這樣運作的。'
];
var RAT_BITTER_SOUP = [
  '別難過。你不是沒效率，你只是被需求變更練成了仙。',
  '你不是沒用，你只是今天被生活打到當機，重開機就好。',
  '崩潰不是失敗，是人生在幫你做特效，記得截圖。',
  '你不是太敏感，你只是把別人隨口的話聽得太認真，因為你是個認真的人。',
  '今天累，是因為你一直在硬扛，而硬扛這件事，本身就很厲害了。'
];
var RAT_SELFMOCK = [
  '我不是設計師。我是許願池。{target}丟一句「再調整一下」，我就冒出三個奇蹟。',
  '我不是胖。我是福氣有實體感，只是這個福氣最近有點膨脹。',
  '減肥不是失敗，只是我的嘴巴先獲勝，宵夜0：1毅力。',
  '我不是拖延，我是在等一個「最後一刻才會出現」的神秘靈感，他通常半夜三點到。',
  '我不是沒計畫，我是計畫太多，多到自己都記不住第一條是什麼。'
];
var RAT_BRAIN_TRANSLATE = [
  '你的大腦不是玻璃心，是它發現事情一直失控，所以開始拉警報。',
  '你的大腦現在像手機開太多App，開始發燙，先關幾個分頁吧。',
  '你的情緒不是無理取鬧，是身體在說「我真的撐很久了」。'
];

var TIGER_BRAG = [
  '先不要管現在有幾個人，先想像十年後，大家提到{topic}，第一個想到你。',
  '今天吹牛，明天努力，後天說不定就成真——這不是說謊，這是願景草稿。',
  '夢想如果不夠唬爛，通常也不夠大，先把餅畫大一點。',
  '{topic}這件事，未來回頭看，會發現你今天的猶豫根本不算什麼。',
  '十年後，你不是在做{topic}，你是在帶一群人重新喜歡人生。'
];
var TIGER_PIE = [
  '未來有：12條相關路線。100位夥伴。1000個故事。還有一群人說：還好當年你先唬爛了一下。',
  '想像一下：有一天{topic}做起來了，你會回頭跟自己說「對，就是這個」。',
  '畫大餅版：{topic}不只是你一個人的事，它會變成一群人的依靠。'
];
var TIGER_PARALLEL = [
  '在平行宇宙裡，那個{topic}已經做起來的你，現在正在感謝今天敢吹牛的你。',
  '平行宇宙提醒：每一個成功的{topic}，都從某個人「先唬爛再說」開始。'
];

/* 迷航翻譯庫：情緒/狀態 → 大腦翻譯 */
var LOST_MAP = {
  '羨慕': { brain:'你看到別人抵達目的地，大腦偷偷問：那我呢？', translate:'我也想要', need:['被看見','有成果','有選擇權'], action:'先寫下：我最羨慕的是哪一個部分？', rat:'酸可以，但不要醃到自己。', tiger:'很好，願望已經冒頭了，接下來換你開始唬爛。' },
  '嫉妒': { brain:'你不是討厭他成功，你只是看到「咦，原來這條路有人走到了」。', translate:'我不敢承認我想要', need:['被肯定','有選擇權','被看見'], action:'先寫下：我最羨慕的是哪一個部分？', rat:'酸可以，但不要醃到自己。', tiger:'好消息：嫉妒就是願望的雛形。' },
  '生氣': { brain:'有東西踩到你的底線，大腦立刻拉了警報。', translate:'有東西踩到我的底線', need:['被尊重','有界線'], action:'先寫下：這次到底是哪一條線被踩了？', rat:'先去揍空氣，空氣比較耐打。', tiger:'界線清楚的人，才有資格畫大餅。' },
  '委屈': { brain:'你不是小題大作，是這件事剛好戳到你很在意的地方。', translate:'我其實很在意', need:['被理解','被重視'], action:'先寫下：我希望對方知道的是什麼？', rat:'委屈不用忍，先讓小天鼠幫你翻譯成笑話。', tiger:'在意，代表你還沒放棄期待，這很珍貴。' },
  '焦慮': { brain:'你的大腦現在像手機開太多App，正在拼命幫你預測風險。', translate:'我的大腦正在拼命保護我', need:['安全感','可預測性'], action:'先寫下：我最擔心的最壞結果是什麼？通常沒那麼壞。', rat:'焦慮不是弱，是大腦太認真上班了。', tiger:'會焦慮的人，通常也最容易把事情做好。' },
  '拖延': { brain:'不是你懶，是這個任務在大腦裡看起來太大、太可怕。', translate:'我怕失敗，或任務太大', need:['安全感','小一點的第一步'], action:'先把任務切成一個5分鐘就能做完的小動作。', rat:'拖延的人通常很會想，只是還沒開始動。', tiger:'先做最小的一步，氣勢就會自己跟上來。' },
  '完美主義': { brain:'你不是要求高，你只是很怕丟臉，所以先把標準拉高保護自己。', translate:'我怕丟臉', need:['安全感','被接納的失敗空間'], action:'先允許自己做一個「故意不完美」的版本。', rat:'完美主義是高標準穿著焦慮的外套。', tiger:'先吹個不完美的草稿，比完美的空想值錢多了。' },
  '想放棄': { brain:'你的電量真的低了，這不一定代表你不行，比較像手機需要充電。', translate:'我累了，不一定是我不行', need:['休息','支持'], action:'先休息一天，再決定要不要放棄。', rat:'累的時候做的決定，通常不是真正的決定。', tiger:'休息完再回來，餅還在這裡，沒人會搶走。' }
};
var LOST_FALLBACK = { brain:'你的大腦其實沒那麼討厭你，它只是在用很笨拙的方式保護你。', translate:'我有一個還沒被說出來的需求', need:['被理解','被看見'], action:'先寫下：這個感覺最像哪一種情緒？', rat:'說不清楚也沒關係，小天鼠先陪你坐一下。', tiger:'迷航不是退步，是還在找方向而已。' };

/* 亮點庫：關鍵字 → 亮點/超能力 */
var STRENGTH_MAP = [
  { kw:['健康','養生','養清','料理','食療'], trait:'照顧力', power:'你會把照顧別人的細節做到位，這是很多人學不來的耐心。' },
  { kw:['旅行','旅居','旅遊','帶團'], trait:'探索力', power:'你會把陌生變成有溫度的路線，讓人安心跟著走。' },
  { kw:['故事','寫作','文案','創作'], trait:'表達力', power:'你會把零散的素材說成有畫面的故事。' },
  { kw:['AI','系統','工具','倉管','名片'], trait:'創造力', power:'你會把麻煩的流程變成可以複製的系統。' },
  { kw:['教學','教育','老師','陪伴孩子'], trait:'引導力', power:'你很會把複雜的事拆成別人聽得懂的步驟。' },
  { kw:['孩子','小孩','家庭'], trait:'陪伴力', power:'你會把陪伴這件事做得很細，這份耐心是稀缺資源。' },
  { kw:['品牌','整合','行銷'], trait:'整合力', power:'你會把看似不相關的東西串成一條完整的路。' },
  { kw:['賺錢','創業','生意'], trait:'生存力與企圖心', power:'你不是只想賺錢，你想讓人變好，這份企圖心很值錢。' },
  { kw:['委屈','在意','壓力'], trait:'高敏感與重視關係', power:'你對關係特別敏銳，這份敏感能讓人感覺被理解。' }
];

/* 自導自演劇本庫 */
var DIRECTOR_TEMPLATES = [
  { genre:'溫暖喜劇人生片', titlePattern:'《先吹再說》', antagonist:'不是別人，是腦中那句「我真的可以嗎？」',
    act1:'主角想開始，但一直懷疑自己。', act2:'主角開始唬爛，把夢想的大餅一塊一塊畫出來。', act3:'主角發現原來自己不是亂想，是在打造一條陪人變好的路。',
    ending:'她不是等到準備好才開始，她是開始之後，才慢慢準備好。' },
  { genre:'逆風成長喜劇', titlePattern:'《卡關現場直播》', antagonist:'不是對手，是那句「反正我做不到」的自我預言。',
    act1:'主角被現實打了一巴掌，覺得自己很廢。', act2:'主角開始亂吹牛，意外吹出了一條看起來還不錯的路。', act3:'主角發現自己其實一直都在準備，只是沒人跟他說。',
    ending:'卡關不是結局，是劇情正在轉場而已。' },
  { genre:'熱血翻身紀錄片', titlePattern:'《今天先唬爛，明天再努力》', antagonist:'不是市場，是心裡那個怕丟臉的小聲音。',
    act1:'主角什麼都沒做，光是想就先累了。', act2:'主角決定先說出夢想，再說會不會成功。', act3:'主角發現自己一邊吹牛一邊真的在動手了。',
    ending:'你不是路人甲，你是自己人生的導演。' }
];

/* 金句庫：依比例抽類別（30%吐槽/30%自嘲/20%唬爛/10%廢話哲學/10%溫暖收尾），
   再在類別內避免重複。語氣要求：精簡、口語、不要文謅謅。 */
var QUOTE_BANK = {
  roast: {
    weight: 30,
    lines: [
      '「再小改一下」＝重做。',
      '他講得輕鬆，因為做的人不是他。',
      '同一句話打三次，誰受得了。',
      '他不是在溝通，他是在甩鍋。',
      '你不是反應大，是真的被惹到了。',
      '說隨口說說的，通常最不隨口。',
      '崩潰不是失敗，是人生在做效果。'
    ]
  },
  selfmock: {
    weight: 30,
    lines: [
      '不是拖延，是在等十一點五十九分那股爆發力。',
      '減肥輸給宵夜，不是意志力，是真的香。',
      '計畫超多，多到忘記第一條，超有實力。',
      '我不是廢，我是把廢發揮到很有效率。',
      '我不是沒用，只是今天當機了而已。',
      '我不是亂，我是素材太多，需要一個鍋子。',
      '我不是沒方向，我是方向太多在排隊。'
    ]
  },
  bigdream: {
    weight: 20,
    lines: [
      '先吹再說，做出來再讓他們驚訝。',
      '餅先畫大，路自己會冒出來。',
      '夢想不夠唬爛，通常也不夠大。',
      '今天吹牛，明天努力，後天說不定就成真。',
      '先讓自己敢講，再讓自己敢做。'
    ]
  },
  nonsense: {
    weight: 10,
    lines: [
      '鹽酥雞胖不胖不重要，醬料對不對才重要。',
      '魚不知道自己在水裡，你大概也不知道自己很拚了。',
      '太陽明天還是會升起，跟你今天有沒有報告沒關係。',
      '人生跟夜市一樣，重點不是攤位，是順路。'
    ]
  },
  warm: {
    weight: 10,
    lines: [
      '輕一點就好，不用馬上變好。',
      '撐過來這件事，本身就值得鼓掌。',
      '笑完了，該面對的事還在，但你現在輕一點了。',
      '你不需要全部都想清楚，先往前一步就好。'
    ]
  }
};
function pickGoldenQuote(){
  var keys = Object.keys(QUOTE_BANK);
  var total = keys.reduce(function(s,k){ return s + QUOTE_BANK[k].weight; }, 0);
  var r = Math.random() * total;
  var acc = 0, chosenKey = keys[keys.length-1];
  for(var i=0;i<keys.length;i++){
    acc += QUOTE_BANK[keys[i]].weight;
    if(r <= acc){ chosenKey = keys[i]; break; }
  }
  return pickVaried('quote_' + chosenKey, QUOTE_BANK[chosenKey].lines);
}

/* 歌詞片語庫（依結構拼接，避免每次一樣） */
var SONG_OPENERS = ['今天又被', '原來這條路', '心裡那句話', '誰說一定要', '我一直以為'];
var SONG_HOOKS = ['笑著扛下去', '吹大這個夢', '先唬爛再努力', '把崩潰寫成歌', '把委屈變成光'];
var SONG_CLOSERS = ['這就是我的故事', '這就是我的劇本', '這一段才剛開始', '我還在繼續寫'];

/* 繪圖提示風格庫 */
var IMG_STYLES = ['溫暖手繪插畫風', '電影感寫實風', '療癒水彩風', '復古海報風', '黑金電影海報風'];
var IMG_COLORS = ['金黃與暖橘漸層', '深咖啡與米白對比', '夜市霓虹暖光', '清晨金光'];

/* 分鏡鏡頭庫 */
var SHOT_TYPES = ['遠景，建立場景氛圍', '特寫，主角表情', '中景，主角行動', '空拍，象徵轉折', '慢動作，情緒高點'];

/* 分享文案模板 */
var SHARE_TEMPLATES = {
  line: '今天被生活氣到差點原地升天，結果小天鼠幫我翻譯完，我笑出來了。原來我不是崩潰，是人生正在做效果。',
  fb: '本來只是想抱怨一下，結果這個AI幫我把人生寫成了一段故事，連我自己都笑了。#笑鼠人了',
  ig: '把崩潰交給小天鼠，把夢想交給唬爛虎。#笑鼠人了 #人生創作工廠',
  threads: '原來我不是廢，我只是還沒打燈。'
};

/* 情境分類：依輸入文字裡的關鍵字，挑更相關的吐槽/自嘲內容，而不是純隨機 */
var ROAST_CATEGORIES = {
  work: {
    keywords:['老闆','主管','加班','改稿','客戶','同事','上班','專案','報告','會議','開會','下班','工作','廠商','業績'],
    lines:[
      '工作不是看誰比較會做事，是看誰比較會甩鍋，你顯然還沒練到那一關。',
      '「再小改一下」翻成人話就是：重做一次，但語氣裝得很輕鬆。',
      '會議開三小時，結論是「我們再討論一次」，你的人生正在被消耗成 PPT。',
      '不是你效率差，是需求一直在動，你只是個一直在追的人。'
    ]
  },
  family: {
    keywords:['媽','爸','婆婆','公公','小孩','孩子','家人','老公','老婆','另一半','岳母','岳父'],
    lines:[
      '家人講話比較直，是因為他們知道你不會真的翻臉，於是就放心地一直戳。',
      '他不是不關心你，他是用「碎念」這個很奇怪的方式在表達。',
      '家裡的帳，永遠算不清楚是因為大家用的都是「感情換算法」。'
    ]
  },
  money: {
    keywords:['錢','薪水','帳單','房租','貸款','存款','花費','收入','負債'],
    lines:[
      '錢包扁的時候，連呼吸都覺得在花成本。',
      '不是你不會理財，是支出每次都比計畫早到一步。',
      '存錢這件事，你的決心很強，意外開銷的決心更強。'
    ]
  }
};
var SELFMOCK_CATEGORIES = {
  diet: {
    keywords:['減肥','宵夜','運動','吃','胖','體重','健身','飲食'],
    lines:[
      '我不是胖，我是把福氣存得比較均勻。',
      '運動計畫排得很滿，滿到都沒時間真的去運動。',
      '減肥輸給宵夜，不是意志力問題，是宵夜真的太香。'
    ]
  },
  procrastinate: {
    keywords:['拖延','deadline','截止','還沒做','來不及','明天再說','懶得'],
    lines:[
      '不是拖延，是在等十一點五十九分那股爆發力。',
      '我的待辦清單很長，長到連「開始」都還排在後面。',
      '我不是沒計畫，我是計畫太多，多到忘記第一條是什麼。'
    ]
  },
  money_self: {
    keywords:['亂花錢','剩多少','又買了','購物','刷卡'],
    lines:[
      '錢包瘦得很均勻，跟我的決心一樣。',
      '我不是亂花錢，我是在做「未來會後悔」的市場調查。'
    ]
  }
};
function pickCategoryLine(categories, input, fallbackArr, bankKey){
  var keys = Object.keys(categories);
  for(var i=0;i<keys.length;i++){
    var cat = categories[keys[i]];
    if(cat.keywords.some(function(k){ return input.indexOf(k) !== -1; })){
      return pickVaried(bankKey + '_' + keys[i], cat.lines);
    }
  }
  return pickVaried(bankKey, fallbackArr);
}

/* 迷航模式：若使用者沒點選情緒 chip，從輸入文字關鍵字自動偵測最接近的情緒 */
var LOST_SYNONYMS = {
  '羨慕':['羨慕','想要他那樣','希望我也'],
  '嫉妒':['嫉妒','吃醋','看不順眼他成功'],
  '生氣':['生氣','氣死','火大','不爽','怒'],
  '委屈':['委屈','心裡苦','很受傷','不被理解'],
  '焦慮':['焦慮','緊張','不安','慌','睡不著'],
  '拖延':['拖延','懶得做','一直沒做','拖到最後','deadline'],
  '完美主義':['完美','怕做不好','怕丟臉','要求很高'],
  '想放棄':['想放棄','撐不下去','不想做了','累了']
};
function detectEmotion(input){
  var keys = Object.keys(LOST_SYNONYMS);
  for(var i=0;i<keys.length;i++){
    if(LOST_SYNONYMS[keys[i]].some(function(s){ return input.indexOf(s) !== -1; })){
      return keys[i];
    }
  }
  return null;
}

/* ---------------------------------------------------
   5. 模式定義（首頁八大入口）
--------------------------------------------------- */
var MODES = [
  { id:'roast', icon:'😤', title:'嗆聲模式', desc:'我現在很想罵，但我想罵得有才華。', role:'rat' },
  { id:'selfmock', icon:'🤣', title:'自嘲模式', desc:'笑自己一下，人生就沒那麼尷尬。', role:'rat' },
  { id:'bigdream', icon:TIGER_ICON_MD, title:'畫大餅模式', desc:'先吹出來，搞不好就開始了。', role:'tiger' },
  { id:'lost', icon:'🧭', title:'迷航模式', desc:'我不知道自己怎麼了。', role:'lost' },
  { id:'strength', icon:'💎', title:'我的亮點', desc:'你不是沒有光，只是還沒打燈。', role:'shine' },
  { id:'director', icon:'🎬', title:'自導自演', desc:'把這段人生寫成一部電影。', role:'director' },
  { id:'workshop', icon:'🎤', title:'創作工坊', desc:'把故事寫成歌，畫成圖，做成影片。', role:'workshop' },
  { id:'share', icon:'📣', title:'分享模式', desc:'一鍵產生社群文案，讓朋友一起笑。', role:'share' }
];
var ROUTE_B_ORDER = ['roast','bigdream','lost','strength','director','workshop','share'];

/* ---------------------------------------------------
   6. 各模式生成器
--------------------------------------------------- */
function genRoast(input, target){
  target = target || '對方';
  var summary = '你不是單純生氣，你是被「' + shortInput(input) + '」打到靈魂出竅。';
  var brain = pickVaried('rat_brain', RAT_BRAIN_TRANSLATE);
  var roastLine = pickCategoryLine(ROAST_CATEGORIES, input, RAT_ROAST.map(function(t){ return fill(t, { target:target, action: shortInput(input,12) }); }), 'rat_roast');
  var bitter = pickVaried('rat_bitter', RAT_BITTER_SOUP);
  var selfmock = fill(pickVaried('rat_selfmock', RAT_SELFMOCK), { target:target });
  var quote = pickGoldenQuote();
  return {
    role:'rat', tagClass:'vent tag-rat',
    blocks:[
      ['🧠 情緒摘要', summary],
      [RAT_ICON + ' 大腦翻譯', brain],
      [RAT_ICON + ' 小天鼠吐槽', roastLine],
      ['😤 嗆聲版', roastLine],
      ['🍵 毒雞湯版', bitter],
      ['🤣 自嘲補刀版', selfmock]
    ],
    quote: quote
  };
}
function genSelfmock(input){
  var summary = '你不是真的很糟，你只是把「' + shortInput(input) + '」這件事看得太認真了。';
  var translate = pickVaried('rat_brain', RAT_BRAIN_TRANSLATE);
  var bit = pickCategoryLine(SELFMOCK_CATEGORIES, input, RAT_SELFMOCK.map(function(t){ return fill(t, { target:'生活' }); }), 'rat_selfmock');
  var quote = pickGoldenQuote();
  return {
    role:'rat', tagClass:'vent tag-rat',
    blocks:[
      ['🧠 自嘲摘要', summary],
      [RAT_ICON + ' 小天鼠翻譯', translate],
      ['🤣 自嘲段子', bit],
      ['📣 社群分享句', SHARE_TEMPLATES.threads]
    ],
    quote: quote
  };
}
function genBigDream(input, topic){
  topic = topic || shortInput(input, 14);
  var translate = fill(pickVaried('tiger_brag', TIGER_BRAG), { topic:topic });
  var pie = fill(pickVaried('tiger_pie', TIGER_PIE), { topic:topic });
  var parallel = fill(pickVaried('tiger_parallel', TIGER_PARALLEL), { topic:topic });
  var quote = pickGoldenQuote();
  return {
    role:'tiger', tagClass:'tag-tiger',
    blocks:[
      [TIGER_ICON + ' 唬爛虎翻譯', translate],
      [TIGER_ICON + ' 吹牛版', translate],
      ['🥞 畫大餅版', pie],
      ['🌌 平行宇宙版', parallel]
    ],
    quote: quote
  };
}
function genLost(input, emotionKey){
  var entry = LOST_MAP[emotionKey] || LOST_FALLBACK;
  return {
    role:'lost', tagClass:'tag-lost',
    blocks:[
      ['🧭 迷航摘要', '你輸入的是：「' + shortInput(input, 24) + '」'],
      ['🧠 大腦偷偷話', entry.brain],
      ['🔁 情緒翻譯', (emotionKey||'這個感覺') + ' 翻譯成人話就是：' + entry.translate],
      ['💡 真正需求', entry.need.join('、')],
      ['👣 下一步小行動', entry.action],
      [RAT_ICON + ' 小天鼠補一句', entry.rat],
      [TIGER_ICON + ' 唬爛虎補一句', entry.tiger]
    ],
    quote: entry.translate
  };
}
function genStrength(input){
  var lower = input || '';
  var matched = STRENGTH_MAP.filter(function(item){
    return item.kw.some(function(k){ return lower.indexOf(k) !== -1; });
  });
  if(!matched.length){
    matched = [STRENGTH_MAP[Math.floor(Math.random()*STRENGTH_MAP.length)]];
  }
  var traits = matched.slice(0,3);
  var keywordList = traits.map(function(t){ return t.trait; }).join('、');
  var powerLine = traits.map(function(t){ return t.power; }).join('\n');
  return {
    role:'shine', tagClass:'tag-shine',
    blocks:[
      ['🔑 我聽見的關鍵字', shortInput(input, 30)],
      ['💎 可能亮點', keywordList],
      ['⚡ 你的超能力', powerLine],
      ['🧩 適合你的創作方向', traits.map(function(t){return t.trait;}).join(' x ') + ' 的內容創作或服務']
    ],
    quote: '你不是沒有光，只是還沒打燈。'
  };
}
function genDirector(input, context){
  var tpl = pickVaried('director', DIRECTOR_TEMPLATES);
  var subject = shortInput(context && context.topic ? context.topic : input, 16);
  return {
    role:'director', cinema:true,
    title: tpl.titlePattern,
    genre: tpl.genre,
    antagonist: tpl.antagonist,
    act1: tpl.act1.replace('主角', '你') ,
    act2: '你開始唬爛「' + subject + '」，' + tpl.act2.replace(/^主角/, ''),
    act3: tpl.act3.replace(/^主角/, '你'),
    ending: tpl.ending
  };
}
function genSong(context, length){
  length = length || 'standard';
  var lineCount = length === 'quick' ? 6 : (length === 'full' ? 20 : 12);
  var subject = shortInput(context && context.topic ? context.topic : '這段故事', 14);
  var lines = [];
  lines.push(pickVaried('song_open', SONG_OPENERS) + subject + '打到');
  lines.push('小天鼠先笑一笑，唬爛虎先吹一吹');
  lines.push(pickVaried('song_hook', SONG_HOOKS));
  lines.push('我不是輸了，我只是還沒贏而已');
  if(lineCount > 8){
    lines.push('委屈不用忍，先讓它變成一句詞');
    lines.push('夢想不嫌大，先吹出來再上路');
  }
  if(lineCount > 14){
    lines.push('第一幕卡關，第二幕轉場');
    lines.push('這不是崩潰，是劇情在鋪陳');
  }
  lines.push(pickVaried('song_close', SONG_CLOSERS));
  return {
    title: '《' + subject + '：' + (length==='quick'?'快速版':length==='full'?'完整版':'標準版') + '》',
    lengthLabel: length === 'quick' ? '15–20秒' : (length === 'full' ? '90秒' : '45–60秒'),
    lines: lines
  };
}
function genImagePrompt(context){
  var subject = shortInput(context && context.topic ? context.topic : '一個正在重新喜歡人生的人', 20);
  var style = pickVaried('img_style', IMG_STYLES);
  var color = pickVaried('img_color', IMG_COLORS);
  return style + '、' + color + '。畫面主角：' + subject + '，神情從疲憊轉為帶著希望的微笑。背景帶有溫暖光線與一點電影感留白，整體氛圍：療癒、幽默、不悲情。';
}
function genStoryboard(context, length){
  var subject = shortInput(context && context.topic ? context.topic : '主角', 14);
  var shotCount = length === 'quick' ? 2 : (length === 'full' ? 6 : 4);
  var shots = [];
  for(var i=0;i<shotCount;i++){
    shots.push({ no:i+1, shot: pickVaried('shot', SHOT_TYPES), body: subject + (i===0?' 站在卡關的現場':(i===shotCount-1?' 露出笑容，準備往下一步走':' 開始為自己的願景行動')) });
  }
  return shots;
}
function genShareCopy(context){
  return SHARE_TEMPLATES;
}

/* ---------------------------------------------------
   7. 畫面渲染
--------------------------------------------------- */
var els = {};
function cacheEls(){
  els.home = document.getElementById('screen-home');
  els.mode = document.getElementById('screen-mode');
  els.gate = document.getElementById('screen-gate');
  els.modeGrid = document.getElementById('mode-grid');
  els.back = document.getElementById('btn-back');
  els.modeIcon = document.getElementById('mode-icon');
  els.modeTitle = document.getElementById('mode-title');
  els.modeSub = document.getElementById('mode-sub');
  els.inputArea = document.getElementById('mode-input-area');
  els.generateBtn = document.getElementById('btn-generate');
  els.results = document.getElementById('mode-results');
  els.progress = document.getElementById('progress-strip');
}

function showScreen(name){
  ['home','mode','gate'].forEach(function(k){
    document.getElementById('screen-' + k).classList.toggle('active', k === name);
  });
  els.back.style.display = (name === 'home') ? 'none' : 'flex';
  window.scrollTo(0,0);
}

function renderModeGrid(){
  els.modeGrid.innerHTML = MODES.map(function(m){
    return '<button class="mode-card" data-mode="' + m.id + '">'
      + '<span class="icon">' + m.icon + '</span>'
      + '<span class="title">' + m.title + '</span>'
      + '<span class="desc">' + m.desc + '</span>'
      + '</button>';
  }).join('');
  Array.prototype.forEach.call(els.modeGrid.querySelectorAll('.mode-card'), function(btn){
    btn.addEventListener('click', function(){
      logEvent('MODE_SELECT', { mode: btn.dataset.mode });
      openMode(btn.dataset.mode, { routeB:false });
    });
  });
}

/* flow state */
var flow = { routeB:false, stepIndex:0, input:'', context:{} };

function modeMeta(id){ return MODES.filter(function(m){ return m.id === id; })[0]; }

function renderProgress(){
  if(!flow.routeB){ els.progress.style.display = 'none'; return; }
  els.progress.style.display = 'flex';
  els.progress.innerHTML = ROUTE_B_ORDER.map(function(id, i){
    var cls = i < flow.stepIndex ? 'done' : (i === flow.stepIndex ? 'current' : '');
    return '<span class="' + cls + '"></span>';
  }).join('');
}

function openMode(id, opts){
  opts = opts || {};
  flow.routeB = !!opts.routeB;
  if(!flow.routeB){ flow.stepIndex = ROUTE_B_ORDER.indexOf(id); if(flow.stepIndex < 0) flow.stepIndex = 0; }
  var meta = modeMeta(id);
  els.modeIcon.innerHTML = meta.icon;
  els.modeTitle.textContent = meta.title;
  els.modeSub.textContent = meta.desc;
  els.results.innerHTML = '';
  renderProgress();
  renderInputArea(id);
  els.generateBtn.style.display = (id === 'workshop' || id === 'share') ? 'none' : 'block';
  els.generateBtn.onclick = function(){ runGenerate(id); };
  showScreen('mode');
  if(id === 'workshop'){ renderWorkshopArea(); }
  if(id === 'share'){ renderShareArea(); }
}

function renderInputArea(id){
  var sharedInput = '<div class="field-block"><label for="main-input">想說的話 / 事件</label>'
    + '<textarea id="main-input" placeholder="例如：客戶今天又改稿第18次…">' + (flow.input||'') + '</textarea></div>';

  if(id === 'roast'){
    els.inputArea.innerHTML = sharedInput
      + chipBlock('target-chip', '對象', ['老闆','客戶','同事','家人','自己','陌生人']);
  } else if(id === 'selfmock'){
    els.inputArea.innerHTML = sharedInput;
  } else if(id === 'bigdream'){
    els.inputArea.innerHTML = sharedInput
      + chipBlock('topic-chip', '主題', ['財富','健康','事業','旅行','品牌','影響力']);
  } else if(id === 'lost'){
    els.inputArea.innerHTML = sharedInput
      + chipBlock('emotion-chip', '最接近的感覺', Object.keys(LOST_MAP));
  } else if(id === 'strength'){
    els.inputArea.innerHTML = sharedInput;
  } else if(id === 'director'){
    els.inputArea.innerHTML = sharedInput;
  } else {
    els.inputArea.innerHTML = sharedInput;
  }
  bindChips();
}
function chipBlock(name, label, options){
  return '<div class="field-block"><label>' + label + '</label><div class="chip-row" data-chip-group="' + name + '">'
    + options.map(function(o){ return '<button type="button" class="chip" data-value="' + o + '">' + o + '</button>'; }).join('')
    + '</div></div>';
}
function bindChips(){
  Array.prototype.forEach.call(els.inputArea.querySelectorAll('.chip-row'), function(group){
    Array.prototype.forEach.call(group.querySelectorAll('.chip'), function(chip){
      chip.addEventListener('click', function(){
        Array.prototype.forEach.call(group.querySelectorAll('.chip'), function(c){ c.classList.remove('selected'); });
        chip.classList.add('selected');
      });
    });
  });
}
function getChipValue(name){
  var group = els.inputArea.querySelector('[data-chip-group="' + name + '"]');
  if(!group) return null;
  var sel = group.querySelector('.chip.selected');
  return sel ? sel.dataset.value : null;
}

function runGenerate(id){
  var inputEl = document.getElementById('main-input');
  var input = inputEl ? inputEl.value.trim() : '';
  flow.input = input;

  if(!input){
    if(inputEl){
      inputEl.classList.add('input-error');
      inputEl.focus();
      inputEl.addEventListener('input', function onType(){
        inputEl.classList.remove('input-error');
        inputEl.removeEventListener('input', onType);
      });
    }
    toast('先打幾個字告訴小天鼠發生什麼事 🐭');
    return;
  }

  var safety = checkSafety(input);
  if(safety.level === 'crisis'){
    els.results.innerHTML = renderCrisisCard();
    logEvent('GENERATE', { mode:id, safety:'crisis' });
    return;
  }
  if(safety.level === 'violence' && (id === 'roast')){
    els.results.innerHTML = renderViolenceRedirectCard();
    logEvent('GENERATE', { mode:id, safety:'violence' });
    return;
  }

  var data, html = '';
  if(id === 'roast'){
    data = genRoast(input, getChipValue('target-chip'));
    html = renderTextBlocks(data);
  } else if(id === 'selfmock'){
    data = genSelfmock(input);
    html = renderTextBlocks(data);
  } else if(id === 'bigdream'){
    data = genBigDream(input, getChipValue('topic-chip'));
    flow.context.topic = getChipValue('topic-chip') || shortInput(input, 14);
    html = renderTextBlocks(data);
  } else if(id === 'lost'){
    var emo = getChipValue('emotion-chip') || detectEmotion(input);
    data = genLost(input, emo);
    html = renderTextBlocks(data);
  } else if(id === 'strength'){
    data = genStrength(input);
    html = renderTextBlocks(data);
  } else if(id === 'director'){
    data = genDirector(input, flow.context);
    flow.context.topic = flow.context.topic || shortInput(input, 16);
    html = renderCinemaTicket(data);
  }

  els.results.innerHTML = html + actionRowHtml(id) + (flow.routeB ? routeBNextHtml(id) : '');
  bindResultActions(id, data);

  logEvent('GENERATE', { mode:id });
  saveRecordToGAS({ mode:id, input: input, summary: JSON.stringify(data).slice(0,500) });
}

function renderTextBlocks(data){
  var tagClass = data.tagClass || '';
  var blocksHtml = data.blocks.map(function(b){
    return '<div class="result-card ' + tagClass + '"><div class="who">' + b[0] + '</div><div class="body-text">' + escapeHtml(b[1]) + '</div></div>';
  }).join('');
  var quoteHtml = data.quote ? '<div class="result-card ' + tagClass + '"><div class="who">✨ 笑鼠金句</div><div class="quote">「' + escapeHtml(data.quote) + '」</div></div>' : '';
  return blocksHtml + quoteHtml;
}
function renderCinemaTicket(d){
  return '<div class="cinema-wrap"><div class="cinema-ticket">'
    + '<div class="film-genre">' + escapeHtml(d.genre) + '</div>'
    + '<div class="film-title">' + escapeHtml(d.title) + '</div>'
    + '<div class="act"><div class="label">最大反派</div><div class="content">' + escapeHtml(d.antagonist) + '</div></div>'
    + '<div class="act"><div class="label">第一幕</div><div class="content">' + escapeHtml(d.act1) + '</div></div>'
    + '<div class="act"><div class="label">第二幕</div><div class="content">' + escapeHtml(d.act2) + '</div></div>'
    + '<div class="act"><div class="label">第三幕</div><div class="content">' + escapeHtml(d.act3) + '</div></div>'
    + '<div class="ending">「' + escapeHtml(d.ending) + '」</div>'
    + '</div></div>';
}
function escapeHtml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function actionRowHtml(){
  return '<div class="action-row"><button class="btn-copy" id="btn-copy-result">📋 複製</button><button class="btn-regen" id="btn-regen-result">🎲 再來一版</button></div>';
}
function routeBNextHtml(currentId){
  var idx = ROUTE_B_ORDER.indexOf(currentId);
  var isLast = idx === ROUTE_B_ORDER.length - 1;
  if(isLast) return '<button class="btn-primary" id="btn-route-finish">完成創作之旅 🎉</button>';
  var nextId = ROUTE_B_ORDER[idx+1];
  var nextMeta = modeMeta(nextId);
  return '<button class="btn-primary" id="btn-route-next">繼續到下一步：' + nextMeta.icon + ' ' + nextMeta.title + '</button>';
}
function bindResultActions(id, data){
  var copyBtn = document.getElementById('btn-copy-result');
  if(copyBtn){
    copyBtn.addEventListener('click', function(){
      var text = els.results.innerText;
      copyToClipboard(text);
      logEvent('COPY', { mode:id });
    });
  }
  var regenBtn = document.getElementById('btn-regen-result');
  if(regenBtn){
    regenBtn.addEventListener('click', function(){
      logEvent('REGENERATE', { mode:id });
      runGenerate(id);
    });
  }
  var nextBtn = document.getElementById('btn-route-next');
  if(nextBtn){
    nextBtn.addEventListener('click', function(){
      flow.stepIndex = ROUTE_B_ORDER.indexOf(id) + 1;
      var nextId = ROUTE_B_ORDER[flow.stepIndex];
      openMode(nextId, { routeB:true });
    });
  }
  var finishBtn = document.getElementById('btn-route-finish');
  if(finishBtn){
    finishBtn.addEventListener('click', function(){
      toast('創作之旅完成！記得分享出去讓朋友笑一下 🎉');
      showScreen('home');
      flow = { routeB:false, stepIndex:0, input:'', context:{} };
    });
  }
}
function copyToClipboard(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ toast('已複製，貼去哪裡都可以 ✅'); }).catch(function(){ toast('複製失敗，請手動選取文字'); });
  } else {
    toast('此瀏覽器不支援自動複製，請手動選取文字');
  }
}

/* ---------------- 創作工坊畫面 ---------------- */
function renderWorkshopArea(){
  els.inputArea.innerHTML = '<div class="field-block"><label>想創作的主題（可留空，會延用前面內容）</label>'
    + '<textarea id="main-input" placeholder="例如：先吹再說的幸福旅居">' + (flow.context.topic||flow.input||'') + '</textarea></div>'
    + chipBlock('length-chip', '長度模式', ['快速版','標準版','完整版']);
  bindChips();
  els.results.innerHTML = '<button class="btn-primary" id="btn-workshop-go">產生歌曲＋繪圖提示＋分鏡 🎬</button>';
  document.getElementById('btn-workshop-go').addEventListener('click', function(){
    var inputEl = document.getElementById('main-input');
    var topic = inputEl ? inputEl.value.trim() : '';
    if(topic) flow.context.topic = topic;
    var lengthLabel = getChipValue('length-chip') || '標準版';
    var lenKey = lengthLabel === '快速版' ? 'quick' : (lengthLabel === '完整版' ? 'full' : 'standard');

    var song = genSong(flow.context, lenKey);
    var imgPrompt = genImagePrompt(flow.context);
    var shots = genStoryboard(flow.context, lenKey);

    var html = '<div class="creative-card"><h4>🎤 ' + escapeHtml(song.title) + '（' + song.lengthLabel + '）</h4>'
      + song.lines.map(function(l){ return '<div class="lyric-line">' + escapeHtml(l) + '</div>'; }).join('') + '</div>';
    html += '<div class="creative-card"><h4>🎨 AI 繪圖提示</h4><div class="prompt-box">' + escapeHtml(imgPrompt) + '</div></div>';
    html += '<div class="creative-card"><h4>🎬 MV 分鏡</h4>' + shots.map(function(s){
      return '<div class="storyboard-shot"><div class="shot-no">' + s.no + '</div><div><div class="shot-body">' + escapeHtml(s.body) + '</div><div class="shot-meta">' + escapeHtml(s.shot) + '</div></div></div>';
    }).join('') + '</div>';
    html += actionRowHtml() + (flow.routeB ? routeBNextHtml('workshop') : '');

    els.results.innerHTML = html;
    bindResultActions('workshop');
    logEvent('GENERATE_SONG', {});
    logEvent('GENERATE_IMAGE', {});
    logEvent('GENERATE_VIDEO', {});
    saveRecordToGAS({ mode:'workshop', input: flow.context.topic||'', summary: song.title });
  });
}

/* ---------------- 分享畫面 ---------------- */
function renderShareArea(){
  els.inputArea.innerHTML = '';
  var t = SHARE_TEMPLATES;
  var html = '<div class="result-card"><div class="who">📣 一句吸睛標題</div><div class="body-text">我本來只是想抱怨，結果AI幫我寫成了一段人生劇本。</div></div>';
  html += '<div class="share-grid">'
    + shareCard('LINE 分享', t.line, 'line')
    + shareCard('FB 貼文', t.fb, 'fb')
    + shareCard('IG 文案', t.ig, 'ig')
    + shareCard('Threads 短句', t.threads, 'threads')
    + '</div>';
  if(flow.routeB) html += routeBNextHtml('share');
  els.results.innerHTML = html;
  Array.prototype.forEach.call(els.results.querySelectorAll('[data-share]'), function(btn){
    btn.addEventListener('click', function(){
      var text = btn.dataset.share;
      if(navigator.share){
        navigator.share({ text:text }).catch(function(){ copyToClipboard(text); });
      } else {
        copyToClipboard(text);
      }
      logEvent('SHARE', { platform: btn.dataset.platform });
    });
  });
  bindResultActions('share');
}
function shareCard(label, text, platform){
  return '<div class="share-card"><h5>' + label + '</h5><div>' + escapeHtml(text) + '</div>'
    + '<button class="btn-copy" style="margin-top:8px;width:100%;" data-share="' + escapeHtml(text) + '" data-platform="' + platform + '">分享 / 複製</button></div>';
}

/* ---------------------------------------------------
   8. 導覽事件綁定
--------------------------------------------------- */
function bindNav(){
  els.back.addEventListener('click', function(){
    showScreen('home');
    flow = { routeB:false, stepIndex:0, input:'', context:{} };
  });
  document.getElementById('btn-route-b').addEventListener('click', function(){
    logEvent('MODE_SELECT', { mode:'route_b' });
    logEvent('ENTER_WORKSHOP', {});
    flow.stepIndex = 0;
    openMode(ROUTE_B_ORDER[0], { routeB:true });
  });
  document.getElementById('btn-origin').addEventListener('click', function(){
    document.getElementById('origin-card').classList.toggle('show');
  });
  document.getElementById('btn-gate').addEventListener('click', function(){
    showScreen('gate');
  });
  document.getElementById('btn-waitlist-join').addEventListener('click', function(){
    var contact = document.getElementById('waitlist-contact').value.trim();
    logEvent('JOIN_WAITLIST', { contact: contact ? 'provided' : 'empty' });
    saveRecordToGAS({ mode:'waitlist', input: contact });
    toast('已加入候補名單，開放時會優先通知你 🧭');
    document.getElementById('waitlist-contact').value = '';
  });
}

function bindThemeVideos(){
  Array.prototype.forEach.call(document.querySelectorAll('.theme-video'), function(v){
    v.addEventListener('play', function(){
      logEvent('PLAY_THEME_SONG', { character: v.dataset.event });
    }, { once:true });
  });
}

/* ---------------------------------------------------
   9. 初始化
--------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function(){
  cacheEls();
  renderModeGrid();
  bindNav();
  bindThemeVideos();
});

})();
