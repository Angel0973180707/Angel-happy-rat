/**
 * content-engine-v2.js — Phase 1 Classifier v2.1
 *
 * 純函式 ES module。無 DOM 依賴。不修改 app.js。
 * 設計文件：CONTENT-ENGINE-V2-DESIGN.md v1.4.2
 *
 * 匯出：classifyInput(input, options) → ClassificationResult
 *
 * options 可為字串（targetLabel）或物件：
 *   { targetLabel: string, guidedSelection?: { situationKey, subSituationKey } }
 *
 * 分類三層：
 *   1. Specific — 關鍵詞加權命中 situationKey / subSituationKey
 *   2. Conflict — 無具體情境，但 sharedConflict 可識別
 *   3. General  — domain 層 fallback
 *
 * 加權評分：score = Σ len(kw) for each matched kw where len(kw) >= 2
 * MIN_SCORE = 2（單字元關鍵詞不單獨觸發情境）
 */

export const VERSION = 'v2.2.1-phase1';

const MIN_SCORE = 2;

// ── 1. Target / Role maps ──────────────────────────────────────────
const TARGET_MAP = {
  '老闆': 'boss', '老闆/主管': 'boss', '主管': 'boss',
  '客戶': 'client',
  '同事': 'coworker',
  '孩子': 'child',
  '爸媽': 'parents', '爸媽/長輩': 'parents', '長輩': 'parents',
  '兄弟姊妹': 'sibling',
  '另一半': 'partner',
  '朋友': 'friend',
  '自己': 'self',
  '其他': 'other',
};

// speakerRole: 誰在說話
const SPEAKER_ROLE_FROM_TARGET = {
  child: 'parent', boss: 'employee', client: 'employee', coworker: 'employee',
  parents: 'adult_child', sibling: 'adult_child',
  partner: 'partner', friend: 'friend', self: 'self', other: 'unknown',
};

// subjectRole: 衝突涉及的第三方（大多數情況為 null）
const SUBJECT_ROLE_FROM_SITUATION = {
  cross_generation: 'child', // 孩子夾在父母與祖父母之間
};

// domain: 情境所屬生活領域
const DOMAIN_FROM_TARGET = {
  child: 'parenting', boss: 'workplace', client: 'workplace', coworker: 'workplace',
  parents: 'family', sibling: 'family',
  partner: 'relationship', friend: 'social_life',
  self: 'self', other: 'unknown',
};

// ── 1b. guidedSelection 合法值表（防止非法選項污染結果）─────────────
const GUIDED_SITUATION_MAP = {
  child:    ['lateSleep', 'homework', 'screen', 'procrastinate', 'picky', 'talkBack', 'messyRoom'],
  boss:     ['disrespect', 'overtime', 'blame'],
  client:   ['revision', 'rush'],
  coworker: ['credit', 'push_blame'],
  parents:  ['cross_generation', 'marriage', 'compare', 'meddle'],
  sibling:  [],
  partner:  ['screen', 'chores', 'finance', 'misunderstood'],
  friend:   ['flake', 'gossip'],
  self:     ['self_procrastinate', 'self_direction', 'self_finance', 'self_comparison', 'self_diet'],
  other:    [],
};

const GUIDED_SUB_SITUATION_MAP = {
  screen:           ['screen_time', 'screen_content', 'screen_at_bedtime', 'screen_at_meals', 'screen_hidden_use', 'screen_general'],
  cross_generation: ['grandparent_treat_override', 'grandparent_rules_general'],
};

