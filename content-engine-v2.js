/**
 * content-engine-v2.js — Phase 1: Input Classifier
 *
 * 純函式 ES module。無 DOM 依賴。
 * 不修改 app.js 任何函式。
 *
 * 匯出：classifyInput(input, targetLabel) → ClassificationResult
 *
 * ClassificationResult：
 *   speakerRole           : string   — 說話者角色
 *   targetRole            : string   — 抱怨對象（mapped key）
 *   situationKey          : string|null — 主情境（對應 app.js situations 鍵名）
 *   subSituationKey       : string|null — 子情境（screen_time 等；無則 null）
 *   primaryConflictType   : string   — 衝突類型
 *   evidenceTokens        : string[] — 命中的 evidence token 清單
 *   classificationSource  : 'keyword_match'|'fallback'
 *   classificationConfidence: 'high'|'medium'|'low'
 */

export const VERSION = 'v2.0-phase1';

// ── 1. Target mapping（對應 app.js TARGET_MAP）─────────────────────
const TARGET_MAP = {
  '老闆': 'boss', '老闆/主管': 'boss', '主管': 'boss',
  '客戶': 'client',
  '同事': 'coworker',
  '孩子': 'child',
  '爸媽': 'parents', '爸媽/長輩': 'parents', '長輩': 'parents',
  '兄弟姊妹': 'sibling',
  '另一半': 'partner',
  '朋友': 'friend',
  '其他': 'other',
};

// ── 2. Speaker role（依 targetRole 推斷說話者身分）────────────────
const SPEAKER_ROLE_MAP = {
  child:    'caregiver',
  boss:     'employee',
  client:   'employee',
  coworker: 'employee',
  parents:  'adult_child',
  sibling:  'adult_child',
  partner:  'partner',
  friend:   'friend',
  other:    'other',
};

// ── 3. Situation keyword tables（對應 app.js situations 順序）──────
//   順序就是優先序：先命中先採用。
const SITUATION_RULES = {
  child: [
    { key: 'lateSleep',     kw: ['賴床','起床','叫不起','起不來','睡覺','睡太久','不肯起','鬧鐘','早上','起床氣','睡不醒'] },
    { key: 'homework',      kw: ['功課','作業','讀書','學校','考試','成績','不寫','沒寫','不念','不讀','還沒寫','不想寫'] },
    { key: 'screen',        kw: ['手機','電視','平板','遊戲','3C','網路','影片','一直看','一直玩','不放下','YouTube','不關'] },
    { key: 'procrastinate', kw: ['拖延','拖拖拉拉','等一下','不急','之後再說','明天再','慢慢來','等等','拖到','不動'] },
    { key: 'picky',         kw: ['挑食','不吃','這個不要','那個不吃','只吃','不喜歡吃','挑嘴','不碰','噁心'] },
    { key: 'talkBack',      kw: ['頂嘴','回嘴','反嗆','大小聲','講不聽','沒禮貌','態度差'] },
    { key: 'messyRoom',     kw: ['玩具','不收','亂丟','散','地上','不整理','到處都是','收拾','不撿'] },
  ],
  boss: [
    { key: 'overtime',  kw: ['加班','超時','下班','假日','休假','週末','留下','不能走','繼續做','沒辦法走'] },
    { key: 'blame',     kw: ['背鍋','責任','怪我','都是我','算我','我的問題','我的錯','甩鍋','推給我'] },
  ],
  client: [
    { key: 'revision', kw: ['改','修改','再改','又改','改稿','不對','重做','重來','換','調整','版本','退稿','再調'] },
    { key: 'rush',     kw: ['催','什麼時候','好了沒','進度','趕','急','快點','馬上','立刻','今天要','要趕','趕快'] },
  ],
  coworker: [
    { key: 'credit',     kw: ['功勞','表現','搶','我做的','沒說是我','沒提到我','說是他','佔便宜','沒認可','沒credit'] },
    { key: 'push_blame', kw: ['推','卸責','不關我','都是你','你沒說','我不知道','沒人告訴','甩鍋','算你的'] },
  ],
  parents: [
    { key: 'marriage',          kw: ['結婚','婚','男友','女友','交往','嫁','娶','催婚','對象','找個人','年紀','老了','來不及','沒對象'] },
    { key: 'compare',           kw: ['比','別人','你看','人家','同學','表哥','表姊','鄰居','比不上','哪像你','別人家','別人的孩子','別人都'] },
    { key: 'meddle',            kw: ['管','干涉','不關你','我的事','你不要管','一直問','一直說','煩死了','叫我','沒問你','管太多'] },
    { key: 'cross_generation',  kw: ['爺爺','奶奶','阿公','阿嬤','爺','奶'] },
  ],
  sibling: [],
  partner: [
    { key: 'misunderstood', kw: ['不懂','不在乎','不理解','不關心','你都不','你從來','你沒有','不把我','你不明白','你不知道','沒有感覺'] },
    { key: 'chores',        kw: ['家務','家事','掃','拖','碗','洗碗','洗衣','煮飯','整理','收拾','不做','都是我','你沒做','沒分擔'] },
  ],
  friend: [
    { key: 'flake',  kw: ['爽約','放鳥','取消','臨時','說好','不來','不去','突然','改期','忘了','沒出現','沒來'] },
    { key: 'gossip', kw: ['說出去','說了','洩露','秘密','到處說','跟別人說','我說的','不可以說','背刺','傳出去','亂說','散布'] },
  ],
  other:   [],
};

