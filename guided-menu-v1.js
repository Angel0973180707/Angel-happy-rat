/**
 * guided-menu-v1.js — Phase 4 引導選單與補充選項 v1.0
 *
 * 純函式 ES Module。無 DOM 依賴。不接 app.js。
 *
 * 功能：
 *   1. GUIDED_MENU  — 「幫我開個頭」兩層選單（對應 Phase 1 GUIDED_SITUATION_MAP）
 *   2. validateGuidedSelection(targetKey, situationKey, subSituationKey?)
 *      — 驗證選單選擇是否合法（可直接傳給 Phase 1 guidedSelection）
 *   3. buildGuidedInput(targetLabel, situationKey, subSituationKey?)
 *      — 組裝 Phase 1 classifyInput() 第二參數
 *   4. getClarificationOptions(classificationResult, evidenceReport)
 *      — 在 general 層 / low confidence 時回傳補充選項陣列
 *      — 不阻擋輸出；用戶先看幽默內容，再選擇是否補充
 *
 * ClarificationOption schema：
 *   { id, prompt, type: 'guided'|'freetext', targetKey?, options?: { key, label }[] }
 *
 * 補充選項出現條件：
 *   - layer === 'general'
 *   - layer === 'conflict'
 *   - classificationConfidence === 'low'
 *   - specific + high/medium → 不出現（已精準命中）
 */

export const VERSION = 'v1.0-phase4';

// ── 「幫我開個頭」選單（對應 Phase 1 GUIDED_SITUATION_MAP 完整清單）────
// 情境 key 與 Phase 1 相同，不可自行增刪
export const GUIDED_MENU = {

  child: {
    label: '孩子',
    targetLabel: '孩子',
    situations: [
      { key: 'lateSleep',    label: '賴床叫不起來' },
      { key: 'homework',     label: '不寫作業' },
      {
        key: 'screen',
        label: '一直滑手機',
        subSituations: [
          { key: 'screen_time',       label: '超過約定時間' },
          { key: 'screen_content',    label: '看不適合的內容' },
          { key: 'screen_at_bedtime', label: '睡前還在滑' },
          { key: 'screen_at_meals',   label: '吃飯在滑' },
          { key: 'screen_hidden_use', label: '偷偷用' },
          { key: 'screen_general',    label: '說不清楚哪種' },
        ],
      },
      { key: 'procrastinate', label: '什麼都拖' },
      { key: 'picky',         label: '挑食' },
      { key: 'talkBack',      label: '頂嘴回嘴' },
      { key: 'messyRoom',     label: '不收東西' },
    ],
  },

  boss: {
    label: '老闆/主管',
    targetLabel: '老闆',
    situations: [
      { key: 'disrespect', label: '態度差、不尊重' },
      { key: 'overtime',   label: '一直要加班' },
      { key: 'blame',      label: '出問題甩鍋給我' },
    ],
  },

  client: {
    label: '客戶',
    targetLabel: '客戶',
    situations: [
      { key: 'revision', label: '一直改稿' },
      { key: 'rush',     label: '一直催' },
    ],
  },

  coworker: {
    label: '同事',
    targetLabel: '同事',
    situations: [
      { key: 'credit',     label: '搶功勞' },
      { key: 'push_blame', label: '推卸責任' },
    ],
  },

  parents: {
    label: '爸媽/長輩',
    targetLabel: '爸媽',
    situations: [
      {
        key: 'cross_generation',
        label: '爺奶管教方式不同',
        subSituations: [
          { key: 'grandparent_treat_override', label: '爺奶給零食/破規矩' },
          { key: 'grandparent_rules_general',  label: '爺奶一般規矩衝突' },
        ],
      },
      { key: 'marriage', label: '催婚' },
      { key: 'compare',  label: '一直比較別人家' },
      { key: 'meddle',   label: '管太多、干涉生活' },
    ],
  },

  sibling: {
    label: '兄弟姊妹',
    targetLabel: '兄弟姊妹',
    situations: [],   // 尚未定義具體情境，暫用 general 路由
  },

  partner: {
    label: '另一半',
    targetLabel: '另一半',
    situations: [
      { key: 'screen',        label: '一直滑手機' },
      { key: 'chores',        label: '家事不做' },
      { key: 'finance',       label: '用錢問題' },
      { key: 'misunderstood', label: '說不清楚、被誤解' },
    ],
  },

  friend: {
    label: '朋友',
    targetLabel: '朋友',
    situations: [
      { key: 'flake',  label: '說好又放鳥' },
      { key: 'gossip', label: '背後說閒話' },
    ],
  },

  self: {
    label: '自己',
    targetLabel: '自己',
    situations: [
      { key: 'self_procrastinate', label: '一直拖，不想動' },
      { key: 'self_direction',     label: '不知道未來方向' },
      { key: 'self_finance',       label: '用錢習慣/財務問題' },
      { key: 'self_comparison',    label: '覺得自己不如別人' },
      { key: 'self_diet',          label: '飲食/身材困擾' },
    ],
  },

  other: {
    label: '其他',
    targetLabel: '其他',
    situations: [],   // pure general，不提供情境選單
  },
};

