/**
 * character-generator-v1.js — Phase 3 角色生成器 v1.0
 *
 * 純函式 ES Module。無 DOM 依賴。不接 app.js。
 *
 * 輸入：Phase 2 checkEvidence() 回傳的 EvidenceReport
 * 輸出：{ mouseOutput, tigerOutput }
 *
 * mouseOutput（小天鼠）：
 *   { comicWorld, truth, analogy, honest, boundary, selfOwn, comicExit, callback }
 *
 * tigerOutput（唬爛虎）：
 *   { comicWorld, l1, l2, landing, callback }
 *
 * 路由規則：
 *   specific → CONTENT_DB['specific_{targetKey}_{situationKey}']
 *   conflict → CONTENT_DB['conflict_{targetKey}_{conflictType}']
 *   general  → CONTENT_DB['general_{targetKey}']
 *
 * 禁止捏造規則：所有文案均不得出現 BANNED_PATTERNS 中的樣式。
 */

export const VERSION = 'v1.0-phase3';

// ── 禁止捏造樣式（測試用，亦為內容審稿標準）────────────────────────
export const BANNED_PATTERNS = [
  /\d+[次天週月分鐘小時秒]/,          // 數字 + 時間/次數單位
  /[二三四五六七八九十百千]+[次天]/,   // 中文數字 + 次/天
  /每天|每次|每回/,                    // 頻率假設
  /好幾次|很多次|不知道幾次/,          // 模糊次數聲稱
  /叫了|催了/,                         // 使用者未提及的動作
  /這麼久|很久了/,                     // 模糊時間聲稱
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

// ── 內容資料庫（Phase 3 三組批准樣本）──────────────────────────────
//
// 結構：
//   truth[]    / honest[]   / boundary[]          → 情境層共用，不分世界
//   worlds[comicWorld].analogy[]   / selfOwn[]
//                         / comicExit[] / callback[]
//                         / tiger.l1[] / l2[] / landing[]
//
// 擴充規則：每個 target × situation 獨立撰寫，禁止跨對象借詞庫。

const CONTENT_DB = {

  // ── specific: 孩子 × 不寫作業 ─────────────────────────────────────
  'specific_child_homework': {
    availableWorlds: ['chef'],
    truth: [
      '你跟作業相處得很客氣，它不碰你，你也絕不碰它。',
    ],
    honest: [
      '我不怕你卡住，我怕你連卡在哪裡都懶得說。',
    ],
    boundary: [
      '先選一科，或直接說卡在哪；今天不供應「我等等」套餐。',
    ],
    worlds: {
      chef: {
        analogy: [
          '題目都切好裝盤了，主廚本人還在菜單外面散步。',
        ],
        selfOwn: [
          '我承認我催得像外場一直敲單，客人沒吃，我先冒煙了。',
        ],
        comicExit: [
          '鍋鏟先放下，再講下去，作業還沒熟，我先焦了。',
        ],
        callback: [
          '作業還沒熟，我先焦了。',
        ],
        tiger: {
          l1: [
            '你知道，只要說出「我卡在哪一題」，就等於在個人料理傳說現場點了頭盤，評審台就位，計時開始。',
          ],
          l2: [
            '頭盤剛上，料理界已宣布這是失蹤主廚正式復出的歷史時刻。米其林稽查員躲在角落，假裝自己只是來借醬油。',
          ],
          landing: [
            '但米其林先不急。現在：選一科，或告訴我卡在哪一題。主廚入廚房了。',
          ],
        },
      },
    },
  },

  // ── conflict: 老闆 context × overload ────────────────────────────
  'conflict_boss_overload': {
    availableWorlds: ['weather'],
    truth: [
      '老闆，你不是在排工作，你是在把颱風路徑畫成待辦清單。',
    ],
    honest: [
      '這份清單的問題不是你不夠拚，是整個氣候帶已在發警告了，你還以為是局部陣雨。',
    ],
    boundary: [
      '今天只問一件事：哪一件不做，天不會塌？找到那件，剩下的再說。',
    ],
    worlds: {
      weather: {
        analogy: [
          '今日特報：高壓系統持續推進，能見度低至「隔壁的事我等一下再說」，氣象局已發出異常警報。',
        ],
        selfOwn: [
          '我以前太會硬撐，撐到大家以為我是全年無休氣象台，天線冒煙了還在播晴天。',
        ],
        comicExit: [
          '氣象播報到此，後面的颱風路徑請老闆自己送交待辦氣象台，今天的記者會我先退場。',
        ],
        callback: [
          '待辦清單畫成颱風路徑，難怪每一件都在登陸。',
        ],
        tiger: {
          l1: [
            '你知道，今天說出「這裡不對勁」，等於在颱風眼裡完成了一次現場直播，訊號清晰，全員收看，各大新聞台已搶先轉播。',
          ],
          l2: [
            '消息傳開後，世界待辦氣候峰會緊急開幕，主題是：「人類待辦清單到底能疊到哪一層大氣？」各國代表正在草擬公報，第一條：此人今日工作量不符合《基礎生存氣象標準》。',
          ],
          landing: [
            '峰會先不用開。現在：請老闆標出今天唯一最急的一件。只一件。公報之後再說。',
          ],
        },
      },
    },
  },

  // ── general: 孩子 context（無情境、無衝突命中）─────────────────────
  'general_child': {
    availableWorlds: ['helpdesk'],
    truth: [
      '{input}——你說的這句話是真的，不需要理由夠具體才算數。',
    ],
    honest: [
      '我想說的是：今天到底是哪件事把客服逼成忙線音？先把案件名稱交出來。',
    ],
    boundary: [
      '現在只問一件事：是一個具體的事，還是今天整天疊上來的？說出來，這台客服才知道轉哪條線。',
    ],
    worlds: {
      helpdesk: {
        analogy: [
          '你現在是服務平台，系統沒有設定上限，申訴案件還在持續提交，等候音樂已經進入自動循環，連系統都開始懷疑人生。',
        ],
        selfOwn: [
          '我的耐心方案可能忘了續約，現在只剩一聲「嗶——」可以提供服務。',
        ],
        comicExit: [
          '客服中心一號線暫停接聽，二號線請稍候，電話不掛，讓你先說。',
        ],
        callback: [
          '客服不是不接，是客服本人也在等待轉接真人。',
        ],
        tiger: {
          l1: [
            '你知道嗎，你今天服務的案件量，已符合申請「親子客服白金等級認證」資格，官網免費填表，審核期長到連官網都想下班。',
          ],
          l2: [
            '消息已傳至總部，全球外星育兒研究委員會緊急開會，議題：「地球家長在接到第幾通申訴後開始語音故障？」研究報告預計下個世紀發布，主筆研究員剛到，還在找停車位。',
          ],
          landing: [
            '報告先不等。現在：是哪一件具體的事，還是今天整天的疊加？說出哪條線，客服才能轉接過去。',
          ],
        },
      },
    },
  },
};

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
 *   @param {string} [options.lastWorld] 上次使用的 comicWorld（用於避免相鄰重複）
 */
export function generateRoast(evidenceReport, options = {}) {
  if (!evidenceReport || typeof evidenceReport !== 'object') return null;

  const { layer, layerKey } = evidenceReport;
  const { targetKey = 'other', input = '', lastWorld = null } = options;

  const pool = lookupPool(layer, layerKey, targetKey);
  if (!pool) return null;

  // 選 comicWorld（如可能，避開 lastWorld）
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