// ── 2. Situation keyword rules（加權）─────────────────────────────
// 順序 = 次要優先序（加權分相同時先列者優先）
const SITUATION_RULES = {
  child: [
    { key: 'lateSleep',     kw: ['賴床','起床','叫不起','起不來','睡太久','不肯起','鬧鐘','起床氣','睡不醒'] },
    { key: 'homework',      kw: ['功課','作業','讀書','學校','考試','成績','不寫','沒寫','不念','不讀','還沒寫','不想寫'] },
    { key: 'screen',        kw: ['手機','電視','平板','遊戲','網路','影片','一直看','一直玩','不放下','YouTube','不關'] },
    { key: 'procrastinate', kw: ['拖延','拖拖拉拉','等一下','不急','之後再說','明天再','慢慢來','等等','拖到'] },
    { key: 'picky',         kw: ['挑食','不吃','這個不要','那個不吃','只吃','不喜歡吃','挑嘴','不碰','噁心'] },
    { key: 'talkBack',      kw: ['頂嘴','回嘴','反嗆','大小聲','講不聽','沒禮貌','態度差'] },
    { key: 'messyRoom',     kw: ['玩具','不收','亂丟','地上','不整理','到處都是','收拾','不撿'] },
  ],
  boss: [
    { key: 'disrespect', kw: ['不尊重','態度差','語氣差','亂罵','大聲罵','看不起','瞧不起','不把我當人','不當人看'] },
    { key: 'overtime',   kw: ['加班','超時','下班','假日','休假','週末','留下','不能走','沒辦法走'] },
    { key: 'blame',      kw: ['背鍋','怪我','都是我','算我','我的問題','我的錯','甩鍋','推給我'] },
  ],
  client: [
    { key: 'revision', kw: ['修改','再改','又改','改稿','不對','重做','重來','調整','版本','退稿','再調'] },
    { key: 'rush',     kw: ['催稿','催進度','趕稿','催交','什麼時候','好了沒','快點','立刻','今天要','趕快','催一下'] },
  ],
  coworker: [
    { key: 'credit',     kw: ['功勞','搶功','搶成果','我做的','沒說是我','沒提到我','說是他','佔便宜','沒認可'] },
    { key: 'push_blame', kw: ['卸責','不關我','都是你','你沒說','我不知道','沒人告訴'] },
  ],
  parents: [
    // cross_generation 置前：爺奶關鍵詞 len≥2，優先於「比」(len=1)
    { key: 'cross_generation', kw: ['爺爺','奶奶','阿公','阿嬤','爺奶'] },
    { key: 'marriage',         kw: ['結婚','催婚','逼婚','男友','女友','交往','嫁','娶','對象','找個人','來不及','沒對象'] },
    // compare 刪除單字「比」，避免誤判
    { key: 'compare',          kw: ['別人','人家','同學','表哥','表姊','鄰居','比不上','哪像你','別人家','別人的孩子','別人都'] },
    { key: 'meddle',           kw: ['干涉','不關你','我的事','你不要管','一直問','一直說','煩死了','管太多'] },
  ],
  sibling: [],
  partner: [
    { key: 'screen',        kw: ['手機','平板','遊戲','一直滑','滑手機','低頭族','都在滑','一直玩','不放下'] },
    { key: 'chores',        kw: ['家務','家事','掃','碗','洗碗','洗衣','煮飯','整理','收拾','都是我','你沒做','沒分擔'] },
    { key: 'finance',       kw: ['花錢','消費','花費','存錢','貸款','借錢','理財','錢觀念','不存錢','亂花'] },
    { key: 'misunderstood', kw: ['不懂','不在乎','不理解','不關心','你都不','你從來','你沒有','不把我','你不明白'] },
  ],
  friend: [
    { key: 'flake',  kw: ['爽約','放鳥','取消','臨時','說好','不來','不去','忘了','沒出現','沒來'] },
    { key: 'gossip', kw: ['說出去','洩露','秘密','到處說','跟別人說','不可以說','背刺','傳出去','亂說'] },
  ],
  self: [
    { key: 'self_procrastinate', kw: ['拖延','一直拖','明天開始','之後再說','懶得開始','拖拖拉拉','不想動','存在感覺'] },
    { key: 'self_direction',     kw: ['不知道方向','人生方向','未來','迷惘','沒有目標','不知道要做什麼','找不到方向'] },
    { key: 'self_finance',       kw: ['存不到錢','存款','月光族','理財','負債','薪水不夠','花太多'] },
    { key: 'self_comparison',    kw: ['社群','覺得別人都比我','焦慮','自我懷疑','不如別人','比較焦慮'] },
    { key: 'self_diet',          kw: ['減肥','明天開始運動','沒去運動','健身','卡路里'] },
  ],
  other: [],
};