// ── 4. Sub-situation rules（僅對有子情境的 targetRole:situationKey）─
const SUB_SITUATION_RULES = {
  // screen 六子情境（screen_general = fallback，不列在此）
  'child:screen': [
    { key: 'screen_time',       kw: ['時間到','約定時間','規定時間','說好幾點','超過時間','超時了','時間超過'] },
    { key: 'screen_content',    kw: ['不適合','這個不能看','暴力','色情','18禁','不好的內容','這種東西'] },
    { key: 'screen_at_bedtime', kw: ['睡前','該睡了','快睡了','睡覺時間','深夜還在'] },
    { key: 'screen_at_meals',   kw: ['吃飯','用餐','吃東西時','吃飯時','邊吃邊看'] },
    { key: 'screen_hidden_use', kw: ['偷偷','躲','瞞著','以為我不知道','偷拿','偷用'] },
  ],
  // cross_generation 子情境
  'parents:cross_generation': [
    { key: 'grandparent_treat_override', kw: ['糖','零食','餅乾','點心','甜食','偷吃','又給他吃','說可以吃','說沒關係'] },
    { key: 'grandparent_rules_general',  kw: ['規定','說不行','不可以','管教','界線','不一樣的說法','標準不同','這樣教'] },
  ],
};

// ── 5. Evidence token rules ────────────────────────────────────────
const EVIDENCE_TOKEN_RULES = [
  { token: 'screen_time_explicit',           kw: ['時間到','約定時間','規定時間','說好幾點'] },
  { token: 'stop_resistance_explicit',       kw: ['不關','不放下','不停','繼續玩','不肯關','不肯停','停不下來','不走開'] },
  { token: 'rules_conflict_explicit',        kw: ['規定','說好','約定','不遵守','打破規定','不照規定'] },
  { token: 'appeal_to_other_explicit',       kw: ['但他說','他說可以','那邊說','老人說','爺爺說','奶奶說','阿公說','阿嬤說'] },
  { token: 'chores_mention_explicit',        kw: ['家事','掃地','拖地','洗碗','不做','都是我做','沒分擔'] },
  { token: 'procrastinate_mention_explicit', kw: ['等一下','之後再','明天再','拖','慢慢來','等等'] },
  { token: 'homework_explicit',              kw: ['功課','作業','讀書','考試','成績','寫作業'] },
  { token: 'not_started_explicit',           kw: ['沒開始','不開始','還沒開始','不動','沒動','不寫','還沒寫','沒動筆','沒拿筆'] },
  { token: 'agreed_time_explicit',           kw: ['說好幾點','約定的時間','說好的時間','幾點停','幾點關'] },
  { token: 'grandparent_explicit',           kw: ['爺爺','奶奶','阿公','阿嬤','爺','奶'] },
  { token: 'parent_rule_explicit',           kw: ['爸媽說','我說','我們說','父母說','爸說','媽說','規定不能','說不能','說不行'] },
  { token: 'treat_override_explicit',        kw: ['糖','零食','餅乾','點心','甜食','說可以吃','說沒關係'] },
];