// ── 補充選項提示語（小天鼠語氣，不含問卷用語）────────────────────────
const CLARIFY_PROMPTS = {
  child:    '說清楚是哪一種——我嗆得比較準',
  boss:     '補一個字，老闆哪裡讓你撐不住？',
  client:   '說清楚是哪種客戶情況，讓我補一刀',
  coworker: '同事哪裡讓你不對勁？說具體',
  parents:  '說清楚是哪種長輩情況',
  sibling:  '再說一句，我嗆得比較到位',
  partner:  '另一半是哪件事讓你說不出口？',
  friend:   '朋友哪裡讓你煩？說清楚',
  self:     '自己哪一件事說不清楚？補一句',
  other:    '再補一句，我嗆得比較到位',
  _default: '說清楚一點，我補一刀更準',
};

// ── 內部建構 helper ─────────────────────────────────────────────────
function buildGuidedOption(targetKey, targetMenu) {
  const prompt = CLARIFY_PROMPTS[targetKey] || CLARIFY_PROMPTS._default;
  return {
    id: 'specify_situation',
    prompt,
    type: 'guided',
    targetKey,
    options: targetMenu.situations.map(s => ({ key: s.key, label: s.label })),
  };
}

function buildFreetextOption(targetKey) {
  const prompt = CLARIFY_PROMPTS[targetKey] || CLARIFY_PROMPTS._default;
  return {
    id: 'add_detail',
    prompt,
    type: 'freetext',
  };
}

// ── 公開 API ─────────────────────────────────────────────────────────

/**
 * validateGuidedSelection(targetKey, situationKey, subSituationKey?)
 * 驗證選單選擇是否合法（key 必須存在於 GUIDED_MENU）
 *
 * @returns {boolean}
 */
export function validateGuidedSelection(targetKey, situationKey, subSituationKey = null) {
  const targetMenu = GUIDED_MENU[targetKey];
  if (!targetMenu) return false;

  const sit = targetMenu.situations.find(s => s.key === situationKey);
  if (!sit) return false;

  if (subSituationKey !== null) {
    const subs = sit.subSituations || [];
    return subs.some(sub => sub.key === subSituationKey);
  }

  return true;
}

/**
 * buildGuidedInput(targetLabel, situationKey, subSituationKey?)
 * 組裝可直接傳入 Phase 1 classifyInput() 的第二參數。
 *
 * @returns {{ targetLabel: string, guidedSelection: { situationKey: string, subSituationKey?: string } }}
 */
export function buildGuidedInput(targetLabel, situationKey, subSituationKey = null) {
  const gs = { situationKey };
  if (subSituationKey !== null) gs.subSituationKey = subSituationKey;
  return { targetLabel, guidedSelection: gs };
}

/**
 * getClarificationOptions(classificationResult, evidenceReport)
 * 回傳補充選項陣列。
 *
 * 出現條件：layer === 'general' | 'conflict'，或 classificationConfidence === 'low'
 * specific + high/medium → 回傳 []（已精準命中，不問多餘問題）
 *
 * @param {object} classificationResult  Phase 1 classifyInput() 回傳值
 * @param {object} evidenceReport        Phase 2 checkEvidence() 回傳值
 * @returns {ClarificationOption[]}
 */
export function getClarificationOptions(classificationResult, evidenceReport) {
  if (!classificationResult || !evidenceReport) return [];

  const { classificationConfidence, targetRole } = classificationResult;
  const { layer } = evidenceReport;

  // specific + high/medium → 不問
  if (layer === 'specific' &&
      (classificationConfidence === 'high' || classificationConfidence === 'medium')) {
    return [];
  }

  const targetMenu = GUIDED_MENU[targetRole];
  const hasSituations = targetMenu &&
    Array.isArray(targetMenu.situations) &&
    targetMenu.situations.length > 0;

  // general 或 conflict → 建議指定情境（有選單時用 guided，否則用 freetext）
  if (layer === 'general' || layer === 'conflict') {
    if (hasSituations) return [buildGuidedOption(targetRole, targetMenu)];
    return [buildFreetextOption(targetRole)];
  }

  // specific + low confidence → freetext 補充
  if (classificationConfidence === 'low') {
    return [buildFreetextOption(targetRole)];
  }

  return [];
}
