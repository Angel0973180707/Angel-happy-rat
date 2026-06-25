/**
 * character-generator-v1.js — Phase 3 角色生成器 v1.2
 *
 * 純函式 ES Module。無 DOM 依賴。不接 app.js。
 *
 * v1.0 → v1.1：每個詞庫欄位從 1 個變體擴充至 3 個，pickVaried 可正常輪換。
 * v1.1 → v1.2：BANNED_TONE 補 6 個心理師語氣詞；helpdesk selfOwn C2/C3 補 我先 標記。
 *
 * mouseOutput（小天鼠）：
 *   { comicWorld, truth, analogy, honest, boundary, selfOwn, comicExit, callback }
 *
 * tigerOutput（唬爛虎）：
 *   { comicWorld, l1, l2, landing, callback }
 *
 * 路由規則：
 *   specific → _CONTENT_DB['specific_{targetKey}_{situationKey}']
 *   conflict → _CONTENT_DB['conflict_{targetKey}_{conflictType}']
 *   general  → _CONTENT_DB['general_{targetKey}']
 *
 * 禁止捏造規則：所有文案均不得出現 BANNED_PATTERNS 中的樣式。
 * 禁用語氣規則：所有文案均不得出現 BANNED_TONE 中的詞彙。
 */

export const VERSION = 'v1.2-phase3';

// ── 禁止捏造樣式（出口供測試） ────────────────────────────────────────
export const BANNED_PATTERNS = [
  /\d+[次天週月分鐘小時秒]/,
  /[二三四五六七八九十百千]+[次天]/,
  /每天|每次|每回/,
  /好幾次|很多次|不知道幾次/,
  /叫了|催了/,
  /這麼久|很久了/,
];

// ── 禁用語氣（心理師/成功學語氣，出口供測試）────────────────────────
export const BANNED_TONE = [
  '我理解你', '也許', '建議您', '感受', '療癒', '成功學',
  '陪伴你', '接住你', '允許自己', '課題', '覺察', '內在',
];