// ── 3. Sub-situation rules ─────────────────────────────────────────
const SUB_SITUATION_RULES = {
  'child:screen': [
    { key: 'screen_time',       kw: ['時間到','約定時間','規定時間','說好幾點','超過時間','時間超過'] },
    { key: 'screen_content',    kw: ['不適合','這個不能看','暴力','色情','18禁','不好的內容'] },
    { key: 'screen_at_bedtime', kw: ['睡前','該睡了','快睡了','睡覺時間','深夜還在'] },
    { key: 'screen_at_meals',   kw: ['吃飯','用餐','吃東西時','吃飯時','邊吃邊看'] },
    { key: 'screen_hidden_use', kw: ['偷偷','躲','瞞著','以為我不知道','偷拿','偷用'] },
  ],
  'parents:cross_generation': [
    { key: 'grandparent_treat_override', kw: ['糖','零食','餅乾','點心','甜食','偷吃','又給他吃','說可以吃','說沒關係'] },
    { key: 'grandparent_rules_general',  kw: ['規定','說不行','不可以','管教','界線','不一樣的說法','標準不同'] },
  ],
};

// ── 4. Evidence token rules ────────────────────────────────────────
const EVIDENCE_TOKEN_RULES = [
  { token: 'screen_time_explicit',           kw: ['時間到','約定時間','規定時間','說好幾點'] },
  { token: 'stop_resistance_explicit',       kw: ['不關','不放下','不停','不肯關','不肯停','停不下來','不走開','賴著不動'] },
  { token: 'rules_conflict_explicit',        kw: ['規定','說好','約定','不遵守','打破規定','不照規定','兩套'] },
  { token: 'appeal_to_other_explicit',       kw: ['但他說','他說可以','那邊說','爺爺說','奶奶說','阿公說','阿嬤說'] },
  { token: 'chores_mention_explicit',        kw: ['家事','掃地','拖地','洗碗','不做','都是我做','沒分擔'] },
  { token: 'procrastinate_mention_explicit', kw: ['等一下','之後再','明天再','一直拖','慢慢來','拖了'] },
  { token: 'homework_explicit',              kw: ['功課','作業','讀書','考試','成績','寫作業'] },
  { token: 'not_started_explicit',           kw: ['沒開始','不開始','還沒開始','沒動','不寫','還沒寫','沒動筆','沒拿筆'] },
  { token: 'agreed_time_explicit',           kw: ['說好幾點','約定的時間','說好的時間','幾點停','幾點關'] },
  { token: 'grandparent_explicit',           kw: ['爺爺','奶奶','阿公','阿嬤','爺奶'] },
  { token: 'parent_rule_explicit',           kw: ['爸媽說','我說','我們說','規定不能','說不能','說不行'] },
  { token: 'treat_override_explicit',        kw: ['糖','零食','餅乾','點心','甜食','說可以吃','說沒關係'] },
  { token: 'ability_gap_explicit',           kw: ['不會寫','不知道怎麼','看不懂','不懂這題','不會做','不知道如何','學不來','不會'] },
  { token: 'negation_of_avoidance',          kw: ['不是不寫','不是不做','不是不想','不是逃避','不是賴皮','是不會','是看不懂'] },
];