// ── 6. Conflict type per situationKey ─────────────────────────────
const CONFLICT_TYPE_MAP = {
  homework:         'avoidance',
  lateSleep:        'time_conflict',
  screen:           'time_conflict',
  procrastinate:    'avoidance',
  picky:            'preference',
  talkBack:         'authority',
  messyRoom:        'rule_violation',
  overtime:         'boundary_violation',
  blame:            'blame_shift',
  revision:         'scope_conflict',
  rush:             'time_conflict',
  credit:           'recognition',
  push_blame:       'blame_shift',
  marriage:         'autonomy',
  compare:          'autonomy',
  meddle:           'autonomy',
  cross_generation: 'cross_generation',
  misunderstood:    'recognition',
  chores:           'rule_violation',
  flake:            'trust',
  gossip:           'trust',
};

// ── 7. Helpers ─────────────────────────────────────────────────────
function hasKeyword(text, keywords) {
  for (let i = 0; i < keywords.length; i++) {
    if (text.indexOf(keywords[i]) !== -1) return true;
  }
  return false;
}

// ── 8. Main classifier ─────────────────────────────────────────────
/**
 * classifyInput(input, targetLabel) → ClassificationResult
 */
export function classifyInput(input, targetLabel) {
  const targetRole = TARGET_MAP[targetLabel] || 'other';
  const speakerRole = SPEAKER_ROLE_MAP[targetRole] || 'other';
  const rules = SITUATION_RULES[targetRole] || [];

  // Step 1: situationKey — first keyword match wins
  let situationKey = null;
  for (let i = 0; i < rules.length; i++) {
    if (hasKeyword(input, rules[i].kw)) {
      situationKey = rules[i].key;
      break;
    }
  }

  // Step 2: subSituationKey — only for entries in SUB_SITUATION_RULES
  let subSituationKey = null;
  if (situationKey) {
    const subKey = `${targetRole}:${situationKey}`;
    const subRules = SUB_SITUATION_RULES[subKey];
    if (subRules) {
      for (let i = 0; i < subRules.length; i++) {
        if (hasKeyword(input, subRules[i].kw)) {
          subSituationKey = subRules[i].key;
          break;
        }
      }
      // No specific sub-match → fall back to _general variant
      if (!subSituationKey) {
        if (situationKey === 'screen') {
          subSituationKey = 'screen_general';
        } else if (situationKey === 'cross_generation') {
          subSituationKey = 'grandparent_rules_general';
        }
      }
    }
  }

  // Step 3: evidence tokens — all matching tokens collected
  const evidenceTokens = [];
  for (let i = 0; i < EVIDENCE_TOKEN_RULES.length; i++) {
    if (hasKeyword(input, EVIDENCE_TOKEN_RULES[i].kw)) {
      evidenceTokens.push(EVIDENCE_TOKEN_RULES[i].token);
    }
  }

  // Step 4: confidence
  let classificationSource;
  let classificationConfidence;
  if (!situationKey) {
    classificationSource = 'fallback';
    classificationConfidence = 'low';
  } else {
    classificationSource = 'keyword_match';
    const subKey = `${targetRole}:${situationKey}`;
    const hasSubRules = !!SUB_SITUATION_RULES[subKey];
    const isGenericFallback = subSituationKey &&
      (subSituationKey === 'screen_general' || subSituationKey === 'grandparent_rules_general');
    classificationConfidence = (hasSubRules && isGenericFallback) ? 'medium' : 'high';
  }

  // Step 5: conflict type
  const primaryConflictType = (situationKey && CONFLICT_TYPE_MAP[situationKey]) || 'unknown';

  return {
    speakerRole,
    targetRole,
    situationKey,
    subSituationKey,
    primaryConflictType,
    evidenceTokens,
    classificationSource,
    classificationConfidence,
  };
}
