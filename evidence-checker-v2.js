/**
 * evidence-checker-v2.js — Phase 2 Evidence Checker v2.0
 *
 * 純函式 ES module。無 DOM 依賴。不接 app.js。
 * 設計文件：CONTENT-ENGINE-V2-DESIGN.md v1.4.2
 *
 * 輸入：Phase 1 classifyInput() 回傳的 ClassificationResult
 * 輸出：EvidenceReport {
 *   layer:          'specific' | 'conflict' | 'general'
 *   layerKey:       string  — 該層的索引鍵（situationKey | conflictType | domain）
 *   hitTokens:      string[] — 對最終分類「有負重」的 evidenceTokens 子集
 *   layerConfidence:'high' | 'medium' | 'low' | 'unknown'
 * }
 *
 * 分層判定規則：
 *   specific  → situationKey !== null
 *   conflict  → situationKey === null && primaryConflictType !== 'unknown'
 *   general   → situationKey === null && primaryConflictType === 'unknown'
 *
 * hitTokens 過濾原則：
 *   只保留在 SITUATION_TOKEN_MAP / SUB_TOKEN_MAP / CONFLICT_TOKEN_MAP 中
 *   被標記為「與本次分類相關」的 token。
 *   不增加原文沒有的 token，不推斷未被 Phase 1 偵測到的細節。
 */

export const VERSION = 'v2.0-phase2';

// ── 1. 情境 → 相關 evidence tokens ─────────────────────────────────
// 只列「與該情境本身相關」的 token；衝突類型的 token 由 CONFLICT_TOKEN_MAP 補充
const SITUATION_TOKEN_MAP = {
  homework:         ['homework_explicit', 'not_started_explicit', 'ability_gap_explicit', 'negation_of_avoidance', 'procrastinate_mention_explicit'],
  screen:           ['screen_time_explicit', 'stop_resistance_explicit', 'agreed_time_explicit'],
  cross_generation: ['grandparent_explicit', 'parent_rule_explicit', 'treat_override_explicit', 'appeal_to_other_explicit', 'rules_conflict_explicit'],
  chores:           ['chores_mention_explicit'],
  self_procrastinate: ['procrastinate_mention_explicit'],
  procrastinate:    ['procrastinate_mention_explicit'],
  lateSleep:        [],
  picky:            [],
  talkBack:         [],
  messyRoom:        [],
  overtime:         [],
  blame:            [],
  revision:         [],
  rush:             [],
  credit:           [],
  push_blame:       [],
  marriage:         [],
  compare:          [],
  meddle:           [],
  misunderstood:    [],
  finance:          [],
  flake:            [],
  gossip:           [],
  disrespect:       [],
  self_direction:   [],
  self_finance:     [],
  self_comparison:  [],
  self_diet:        [],
};

// ── 2. 子情境 → 相關 tokens（與 SITUATION_TOKEN_MAP 取聯集）─────────
const SUB_TOKEN_MAP = {
  screen_time:               ['screen_time_explicit', 'agreed_time_explicit'],
  screen_at_bedtime:         ['stop_resistance_explicit'],
  screen_at_meals:           ['stop_resistance_explicit'],
  screen_general:            ['stop_resistance_explicit', 'screen_time_explicit'],
  screen_hidden_use:         [],
  screen_content:            [],
  grandparent_treat_override:['grandparent_explicit', 'treat_override_explicit', 'parent_rule_explicit'],
  grandparent_rules_general: ['grandparent_explicit', 'rules_conflict_explicit', 'appeal_to_other_explicit'],
};

// ── 3. 衝突類型 → 足以判定該衝突的 evidence tokens ──────────────────
// 僅列「確認衝突所必需」的 token；其餘情境 token 已由 SITUATION_TOKEN_MAP 處理
const CONFLICT_TOKEN_MAP = {
  avoidance:            ['not_started_explicit', 'procrastinate_mention_explicit'],
  skill_gap:            ['ability_gap_explicit', 'negation_of_avoidance'],
  boundary_violation:   ['screen_time_explicit', 'agreed_time_explicit', 'rules_conflict_explicit'],
  transition_resistance:['stop_resistance_explicit'],
  trust:                [],
  responsibility_gap:   ['chores_mention_explicit'],
  expectation_gap:      ['rules_conflict_explicit', 'appeal_to_other_explicit'],
};

// ── 4. 核心函式 ────────────────────────────────────────────────────
/**
 * checkEvidence(classification) → EvidenceReport
 *
 * classification: Phase 1 classifyInput() 的回傳值
 */
export function checkEvidence(classification) {
  if (!classification || typeof classification !== 'object') {
    return { layer: 'general', layerKey: 'unknown', hitTokens: [], layerConfidence: 'unknown' };
  }

  const {
    situationKey,
    subSituationKey,
    primaryConflictType,
    domain,
    evidenceTokens,
    classificationConfidence,
  } = classification;

  // ── Step 1: 判定層級
  let layer, layerKey;

  if (situationKey) {
    layer = 'specific';
    layerKey = situationKey;
  } else if (primaryConflictType && primaryConflictType !== 'unknown') {
    layer = 'conflict';
    layerKey = primaryConflictType;
  } else {
    layer = 'general';
    layerKey = domain || 'unknown';
  }

  // ── Step 2: 收集與本次分類相關的 token 集合
  const relevant = new Set();

  // 情境相關
  const sTokens = SITUATION_TOKEN_MAP[situationKey] || [];
  sTokens.forEach(t => relevant.add(t));

  // 子情境相關
  if (subSituationKey) {
    const subTokens = SUB_TOKEN_MAP[subSituationKey] || [];
    subTokens.forEach(t => relevant.add(t));
  }

  // 衝突類型相關（evidence-gated 衝突的負重 token）
  if (primaryConflictType && primaryConflictType !== 'unknown') {
    const cTokens = CONFLICT_TOKEN_MAP[primaryConflictType] || [];
    cTokens.forEach(t => relevant.add(t));
  }

  // ── Step 3: 只保留原文中實際出現的相關 token（不增加不存在的）
  const hitTokens = (evidenceTokens || []).filter(t => relevant.has(t));

  return {
    layer,
    layerKey,
    hitTokens,
    layerConfidence: classificationConfidence || 'unknown',
  };
}