// ── 5. Shared conflict detection（12 共用衝突類型）─────────────────
// 用於 secondaryConflictTypes 以及無 situationKey 時的 primaryConflictType
const SHARED_CONFLICT_RULES = [
  { type: 'boundary_violation',    kw: ['越界','沒有界線','不把我當','不尊重我','侵犯'] },
  { type: 'expectation_gap',       kw: ['說好','以為','落差','結果不是','說過','約好了'] },
  { type: 'responsibility_gap',    kw: ['都是我','一個人','沒人幫','沒分擔','都只有我','你都不做'] },
  { type: 'respect_dignity',       kw: ['不尊重','看不起','瞧不起','態度差','語氣差','不被當'] },
  { type: 'control_autonomy',      kw: ['控制','一直管','不讓我','強迫','沒得選','干涉我的'] },
  { type: 'trust',                 kw: ['不信任','背叛','說謊','隱瞞','偷偷','不誠實'] },
  { type: 'recognition',           kw: ['沒人知道','沒被看見','不認可','沒感謝','付出','沒有人在意'] },
  { type: 'overload',              kw: ['太累','撐不住','太多了','忙不過來','壓力太大','快撐不住'] },
  { type: 'uncertainty',           kw: ['不知道','不確定','迷惘','不清楚方向','沒有答案','找不到'] },
  { type: 'comparison',            kw: ['別人','比較','比不上','為什麼別人','不如','跟別人比'] },
  { type: 'transition_resistance', kw: ['不願意','不肯','不想改','一直這樣','習慣了','改不了'] },
  { type: 'resource_scarcity',     kw: ['不夠','缺少','不足','不夠用','有限','沒有錢'] },
];

// ── 6. Finance domain keyword detection ───────────────────────────
const FINANCE_KEYWORDS = ['錢','存款','理財','負債','薪水','預算','花費','貸款','月光族','存不到'];

// ── 7. Situation → subjectKey（設計文件 1.1 值域）──────────────────
//   screen / homework / chores / rules / task / schedule / food / money / unknown
const SUBJECT_KEY_MAP = {
  screen: 'screen', homework: 'homework', lateSleep: 'schedule',
  procrastinate: 'task', picky: 'food', talkBack: 'rules',
  messyRoom: 'task', overtime: 'task', blame: 'task',
  revision: 'task', rush: 'task', credit: 'task',
  push_blame: 'task', marriage: 'unknown', compare: 'unknown',
  meddle: 'unknown', cross_generation: 'rules', misunderstood: 'unknown',
  chores: 'chores', finance: 'money', flake: 'unknown', gossip: 'unknown',
  disrespect: 'unknown',
  self_procrastinate: 'task', self_direction: 'unknown',
  self_finance: 'money', self_comparison: 'unknown', self_diet: 'task',
};

// ── 8. Situation → conflict type（需要 evidence 判定者已在推斷函式處理）
const BASE_CONFLICT_MAP = {
  screen:            'transition_resistance',
  lateSleep:         'transition_resistance',
  procrastinate:     'avoidance',
  picky:             'control_autonomy',
  talkBack:          'respect_dignity',
  messyRoom:         'responsibility_gap',
  overtime:          'boundary_violation',
  blame:             'responsibility_gap',
  revision:          'expectation_gap',
  rush:              'expectation_gap',
  credit:            'recognition',
  push_blame:        'responsibility_gap',
  marriage:          'control_autonomy',
  compare:           'comparison',
  meddle:            'control_autonomy',
  cross_generation:  'expectation_gap',
  misunderstood:     'recognition',
  chores:            'responsibility_gap',
  finance:           'resource_scarcity',
  flake:             'trust',
  gossip:            'trust',
  disrespect:        'respect_dignity',
  self_procrastinate:'avoidance',
  self_direction:    'uncertainty',
  self_finance:      'resource_scarcity',
  self_comparison:   'comparison',
  self_diet:         'avoidance',
};

