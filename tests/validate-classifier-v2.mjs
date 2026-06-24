/**
 * tests/validate-classifier-v2.mjs
 * Phase 1 Classifier 獨立 table-driven 測試
 *
 * 執行：node tests/validate-classifier-v2.mjs
 *
 * 分組：
 *   C1   情境辨識（situationKey 正確命中）
 *   C2   子情境辨識（subSituationKey + screen fallback）
 *   C3   信心等級（confidence high / medium / low）
 *   C4   Evidence tokens 收集
 *   C5   Speaker role 推斷
 *   C6   衝突類型（primaryConflictType）
 *   C7   邊界與 fallback（無關鍵字 / 跨目標歧義）
 */

import { classifyInput, VERSION } from '../content-engine-v2.js';

/* ── Test runner ── */
let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, got) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push({ label, got });
  }
}

function eq(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function includes(arr, item) {
  return Array.isArray(arr) && arr.indexOf(item) !== -1;
}

console.log(`\n笑鼠人了！ content-engine-v2.js ${VERSION} — 分類器測試\n`);

/* ════════════════════════════════════════════════
   C1 情境辨識
════════════════════════════════════════════════ */
console.log('── C1 情境辨識 ──');

{
  const r = classifyInput('孩子一直不想寫作業，坐在那邊發呆', '孩子');
  assert('C1-01 homework 命中', r.situationKey === 'homework', r.situationKey);
  assert('C1-01 targetRole child', r.targetRole === 'child', r.targetRole);
}
{
  const r = classifyInput('早上叫不起來，鬧鐘響了三次還是不動', '孩子');
  assert('C1-02 lateSleep 命中', r.situationKey === 'lateSleep', r.situationKey);
}
{
  const r = classifyInput('孩子一直玩手機，叫他放下就說等一下', '孩子');
  assert('C1-03 screen 命中（無子關鍵字）', r.situationKey === 'screen', r.situationKey);
}
{
  const r = classifyInput('孩子說頂嘴，講他他就反嗆回來', '孩子');
  assert('C1-04 talkBack 命中', r.situationKey === 'talkBack', r.situationKey);
}
{
  const r = classifyInput('玩具不收，到處都是，地上根本沒辦法走', '孩子');
  assert('C1-05 messyRoom 命中', r.situationKey === 'messyRoom', r.situationKey);
}
{
  const r = classifyInput('今天又加班到很晚，假日也被叫回來', '老闆');
  assert('C1-06 overtime 命中', r.situationKey === 'overtime', r.situationKey);
  assert('C1-06 targetRole boss', r.targetRole === 'boss', r.targetRole);
}
{
  const r = classifyInput('背鍋了，說是我的問題，明明不是我決定的', '老闆');
  assert('C1-07 blame 命中', r.situationKey === 'blame', r.situationKey);
}
{
  const r = classifyInput('客戶說稿子不對，要改，改完又說再調整', '客戶');
  assert('C1-08 revision 命中', r.situationKey === 'revision', r.situationKey);
}
{
  const r = classifyInput('同事把我做的報告說成他的，老闆都誇他', '同事');
  assert('C1-09 credit 命中', r.situationKey === 'credit', r.situationKey);
}
{
  const r = classifyInput('爸媽一直催婚，說年紀到了，再不找就來不及', '爸媽');
  assert('C1-10 marriage 命中', r.situationKey === 'marriage', r.situationKey);
  assert('C1-10 targetRole parents', r.targetRole === 'parents', r.targetRole);
}
{
  const r = classifyInput('朋友說好要來，臨時取消，也沒說原因', '朋友');
  assert('C1-11 flake 命中', r.situationKey === 'flake', r.situationKey);
}
{
  const r = classifyInput('另一半說家事都是我在做，他從來沒分擔', '另一半');
  assert('C1-12 chores 命中', r.situationKey === 'chores', r.situationKey);
}

/* ════════════════════════════════════════════════
   C2 子情境辨識
════════════════════════════════════════════════ */
console.log('── C2 子情境辨識 ──');

{
  const r = classifyInput('到了約定時間，孩子還不肯關手機', '孩子');
  assert('C2-01 screen_time 命中', r.subSituationKey === 'screen_time', r.subSituationKey);
}
{
  const r = classifyInput('孩子睡前還在玩平板，催了也不睡', '孩子');
  assert('C2-02 screen_at_bedtime 命中', r.subSituationKey === 'screen_at_bedtime', r.subSituationKey);
}
{
  const r = classifyInput('吃飯時孩子一直看電視，叫他放下不理', '孩子');
  assert('C2-03 screen_at_meals 命中', r.subSituationKey === 'screen_at_meals', r.subSituationKey);
}
{
  const r = classifyInput('孩子偷偷拿我手機在玩，以為我不知道', '孩子');
  assert('C2-04 screen_hidden_use 命中', r.subSituationKey === 'screen_hidden_use', r.subSituationKey);
}
{
  const r = classifyInput('孩子看不適合的影片，暴力內容', '孩子');
  assert('C2-05 screen_content 命中', r.subSituationKey === 'screen_content', r.subSituationKey);
}
{
  // screen 但沒有子關鍵字 → screen_general
  const r = classifyInput('孩子一直玩手機，叫他放下說等一下', '孩子');
  assert('C2-06 screen_general fallback', r.subSituationKey === 'screen_general', r.subSituationKey);
}
{
  // cross_generation 有糖關鍵字 → grandparent_treat_override
  const r = classifyInput('爸媽說不能再吃糖，爺奶卻說沒關係', '爸媽');
  assert('C2-07 grandparent_treat_override', r.subSituationKey === 'grandparent_treat_override', r.subSituationKey);
  assert('C2-07 cross_generation situationKey', r.situationKey === 'cross_generation', r.situationKey);
}
{
  // cross_generation 無糖關鍵字 → grandparent_rules_general
  const r = classifyInput('爺爺奶奶和我們說的規定不一樣，孩子搞不清楚', '爸媽');
  assert('C2-08 grandparent_rules_general fallback', r.subSituationKey === 'grandparent_rules_general', r.subSituationKey);
}
{
  // 情境無子情境規則 → subSituationKey = null
  const r = classifyInput('孩子說頂嘴，講他就反嗆', '孩子');
  assert('C2-09 talkBack subSituationKey = null', r.subSituationKey === null, r.subSituationKey);
}

/* ════════════════════════════════════════════════
   C3 信心等級
════════════════════════════════════════════════ */
console.log('── C3 信心等級 ──');

{
  const r = classifyInput('孩子一直不想寫作業', '孩子');
  assert('C3-01 homework → high', r.classificationConfidence === 'high', r.classificationConfidence);
  assert('C3-01 source keyword_match', r.classificationSource === 'keyword_match', r.classificationSource);
}
{
  const r = classifyInput('到了約定時間孩子不關手機', '孩子');
  assert('C3-02 screen_time → high', r.classificationConfidence === 'high', r.classificationConfidence);
}
{
  // screen + 無子關鍵字 → medium
  const r = classifyInput('孩子一直玩手機叫他放下說等一下', '孩子');
  assert('C3-03 screen_general → medium', r.classificationConfidence === 'medium', r.classificationConfidence);
}
{
  // cross_generation + 無具體子關鍵字 → medium
  const r = classifyInput('爺爺奶奶說法和我們不一樣', '爸媽');
  assert('C3-04 cross_generation_general → medium', r.classificationConfidence === 'medium', r.classificationConfidence);
}
{
  // 無關鍵字 → low
  const r = classifyInput('今天天氣很好，心情不錯', '孩子');
  assert('C3-05 fallback → low', r.classificationConfidence === 'low', r.classificationConfidence);
  assert('C3-05 source fallback', r.classificationSource === 'fallback', r.classificationSource);
  assert('C3-05 situationKey = null', r.situationKey === null, r.situationKey);
}

/* ════════════════════════════════════════════════
   C4 Evidence tokens
════════════════════════════════════════════════ */
console.log('── C4 Evidence tokens ──');

{
  const r = classifyInput('孩子拖著不開始寫作業，沒動筆', '孩子');
  assert('C4-01 homework_explicit', includes(r.evidenceTokens, 'homework_explicit'), r.evidenceTokens.join());
  assert('C4-01 not_started_explicit', includes(r.evidenceTokens, 'not_started_explicit'), r.evidenceTokens.join());
}
{
  const r = classifyInput('到了約定時間，孩子還不肯關手機', '孩子');
  assert('C4-02 screen_time_explicit', includes(r.evidenceTokens, 'screen_time_explicit'), r.evidenceTokens.join());
  assert('C4-02 stop_resistance_explicit', includes(r.evidenceTokens, 'stop_resistance_explicit'), r.evidenceTokens.join());
}
{
  const r = classifyInput('爸媽說不能再吃糖，爺奶卻說沒關係', '爸媽');
  assert('C4-03 grandparent_explicit', includes(r.evidenceTokens, 'grandparent_explicit'), r.evidenceTokens.join());
  assert('C4-03 treat_override_explicit', includes(r.evidenceTokens, 'treat_override_explicit'), r.evidenceTokens.join());
  assert('C4-03 parent_rule_explicit', includes(r.evidenceTokens, 'parent_rule_explicit'), r.evidenceTokens.join());
}
{
  const r = classifyInput('說好的規定不遵守，說了等一下', '孩子');
  assert('C4-04 rules_conflict_explicit', includes(r.evidenceTokens, 'rules_conflict_explicit'), r.evidenceTokens.join());
  assert('C4-04 procrastinate_mention_explicit', includes(r.evidenceTokens, 'procrastinate_mention_explicit'), r.evidenceTokens.join());
}
{
  // 無 evidence 輸入 → empty array
  const r = classifyInput('今天心情很差', '其他');
  assert('C4-05 無 token → empty', r.evidenceTokens.length === 0, r.evidenceTokens.join());
}

/* ════════════════════════════════════════════════
   C5 Speaker role
════════════════════════════════════════════════ */
console.log('── C5 Speaker role ──');

{
  const r = classifyInput('孩子不寫作業', '孩子');
  assert('C5-01 child → caregiver', r.speakerRole === 'caregiver', r.speakerRole);
}
{
  const r = classifyInput('老闆叫我加班', '老闆');
  assert('C5-02 boss → employee', r.speakerRole === 'employee', r.speakerRole);
}
{
  const r = classifyInput('客戶一直叫我改稿', '客戶');
  assert('C5-03 client → employee', r.speakerRole === 'employee', r.speakerRole);
}
{
  const r = classifyInput('爸媽催婚', '爸媽');
  assert('C5-04 parents → adult_child', r.speakerRole === 'adult_child', r.speakerRole);
}
{
  const r = classifyInput('另一半不做家事', '另一半');
  assert('C5-05 partner → partner', r.speakerRole === 'partner', r.speakerRole);
}
{
  const r = classifyInput('朋友爽約', '朋友');
  assert('C5-06 friend → friend', r.speakerRole === 'friend', r.speakerRole);
}

/* ════════════════════════════════════════════════
   C6 衝突類型
════════════════════════════════════════════════ */
console.log('── C6 primaryConflictType ──');

{
  const r = classifyInput('孩子不寫作業', '孩子');
  assert('C6-01 homework → avoidance', r.primaryConflictType === 'avoidance', r.primaryConflictType);
}
{
  const r = classifyInput('到了約定時間不肯關手機', '孩子');
  assert('C6-02 screen → time_conflict', r.primaryConflictType === 'time_conflict', r.primaryConflictType);
}
{
  const r = classifyInput('爸媽說不能再吃糖，爺奶卻說沒關係', '爸媽');
  assert('C6-03 cross_generation → cross_generation', r.primaryConflictType === 'cross_generation', r.primaryConflictType);
}
{
  const r = classifyInput('爸媽催婚說年紀大了', '爸媽');
  assert('C6-04 marriage → autonomy', r.primaryConflictType === 'autonomy', r.primaryConflictType);
}
{
  const r = classifyInput('今天天氣很好', '孩子');
  assert('C6-05 fallback → unknown', r.primaryConflictType === 'unknown', r.primaryConflictType);
}

/* ════════════════════════════════════════════════
   C7 邊界與 fallback
════════════════════════════════════════════════ */
console.log('── C7 邊界與 fallback ──');

{
  // 完全無關輸入
  const r = classifyInput('今天天氣不錯，心情還可以', '其他');
  assert('C7-01 無關輸入 situationKey = null', r.situationKey === null, r.situationKey);
  assert('C7-01 confidence = low', r.classificationConfidence === 'low', r.classificationConfidence);
  assert('C7-01 subSituationKey = null', r.subSituationKey === null, r.subSituationKey);
}
{
  // 未知 targetLabel → other
  const r = classifyInput('不知道怎麼辦', '不存在的選項');
  assert('C7-02 未知 target → other', r.targetRole === 'other', r.targetRole);
  assert('C7-02 speakerRole → other', r.speakerRole === 'other', r.speakerRole);
}
{
  // 關鍵字優先序：lateSleep 先於 screen（都有）
  const r = classifyInput('早上起不來，說要看手機才肯起', '孩子');
  assert('C7-03 lateSleep 優先（在 screen 之前）', r.situationKey === 'lateSleep', r.situationKey);
}
{
  // 空字串輸入 → fallback
  const r = classifyInput('', '孩子');
  assert('C7-04 空輸入 → null situationKey', r.situationKey === null, r.situationKey);
  assert('C7-04 空輸入 → low', r.classificationConfidence === 'low', r.classificationConfidence);
}
{
  // 爸媽/長輩 兩種寫法都 map 到 parents
  const r1 = classifyInput('爺爺說可以吃糖', '爸媽');
  const r2 = classifyInput('爺爺說可以吃糖', '爸媽/長輩');
  assert('C7-05 爸媽 === 爸媽/長輩', r1.targetRole === r2.targetRole, `${r1.targetRole} vs ${r2.targetRole}`);
}

/* ════════════════════════════════════════════════
   結果
════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(60));
if (failures.length) {
  console.log('\n❌ 失敗項目：');
  failures.forEach(f => console.log(`  • ${f.label}  got: ${JSON.stringify(f.got)}`));
}
console.log(`\n✅ Passed: ${passed}   ❌ Failed: ${failed}   Total: ${passed + failed}`);
if (failed === 0) console.log('\n✅ 所有測試通過。\n');
else { console.log('\n❌ 有測試失敗，請修正後再提交。\n'); process.exit(1); }
