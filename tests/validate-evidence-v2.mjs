/**
 * tests/validate-evidence-v2.mjs
 * Phase 2 Evidence Checker — table-driven tests
 *
 * 執行：node tests/validate-evidence-v2.mjs
 *
 * E1  Specific 層：情境命中（12 組）
 * E2  Specific 層：hitTokens 負重過濾（8 組）
 * E3  Conflict 層：無具體情境，共用衝突識別（6 組）
 * E4  General 層：無情境無衝突，domain fallback（4 組）
 * E5  Schema 與邊界（5 組）
 */

import { classifyInput } from '../content-engine-v2.js';
import { checkEvidence, VERSION } from '../evidence-checker-v2.js';

/* ── Runner ── */
let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, got) {
  if (condition) { passed++; }
  else { failed++; failures.push({ label, got: JSON.stringify(got) }); }
}
function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) !== -1; }
function notIn(arr, v) { return !Array.isArray(arr) || arr.indexOf(v) === -1; }

/** 便捷函式：先 Phase 1 分類，再 Phase 2 Evidence Check */
function check(input, options) {
  return checkEvidence(classifyInput(input, options));
}

console.log(`\n笑鼠人了！ evidence-checker-v2.js ${VERSION}\n`);

/* ════════════════════════════════════════════════
   E1 Specific 層：情境命中（12 組）
════════════════════════════════════════════════ */
console.log('── E1 Specific 層命中 ──');
{
  const r = check('孩子不想寫作業', '孩子');
  assert('E1-01 homework → specific', r.layer === 'specific', r.layer);
  assert('E1-01 layerKey = homework', r.layerKey === 'homework', r.layerKey);
}
{
  const r = check('早上叫不起來，鬧鐘響了也不動', '孩子');
  assert('E1-02 lateSleep → specific', r.layer === 'specific', r.layer);
  assert('E1-02 layerKey = lateSleep', r.layerKey === 'lateSleep', r.layerKey);
}
{
  const r = check('到了約定時間孩子不關手機', '孩子');
  assert('E1-03 screen → specific', r.layer === 'specific', r.layer);
  assert('E1-03 layerKey = screen', r.layerKey === 'screen', r.layerKey);
}
{
  const r = check('爸媽說不能吃糖，爺奶說沒關係', '爸媽');
  assert('E1-04 cross_generation → specific', r.layer === 'specific', r.layer);
  assert('E1-04 layerKey = cross_generation', r.layerKey === 'cross_generation', r.layerKey);
}
{
  const r = check('老闆語氣差，不尊重', '老闆');
  assert('E1-05 disrespect → specific', r.layer === 'specific', r.layer);
  assert('E1-05 layerKey = disrespect', r.layerKey === 'disrespect', r.layerKey);
}
{
  const r = check('今天又加班到很晚', '老闆');
  assert('E1-06 overtime → specific', r.layer === 'specific', r.layer);
}
{
  const r = check('客戶催稿，催進度', '客戶');
  assert('E1-07 rush → specific', r.layer === 'specific', r.layer);
  assert('E1-07 layerKey = rush', r.layerKey === 'rush', r.layerKey);
}
{
  const r = check('同事搶功，說是他做的', '同事');
  assert('E1-08 credit → specific', r.layer === 'specific', r.layer);
}
{
  const r = check('另一半一直滑手機', '另一半');
  assert('E1-09 partner screen → specific', r.layer === 'specific', r.layer);
  assert('E1-09 layerKey = screen', r.layerKey === 'screen', r.layerKey);
}
{
  const r = check('我一直拖延，不想動', '自己');
  assert('E1-10 self_procrastinate → specific', r.layer === 'specific', r.layer);
  assert('E1-10 layerKey = self_procrastinate', r.layerKey === 'self_procrastinate', r.layerKey);
}
{
  const r = check('不知道未來方向，感覺很迷惘', '自己');
  assert('E1-11 self_direction → specific', r.layer === 'specific', r.layer);
  assert('E1-11 layerKey = self_direction', r.layerKey === 'self_direction', r.layerKey);
}
{
  const r = check('爸媽逼婚，催婚', '爸媽');
  assert('E1-12 marriage → specific', r.layer === 'specific', r.layer);
  assert('E1-12 layerKey = marriage', r.layerKey === 'marriage', r.layerKey);
}