// ── 9. Need / outcome / humorLevel maps ───────────────────────────
const NEED_MAP = {
  homework:    'choice', screen: 'boundary_setting', lateSleep: 'boundary_setting',
  procrastinate:'choice', picky: 'collaboration', talkBack: 'dignity',
  messyRoom:   'boundary_setting', overtime: 'boundary_setting', blame: 'acknowledgement',
  revision:    'boundary_setting', rush: 'rest', credit: 'acknowledgement',
  push_blame:  'acknowledgement', marriage: 'choice', compare: 'acknowledgement',
  meddle:      'choice', cross_generation: 'collaboration', misunderstood: 'acknowledgement',
  chores:      'collaboration', finance: 'collaboration', flake: 'acknowledgement',
  gossip:      'safety', disrespect: 'dignity',
  self_procrastinate: 'choice', self_direction: 'choice', self_finance: 'boundary_setting',
  self_comparison: 'acknowledgement', self_diet: 'choice',
};
const OUTCOME_MAP = {
  homework: 'transition', screen: 'reset', lateSleep: 'reset',
  procrastinate: 'transition', picky: 'clarify', talkBack: 'clarify',
  messyRoom: 'reset', overtime: 'clarify', blame: 'clarify',
  revision: 'clarify', rush: 'clarify', credit: 'clarify',
  push_blame: 'clarify', marriage: 'clarify', compare: 'clarify',
  meddle: 'clarify', cross_generation: 'clarify', misunderstood: 'reset',
  chores: 'redistribute', finance: 'redistribute', flake: 'clarify',
  gossip: 'clarify', disrespect: 'clarify',
  self_procrastinate: 'transition', self_direction: 'clarify', self_finance: 'clarify',
  self_comparison: 'clarify', self_diet: 'transition',
};

// humorLevel gentle triggers: 涉及尊嚴或權力不對等
const GENTLE_CONFLICT_TYPES = new Set(['respect_dignity', 'boundary_violation']);
const GENTLE_SITUATIONS = new Set(['disrespect', 'overtime', 'cross_generation', 'blame']);

// ── 10. Helpers ────────────────────────────────────────────────────
function hasKeyword(text, kws) {
  for (let i = 0; i < kws.length; i++) {
    if (text.indexOf(kws[i]) !== -1) return true;
  }
  return false;
}

/** 加權分 = Σ len(kw) for matched kw where len >= 2 */
function scoreKeywords(text, kws) {
  let score = 0;
  for (let i = 0; i < kws.length; i++) {
    if (kws[i].length >= 2 && text.indexOf(kws[i]) !== -1) {
      score += kws[i].length;
    }
  }
  return score;
}

/** 依 evidence 判斷 homework 的 conflictType */
function deriveHomeworkConflict(evidenceTokens) {
  if (evidenceTokens.indexOf('ability_gap_explicit') !== -1 ||
      evidenceTokens.indexOf('negation_of_avoidance') !== -1) return 'skill_gap';
  if (evidenceTokens.indexOf('not_started_explicit') !== -1) return 'avoidance';
  return 'unknown';
}

/** 子情境對應的 conflictType（screen 類均移至 deriveScreenConflict 統一閘門）*/
function subSituationConflict(subKey) {
  const m = {
    grandparent_treat_override: 'expectation_gap', grandparent_rules_general: 'expectation_gap',
  };
  return m[subKey] || null;
}

/**
 * screen 衝突全部 evidence 閘門：
 *   screen_time / screen_content → 靜態（時間/內容已明確界定衝突）
 *   screen_hidden_use             → 靜態（隱瞞行為 → 信任）
 *   screen_at_bedtime / screen_at_meals / screen_general
 *     → 需要 stop_resistance_explicit 才判 transition_resistance，否則 unknown
 */
function deriveScreenConflict(subSituationKey, evidenceTokens) {
  if (subSituationKey === 'screen_time')     return 'boundary_violation';
  if (subSituationKey === 'screen_content')  return 'boundary_violation';
  if (subSituationKey === 'screen_hidden_use') return 'trust';
  // screen_at_bedtime / screen_at_meals / screen_general：需要 evidence
  if (evidenceTokens.indexOf('stop_resistance_explicit') !== -1) return 'transition_resistance';
  if (evidenceTokens.indexOf('screen_time_explicit') !== -1)     return 'boundary_violation';
  return 'unknown';
}