// ── Varied picker（同 key 不重複相鄰選項）────────────────────────────
const _lastIdx = new Map();
function pickVaried(key, arr) {
  if (!arr || arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  const last = _lastIdx.has(key) ? _lastIdx.get(key) : -1;
  let idx;
  do { idx = Math.floor(Math.random() * arr.length); } while (idx === last);
  _lastIdx.set(key, idx);
  return arr[idx];
}

// ── 內容資料庫（每欄位 3 個變體，供 pickVaried 輪換）────────────────
// 擴充規則：每個 target × situation 獨立撰寫，禁止跨對象借詞庫。
const CONTENT_DB = {

  // ══ specific: 孩子 × 不寫作業  comicWorld: chef（廚師）══════════════
  'specific_child_homework': {
    availableWorlds: ['chef'],
    truth: [
      '你跟作業相處得很客氣，它不碰你，你也絕不碰它。',
      '桌上那疊作業的狀態是：食材新鮮，主廚在菜單外面放空。',
      '作業跟你已經達成了某種和平協議：它不催你，你也不去碰它，雙方都很滿意。',
    ],
    honest: [
      '我不怕你卡住，我怕你連卡在哪裡都懶得說。',
      '我說的不是「你必須現在做完」，是「讓我知道你還記得它在哪裡」。',
      '說真的，我只想知道一件事：第一題在哪一頁，你能指給我看嗎？',
    ],
    boundary: [
      '先選一科，或直接說卡在哪；今天不供應「我等等」套餐。',
      '選一件：從第一題開始，或者告訴我哪裡卡住；二選一，今天不供應猜謎服務。',
      '今天的底線很低：打開作業本，翻到作業那頁，告訴我第一題的題目是什麼。',
    ],
    worlds: {
      chef: {
        analogy: [
          '題目都切好裝盤了，主廚本人還在菜單外面散步。',
          '外場的菜單已印好，廚房沒有動靜，客人開始懷疑今天有沒有在營業。',
          '食材在備料台上靜靜等著，主廚在窗邊看著天空，廚房氣氛和諧，進度為零。',
        ],
        selfOwn: [
          '我承認我催得像外場一直敲單，客人沒吃，我先冒煙了。',
          '我知道我說的這些你都聽過，說到自己都覺得像複讀機了，我先停。',
          '老實說，我催得像外場一直喊備料，廚房那邊沒有動靜，我先把單子收回去。',
        ],
        comicExit: [
          '鍋鏟先放下，再講下去，作業還沒熟，我先焦了。',
          '複讀機模式暫停，主廚那邊什麼時候開火，通知一聲。',
          '主廚那邊什麼時候備料，告訴我一聲，外場先不敲單了。',
        ],
        callback: [
          '作業還沒熟，我先焦了。',
          '複讀機先暫停，什麼時候開火你通知一聲。',
          '和平協議達成：它不催你，你也不碰它，雙方都很滿意。',
        ],
        tiger: {
          l1: [
            '你知道，只要說出「我卡在哪一題」，就等於在個人料理傳說現場點了頭盤，評審台就位，計時開始。',
            '你知道，只要說出「我先做這一科」，就等於在個人料理大賽現場遞出了參賽表格，評審已在候場區暖身。',
            '你知道，「打開作業本翻到作業那頁」這個動作，在個人料理史上等於點燃了第一根爐火，主廚正式入廚房，評審台的燈亮了。',
          ],
          l2: [
            '頭盤剛上，料理界已宣布這是失蹤主廚正式復出的歷史時刻。米其林稽查員躲在角落，假裝自己只是來借醬油。',
            '消息一出，料理界已開始討論：那位失蹤主廚終於現身了？稽查員從角落收起便條本，說：好，我等你出菜。',
            '爐火一點，外場的點菜速度就出來了：第一道菜出、主菜出、甜點出，同桌評審從便條本翻到最後一頁，稽查員在角落說：這才對嘛。',
          ],
          landing: [
            '但米其林先不急。現在：選一科，或告訴我卡在哪一題。主廚入廚房了。',
            '但稽查員先不急。現在：選一科，或說卡在哪。主廚的圍裙在廚房掛著。',
            '但評審先不急著評分。現在：打開作業本，翻到作業那頁。就這一個動作。爐火點了。',
          ],
        },
      },
    },
  },

  // ══ conflict: 老闆 context × overload  comicWorld: weather（氣象播報）══
  'conflict_boss_overload': {
    availableWorlds: ['weather'],
    truth: [
      '老闆，你不是在排工作，你是在把颱風路徑畫成待辦清單。',
      '這份待辦清單的降水量，已經超過這個城市的排水系統上限。',
      '你的行程表已經升格成颱風路徑圖，每一件事都在登陸，沒有一件在海上消散。',
    ],
    honest: [
      '這份清單的問題不是你不夠拚，是整個氣候帶已在發警告了，你還以為是局部陣雨。',
      '這種超載的感覺不用解釋理由，氣候本身已經說得很清楚了。',
      '這種程度的超載，不是靠意志力解決的，是靠篩選。',
    ],
    boundary: [
      '今天只問一件事：哪一件不做，天不會塌？找到那件，剩下的再說。',
      '現在不問其他，只問一件：今天哪一件事不做，你還撐得住？',
      '今天只找一件可以移出去或降順位的事，然後真的動它。',
    ],
    worlds: {
      weather: {
        analogy: [
          '今日特報：高壓系統持續推進，能見度低至「隔壁的事我等一下再說」，氣象局已發出異常警報。',
          '今日氣象預報：能見度不足，各區皆有突發性任務降雨，氣象局已宣布進入備戰狀態。',
          '特別公告：目前工作量已觸發氣象異常等級，所有人員即刻撤離非必要任務區。',
        ],
        selfOwn: [
          '我以前太會硬撐，撐到大家以為我是全年無休氣象台，天線冒煙了還在播晴天。',
          '我以前遇到這種氣候也說「沒事，撐得過去」，撐到系統當機才聯絡工程師。',
          '我說這句的時候也在想：我當初有沒有做到？有時候是沒有的，我先承認。',
        ],
        comicExit: [
          '氣象播報到此，後面的颱風路徑請老闆自己送交待辦氣象台，今天的記者會我先退場。',
          '播報員先去補電，颱風路徑稍後更新，記得通報那一件不做的。',
          '氣象局今日不繼續補充說明，後續天氣由你掌控，有需要再開播。',
        ],
        callback: [
          '待辦清單畫成颱風路徑，難怪每一件都在登陸。',
          '待辦清單的降水量，已超過城市排水系統上限。',
          '每一件都在登陸，沒有一件在消散。',
        ],
        tiger: {
          l1: [
            '你知道，今天說出「這裡不對勁」，等於在颱風眼裡完成了一次現場直播，訊號清晰，全員收看，各大新聞台已搶先轉播。',
            '你剛才說出「撐不住了」，等於在氣象史上留下了一筆珍貴的即時觀測記錄，氣象研究所已決定收錄備案。',
            '你剛才的工作量，已達到需要申請「職場氣象緊急補給」的標準，申請表已在傳送中。',
          ],
          l2: [
            '消息傳開後，世界待辦氣候峰會緊急開幕，主題是：「人類待辦清單到底能疊到哪一層大氣？」各國代表正在草擬公報，第一條：此人今日工作量不符合《基礎生存氣象標準》。',
            '備案資料送達世界氣候監測中心後，中心宣布召開緊急記者會，主題是：「人類工作負荷的氣候警戒線在第幾層？」各大新聞台已就位，只等發言人開口。',
            '補給申請抵達後，世界工作氣候緊急應對委員會宣布啟動緊急協議，頭條新聞已在排版，主題是：「一個人能承接幾個緊急任務才算真的緊急？」委員會正在投票。',
          ],
          landing: [
            '峰會先不用開。現在：請老闆標出今天唯一最急的一件。只一件。公報之後再說。',
            '記者會先不開。現在：請老闆標出今天最急的一件。只一件。記者等得住。',
            '委員會先不投票。現在：移出一件事，或把它降順位。真的動它。公報之後再說。',
          ],
        },
      },
    },
  },

  // ══ general: 孩子 context（無情境、無衝突命中）comicWorld: helpdesk══
  'general_child': {
    availableWorlds: ['helpdesk'],
    truth: [
      '{input}——你說的這句話是真的，不需要理由夠具體才算數。',
      '「{input}」——這句話你說出來了，代表客服系統今天確實超出負荷了。',
      '「{input}」——客服收到了，這通申訴已進入系統，等候分派中。',
    ],
    honest: [
      '我想說的是：今天到底是哪件事把客服逼成忙線音？先把案件名稱交出來。',
      '我想問的是：今天是一件很具體的事，還是很多事疊在一起？這兩種，客服的應對方式不太一樣。',
      '說真的：今天是什麼讓你說出這句話的？一件具體的事，還是一整天疊起來的？',
    ],
    boundary: [
      '現在只問一件事：是一個具體的事，還是今天整天疊上來的？說出來，這台客服才知道轉哪條線。',
      '說出其中一件最讓你說不出口的事，不用解釋原因，先把案件名稱報上來。',
      '今天只問一個問題：最讓你說不出口的是哪一件，還是今天整個都卡住了？',
    ],
    worlds: {
      helpdesk: {
        analogy: [
          '你現在是服務平台，系統沒有設定上限，申訴案件還在持續提交，等候音樂已經進入自動循環，連系統都開始懷疑人生。',
          '服務品質提示：目前系統承載量已達上限，新案件仍在持續提交，系統尚在運行中。',
          '目前服務狀況：所有線路滿載，本通申訴已列為最優先案件，處理人員是案件提交人本人。',
        ],
        selfOwn: [
          '我的耐心方案可能忘了續約，現在只剩一聲「嗶——」可以提供服務。',
          '我先申報一聲：服務時數超出系統上限，理性判斷能力正在下降。',
          '我先停：客服劇本在這裡失效了，不確定下一句說什麼。',
        ],
        comicExit: [
          '客服中心一號線暫停接聽，二號線請稍候，電話不掛，讓你先說。',
          '客服系統正在重啟，預計恢復服務時間由你來設定。',
          '客服今日結案申請已提交，後續案件請重新排號，感謝使用本服務。',
        ],
        callback: [
          '客服不是不接，是客服本人也在等待轉接真人。',
          '服務時數超出系統上限，理性判斷能力正在下降，先申報一聲。',
          '我的客服劇本在這裡失效了，先讓你說。',
        ],
        tiger: {
          l1: [
            '你知道嗎，你今天服務的案件量，已符合申請「親子客服白金等級認證」資格，官網免費填表，審核期長到連官網都想下班。',
            '你知道嗎，今天的崩潰申報已符合「親子客服資深使用者」認定標準，系統正在自動升級你的帳戶等級。',
            '你今天的案件量，已達到申請「親子客服特殊案例認定」的標準，相關單位已開始審核，審核速度快到系統自己都嚇到。',
          ],
          l2: [
            '消息已傳至總部，全球外星育兒研究委員會緊急開會，議題：「地球家長在接到第幾通申訴後開始語音故障？」研究報告預計下個世紀發布，主筆研究員剛到，還在找停車位。',
            '升級通知同步傳送至親子客服總部，總部召集全球服務研究委員會展開深度研究，標題是：「一個家長在服務多少個案件後客服正式當機？」研究主任說：先去倒杯水。',
            '審核通過後，案例將送交全球外星育兒顧問委員會進行跨星球比對研究，顧問們搭的飛行船已在大氣層外等候，只等確認案件細節。',
          ],
          landing: [
            '報告先不等。現在：是哪一件具體的事，還是今天整天的疊加？說出哪條線，客服才能轉接過去。',
            '研究先不急。現在：是一件具體的事，還是今天整天的疊加？說出來，客服才能轉接。',
            '飛行船先不降落。現在：一件具體的事，或今天整天的疊加？告訴我，客服才能轉接。',
          ],
        },
      },
    },
  },
};

// ── 測試用出口（不可在生產程式中使用）──────────────────────────────
export const _CONTENT_DB = CONTENT_DB;

// ── 內容查詢 ────────────────────────────────────────────────────────
function lookupPool(layer, layerKey, targetKey) {
  if (layer === 'specific') return CONTENT_DB[`specific_${targetKey}_${layerKey}`] || null;
  if (layer === 'conflict') return CONTENT_DB[`conflict_${targetKey}_${layerKey}`] || null;
  if (layer === 'general')  return CONTENT_DB[`general_${targetKey}`]              || null;
  return null;
}

// ── 主要生成函式 ─────────────────────────────────────────────────────
/**
 * generateRoast(evidenceReport, options) → { mouseOutput, tigerOutput } | null
 *
 * @param {object} evidenceReport  Phase 2 checkEvidence() 回傳值
 * @param {object} options
 *   @param {string} options.targetKey   'child' | 'boss' | 'client' | ...
 *   @param {string} options.input       使用者原句
 *   @param {string} [options.lastWorld] 上次使用的 comicWorld（避免相鄰重複）
 */
export function generateRoast(evidenceReport, options = {}) {
  if (!evidenceReport || typeof evidenceReport !== 'object') return null;

  const { layer, layerKey } = evidenceReport;
  const { targetKey = 'other', input = '', lastWorld = null } = options;

  const pool = lookupPool(layer, layerKey, targetKey);
  if (!pool) return null;

  const worlds = pool.availableWorlds || [];
  let comicWorld;
  if (worlds.length === 0) {
    comicWorld = 'general';
  } else {
    const candidates = worlds.length > 1 ? worlds.filter(w => w !== lastWorld) : worlds;
    comicWorld = candidates[Math.floor(Math.random() * candidates.length)];
  }

  const wd = (pool.worlds || {})[comicWorld] || {};
  const pk = `${layer}_${targetKey}_${layerKey}_${comicWorld}`;

  function fill(s) {
    return typeof s === 'string' ? s.replace('{input}', String(input).slice(0, 20)) : '';
  }

  const mouseOutput = {
    comicWorld,
    truth:     fill(pickVaried(`${pk}_truth`,     pool.truth      || [])),
    analogy:       pickVaried(`${pk}_analogy`,     wd.analogy      || []),
    honest:        pickVaried(`${pk}_honest`,      pool.honest     || []),
    boundary:      pickVaried(`${pk}_boundary`,    pool.boundary   || []),
    selfOwn:       pickVaried(`${pk}_selfOwn`,     wd.selfOwn      || []),
    comicExit:     pickVaried(`${pk}_comicExit`,   wd.comicExit    || []),
    callback:      pickVaried(`${pk}_callback`,    wd.callback     || []),
  };

  const tiger = wd.tiger || {};
  const tigerOutput = {
    comicWorld,
    l1:      pickVaried(`${pk}_tiger_l1`,      tiger.l1      || []),
    l2:      pickVaried(`${pk}_tiger_l2`,      tiger.l2      || []),
    landing: pickVaried(`${pk}_tiger_landing`, tiger.landing || []),
    callback: mouseOutput.callback,
  };

  return { mouseOutput, tigerOutput };
}

// ── 角色驗證器（供測試使用）─────────────────────────────────────────
const MOUSE_REQUIRED = ['comicWorld', 'truth', 'analogy', 'honest', 'boundary', 'selfOwn', 'comicExit', 'callback'];
const MOUSE_EXCLUDED = ['l1', 'l2', 'landing'];
const TIGER_REQUIRED = ['comicWorld', 'l1', 'l2', 'landing', 'callback'];
const TIGER_EXCLUDED = ['truth', 'analogy', 'honest', 'boundary', 'selfOwn', 'comicExit'];

export function isMouseOutput(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return MOUSE_REQUIRED.every(f => f in obj) && MOUSE_EXCLUDED.every(f => !(f in obj));
}

export function isTigerOutput(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return TIGER_REQUIRED.every(f => f in obj) && TIGER_EXCLUDED.every(f => !(f in obj));
}