/* ════════════════════════════════════════════════
   E2 Specific 層：hitTokens 負重過濾（8 組）
════════════════════════════════════════════════ */
console.log('── E2 hitTokens 負重過濾 ──');
{
  // homework + not_started → hitTokens 包含這兩個
  const r = check('孩子作業還沒開始，沒動筆', '孩子');
  assert('E2-01 homework_explicit in hitTokens', has(r.hitTokens, 'homework_explicit'), r.hitTokens);
  assert('E2-01 not_started_explicit in hitTokens', has(r.hitTokens, 'not_started_explicit'), r.hitTokens);
}
{
  // homework + ability_gap → hitTokens 包含 ability_gap，不含 not_started
  const r = check('孩子作業不會做，學不來', '孩子');
  assert('E2-02 ability_gap_explicit in hitTokens', has(r.hitTokens, 'ability_gap_explicit'), r.hitTokens);
  assert('E2-02 not_started NOT in hitTokens（無此證據）', notIn(r.hitTokens, 'not_started_explicit'), r.hitTokens);
}
{
  // 「作業」同時觸發情境 kw 與 homework_explicit token → hitTokens 含 homework_explicit
  // 但沒有 not_started / ability_gap 等衝突 token → 不含這些
  const r = check('孩子的作業放在桌上', '孩子');
  assert('E2-03 homework_explicit 是情境負重 token', has(r.hitTokens, 'homework_explicit'), r.hitTokens);
  assert('E2-03 not_started 無 evidence → 不在 hitTokens', notIn(r.hitTokens, 'not_started_explicit'), r.hitTokens);
  assert('E2-03 ability_gap 無 evidence → 不在 hitTokens', notIn(r.hitTokens, 'ability_gap_explicit'), r.hitTokens);
}
{
  // screen_time → hitTokens 包含 screen_time_explicit
  const r = check('到了約定時間孩子不關手機', '孩子');
  assert('E2-04 screen_time → screen_time_explicit in hitTokens', has(r.hitTokens, 'screen_time_explicit'), r.hitTokens);
}
{
  // screen_hidden_use → hitTokens 為空（目前無相關 token）
  const r = check('孩子偷偷用手機，以為我不知道', '孩子');
  assert('E2-05 screen_hidden_use → hitTokens 空', r.hitTokens.length === 0, r.hitTokens);
}
{
  // cross_generation + 糖 → grandparent_explicit + treat_override_explicit
  const r = check('爸媽說不能吃糖，爺奶卻說沒關係', '爸媽');
  assert('E2-06 grandparent_explicit in hitTokens', has(r.hitTokens, 'grandparent_explicit'), r.hitTokens);
  assert('E2-06 treat_override_explicit in hitTokens', has(r.hitTokens, 'treat_override_explicit'), r.hitTokens);
}
{
  // stop_resistance → stop_resistance_explicit
  const r = check('孩子不肯停，不放下手機', '孩子');
  assert('E2-07 stop_resistance_explicit in hitTokens', has(r.hitTokens, 'stop_resistance_explicit'), r.hitTokens);
}
{
  // 非 screen 情境：lateSleep 無相關 token → hitTokens 空
  const r = check('早上叫不起來，鬧鐘響了不動', '孩子');
  assert('E2-08 lateSleep hitTokens 空', r.hitTokens.length === 0, r.hitTokens);
}

/* ════════════════════════════════════════════════
   E3 Conflict 層：無具體情境（6 組）
════════════════════════════════════════════════ */
console.log('── E3 Conflict 層 ──');
{
  // 太累 → overload shared conflict → conflict layer
  const r = check('太累了，撐不住，壓力太大', '孩子');
  assert('E3-01 overload → conflict', r.layer === 'conflict', r.layer);
  assert('E3-01 layerKey = overload', r.layerKey === 'overload', r.layerKey);
}
{
  // 不確定/迷惘 (同事) → uncertainty
  const r = check('不確定接下來該怎麼辦，沒有答案', '同事');
  assert('E3-02 uncertainty → conflict', r.layer === 'conflict', r.layer);
  assert('E3-02 layerKey = uncertainty', r.layerKey === 'uncertainty', r.layerKey);
}
{
  // 別人比較好 (其他) → comparison
  const r = check('為什麼別人都比我好，跟別人比差好多', '其他');
  assert('E3-03 comparison → conflict', r.layer === 'conflict', r.layer);
  assert('E3-03 layerKey = comparison', r.layerKey === 'comparison', r.layerKey);
}
{
  // 態度差+看不起（避免「不尊重我」同時觸發 boundary_violation，讓 respect_dignity 唯一命中）
  const r = check('另一半態度差，看不起人', '另一半');
  assert('E3-04 respect_dignity → conflict', r.layer === 'conflict', r.layer);
  assert('E3-04 layerKey = respect_dignity', r.layerKey === 'respect_dignity', r.layerKey);
}
{
  // conflict 層 hitTokens：無 Phase 1 evidenceToken 與 conflict 直接相關 → 空
  const r = check('太累了，撐不住', '孩子');
  assert('E3-05 conflict hitTokens 為空', r.hitTokens.length === 0, r.hitTokens);
}
{
  // conflict 層 layerConfidence 繼承 Phase 1
  const r = check('另一半說不尊重我，看不起我', '另一半');
  assert('E3-06 conflict layerConfidence = low', r.layerConfidence === 'low', r.layerConfidence);
}