function derivePrimaryConflict(situationKey, subSituationKey, evidenceTokens, sharedConflicts) {
  if (!situationKey) {
    return sharedConflicts.length ? sharedConflicts[0] : 'unknown';
  }
  if (situationKey === 'homework') return deriveHomeworkConflict(evidenceTokens);
  if (situationKey === 'screen') return deriveScreenConflict(subSituationKey, evidenceTokens);
  if (subSituationKey) {
    const sc = subSituationConflict(subSituationKey);
    if (sc) return sc;
  }
  return BASE_CONFLICT_MAP[situationKey] || 'unknown';
}

function detectSharedConflicts(input) {
  const hits = [];
  for (let i = 0; i < SHARED_CONFLICT_RULES.length; i++) {
    if (hasKeyword(input, SHARED_CONFLICT_RULES[i].kw)) {
      hits.push(SHARED_CONFLICT_RULES[i].type);
    }
  }
  return hits;
}

function deriveHumorLevel(interactionType, situationKey, primaryConflictType) {
  if (interactionType === 'self') return 'self_directed';
  if (GENTLE_SITUATIONS.has(situationKey) || GENTLE_CONFLICT_TYPES.has(primaryConflictType)) {
    return 'gentle';
  }
  return 'standard';
}

function deriveDomain(targetRole, input) {
  const base = DOMAIN_FROM_TARGET[targetRole] || 'unknown';
  // Finance 覆蓋：僅在 unknown 或 self 領域時偵測
  if ((base === 'unknown' || base === 'self') && hasKeyword(input, FINANCE_KEYWORDS)) {
    return 'finance';
  }
  return base;
}

// ── 11. Main classifier ────────────────────────────────────────────
/**
 * classifyInput(input, options) → ClassificationResult
 *
 * options: string（targetLabel）或 { targetLabel, guidedSelection? }
 */
export function classifyInput(input, options) {
  input = String(input || '');

  // Parse options
  const targetLabel = typeof options === 'string'
    ? options
    : (options && options.targetLabel) || '其他';
  const guided = (typeof options === 'object' && options && options.guidedSelection) || null;

  // ── Step 1: targetRole + roles
  const targetRole = TARGET_MAP[targetLabel] || 'other';
  const speakerRole = SPEAKER_ROLE_FROM_TARGET[targetRole] || 'unknown';
  const interactionType = targetRole === 'self' ? 'self' : 'directed';

  // ── Step 2: Weighted situation detection
  const rules = SITUATION_RULES[targetRole] || [];
  let topScore = MIN_SCORE - 1; // below threshold
  let topKeys = []; // all keys at top score

  for (let i = 0; i < rules.length; i++) {
    const score = scoreKeywords(input, rules[i].kw);
    if (score > topScore) {
      topScore = score;
      topKeys = [rules[i].key];
    } else if (score === topScore && score >= MIN_SCORE) {
      topKeys.push(rules[i].key);
    }
  }

  const hasSituation = topScore >= MIN_SCORE;
  // Pick first (by rule order) as primary; rest are candidates
  let situationKey = hasSituation ? topKeys[0] : null;
  const candidateSituationKeys = hasSituation && topKeys.length > 1 ? topKeys : [];

  // ── Step 3: Sub-situation detection
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
      // No sub-match → _general fallback
      if (!subSituationKey) {
        subSituationKey = situationKey === 'screen'
          ? 'screen_general'
          : 'grandparent_rules_general';
      }
    }
  }

  // ── Step 4: Evidence tokens
  const evidenceTokens = [];
  for (let i = 0; i < EVIDENCE_TOKEN_RULES.length; i++) {
    if (hasKeyword(input, EVIDENCE_TOKEN_RULES[i].kw)) {
      evidenceTokens.push(EVIDENCE_TOKEN_RULES[i].token);
    }
  }

  // ── Step 5: Shared conflicts
  const sharedConflicts = detectSharedConflicts(input);

  // ── Step 6: Conflict types
  const primaryConflictType = derivePrimaryConflict(
    situationKey, subSituationKey, evidenceTokens, sharedConflicts
  );
  const secondaryConflictTypes = sharedConflicts.filter(t => t !== primaryConflictType);

  // ── Step 7: Confidence + source (before guided override)
  let classificationConfidence;
  let classificationSource;

  if (!hasSituation) {
    classificationSource = primaryConflictType !== 'unknown'
      ? ['user_input', 'inferred']
      : ['target_chip', 'inferred'];
    classificationConfidence = 'low';
  } else {
    classificationSource = ['user_input', 'target_chip'];
    const subKey = `${targetRole}:${situationKey}`;
    const hasSubRules = !!SUB_SITUATION_RULES[subKey];
    const isGenericFallback = subSituationKey &&
      (subSituationKey === 'screen_general' || subSituationKey === 'grandparent_rules_general');
    const isTied = topKeys.length > 1;
    classificationConfidence = (hasSubRules && isGenericFallback) || isTied ? 'medium' : 'high';
  }

  // ── Step 8: guidedSelection override（含合法值驗證）
  let guidedSelectionValid = null; // null = 沒有提供 guidedSelection

  if (guided && guided.situationKey) {
    const validSituations = GUIDED_SITUATION_MAP[targetRole] || [];
    const situationValid = validSituations.indexOf(guided.situationKey) !== -1;

    let subValid = true;
    if (situationValid && guided.subSituationKey) {
      const validSubs = GUIDED_SUB_SITUATION_MAP[guided.situationKey] || [];
      subValid = validSubs.indexOf(guided.subSituationKey) !== -1;
    }

    guidedSelectionValid = situationValid && subValid;

    if (!guidedSelectionValid) {
      // 非法選項：不覆寫分類結果，保留文字偵測來源並 append guided_invalid
      classificationSource = classificationSource.concat(['guided_invalid']);
      // 上限降為 medium（防止高分文字偵測被誤以為是「引導確認」的 high）
      if (classificationConfidence === 'high') classificationConfidence = 'medium';
    } else {
      const textConflict = situationKey && situationKey !== guided.situationKey && topScore >= 4;
      situationKey = guided.situationKey;
      if (guided.subSituationKey) subSituationKey = guided.subSituationKey;
      classificationSource = textConflict
        ? ['guided_select', 'text_conflict']
        : ['guided_select', 'user_input'];
      classificationConfidence = textConflict ? 'medium' : 'high';
    }
  }

  // ── Step 9: Derived fields
  const domain = deriveDomain(targetRole, input);
  const subjectRole = SUBJECT_ROLE_FROM_SITUATION[situationKey] || null;
  const subjectKey = SUBJECT_KEY_MAP[situationKey] || 'unknown';
  const primaryNeedType = NEED_MAP[situationKey] || 'unknown';
  const secondaryNeedTypes = [];
  const primaryOutcomeType = OUTCOME_MAP[situationKey] || 'unknown';
  const humorLevel = deriveHumorLevel(interactionType, situationKey || '', primaryConflictType);

  return {
    // 角色欄位
    speakerRole,
    targetRole,
    subjectRole,
    subjectKey,
    interactionType,
    // 場域與情境
    domain,
    situationKey,
    subSituationKey,
    // 衝突與需求
    primaryConflictType,
    secondaryConflictTypes,
    primaryNeedType,
    secondaryNeedTypes,
    primaryOutcomeType,
    // 幽默
    humorLevel,
    // 證據與分類信心
    evidenceTokens,
    candidateSituationKeys,
    classificationSource,
    classificationConfidence,
    guidedSelectionValid,
  };
}