/* ════════════════════════════════════════════════
   E4 General 層：無情境無衝突（4 組）
════════════════════════════════════════════════ */
console.log('── E4 General 層 ──');
{
  const r = check('今天天氣很好', '孩子');
  assert('E4-01 無信號 → general', r.layer === 'general', r.layer);
  assert('E4-01 layerKey = parenting', r.layerKey === 'parenting', r.layerKey);
}
{
  const r = check('', '老闆');
  assert('E4-02 空輸入 → general', r.layer === 'general', r.layer);
  assert('E4-02 layerKey = workplace', r.layerKey === 'workplace', r.layerKey);
}
{
  const r = check('今天發生了一件事', '其他');
  assert('E4-03 其他無 kw → general unknown', r.layer === 'general', r.layer);
  assert('E4-03 layerKey = unknown', r.layerKey === 'unknown', r.layerKey);
}
{
  // general 層 hitTokens 必為空
  const r = check('今天天氣很好', '自己');
  assert('E4-04 general hitTokens 空', r.hitTokens.length === 0, r.hitTokens);
}

/* ════════════════════════════════════════════════
   E5 Schema 與邊界（5 組）
════════════════════════════════════════════════ */
console.log('── E5 Schema 與邊界 ──');
{
  // 回傳物件必須有四個欄位
  const r = check('孩子不寫作業', '孩子');
  assert('E5-01 layer 存在', 'layer' in r, Object.keys(r));
  assert('E5-01 layerKey 存在', 'layerKey' in r, Object.keys(r));
  assert('E5-01 hitTokens 存在且為陣列', Array.isArray(r.hitTokens), r.hitTokens);
  assert('E5-01 layerConfidence 存在', 'layerConfidence' in r, Object.keys(r));
}
{
  // hitTokens 只能包含 Phase 1 evidenceTokens 中已有的值（不增加新 token）
  const c1 = classifyInput('孩子的作業還沒開始，沒動筆', '孩子');
  const r = checkEvidence(c1);
  const illegal = r.hitTokens.filter(t => c1.evidenceTokens.indexOf(t) === -1);
  assert('E5-02 hitTokens 不含 Phase 1 未出現的 token', illegal.length === 0, illegal);
}
{
  // null / undefined 輸入 → 不崩潰，回傳 general + unknown
  const r = checkEvidence(null);
  assert('E5-03 null → general', r.layer === 'general', r.layer);
  assert('E5-03 null → layerKey unknown', r.layerKey === 'unknown', r.layerKey);
}
{
  // layerConfidence 繼承 Phase 1 分類信心（high / medium / low）
  const r = check('孩子的功課還沒開始，沒動筆', '孩子');
  assert('E5-04 specific layerConfidence = high', r.layerConfidence === 'high', r.layerConfidence);
}
{
  // guidedSelection 合法時 layer 仍以 situationKey 為準
  const r = check('孩子玩手機', {
    targetLabel: '孩子',
    guidedSelection: { situationKey: 'screen', subSituationKey: 'screen_time' }
  });
  assert('E5-05 guided valid → specific', r.layer === 'specific', r.layer);
  assert('E5-05 guided layerKey = screen', r.layerKey === 'screen', r.layerKey);
}

/* ════════════════════════════════════════════════
   結果
════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(60));
if (failures.length) {
  console.log('\n❌ 失敗項目：');
  failures.forEach(f => console.log(`  • ${f.label}  got: ${f.got}`));
}
console.log(`\n✅ Passed: ${passed}   ❌ Failed: ${failed}   Total: ${passed + failed}`);
if (failed === 0) console.log('\n✅ 所有測試通過。\n');
else { console.log('\n❌ 有測試失敗。\n'); process.exit(1); }
