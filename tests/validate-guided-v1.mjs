/**
 * tests/validate-guided-v1.mjs
 * Phase 4 Guided Menu & Clarification Options — table-driven tests
 *
 * 執行：node tests/validate-guided-v1.mjs
 *
 * I1  GUIDED_MENU 結構完整性（8 組）
 * I2  validateGuidedSelection — 合法/非法（8 組）
 * I3  getClarificationOptions — 出現條件（8 組）
 * I4  getClarificationOptions — 內容品質（小天鼠語氣，無問卷用語）（6 組）
 * I5  buildGuidedInput — 組裝 Phase 1 輸入（4 組）
 * I6  整合：guided 路徑通過 Phase 1（4 組）
 * I7  Phase 1/2/3 回歸（既有功能不受影響）（6 組）
 */

import { classifyInput } from '../content-engine-v2.js';
import { checkEvidence } from '../evidence-checker-v2.js';
import { generateRoast } from '../character-generator-v1.js';
import {
  GUIDED_MENU,
  validateGuidedSelection,
  buildGuidedInput,
  getClarificationOptions,
  VERSION,
} from '../guided-menu-v1.js';

/* ── Runner ── */
let passed = 0, failed = 0;
const failures = [];

function assert(label, condition, got) {
  if (condition) { passed++; }
  else { failed++; failures.push({ label, got: JSON.stringify(got) }); }
}

function pipe(input, targetLabel) {
  const c = classifyInput(input, targetLabel);
  const e = checkEvidence(c);
  return { c, e };
}

console.log(`\n笑鼠人了！ guided-menu-v1.js ${VERSION}\n`);

/* ════════════════════════════════════════════════
   I1 GUIDED_MENU 結構完整性
════════════════════════════════════════════════ */
console.log('── I1 GUIDED_MENU 結構 ──');
{
  const EXPECTED_TARGETS = ['child','boss','client','coworker','parents','sibling','partner','friend','self','other'];

  assert('I1-01 所有對象 key 都存在',
    EXPECTED_TARGETS.every(k => k in GUIDED_MENU), EXPECTED_TARGETS.filter(k => !(k in GUIDED_MENU)));

  EXPECTED_TARGETS.forEach(k => {
    const m = GUIDED_MENU[k];
    assert(`I1-02 ${k} 有 label`,        typeof m.label === 'string' && m.label.length > 0, m.label);
    assert(`I1-03 ${k} 有 targetLabel`,   typeof m.targetLabel === 'string' && m.targetLabel.length > 0, m.targetLabel);
    assert(`I1-04 ${k} situations 為陣列`, Array.isArray(m.situations), m.situations);
  });

  // child.screen 有 6 個子情境
  const screen = GUIDED_MENU.child.situations.find(s => s.key === 'screen');
  assert('I1-05 child.screen 有 subSituations',
    screen && Array.isArray(screen.subSituations) && screen.subSituations.length === 6,
    screen && screen.subSituations && screen.subSituations.length);

  // parents.cross_generation 有 subSituations
  const cg = GUIDED_MENU.parents.situations.find(s => s.key === 'cross_generation');
  assert('I1-06 parents.cross_generation 有 2 個子情境',
    cg && Array.isArray(cg.subSituations) && cg.subSituations.length === 2,
    cg && cg.subSituations && cg.subSituations.length);

  // 所有 situation key 為字串
  const allKeys = Object.values(GUIDED_MENU).flatMap(m =>
    m.situations.flatMap(s => [s.key, ...(s.subSituations || []).map(sub => sub.key)])
  );
  assert('I1-07 所有 situation key 為非空字串',
    allKeys.every(k => typeof k === 'string' && k.length > 0), allKeys.filter(k => !k));

  // child 共 7 個頂層情境
  assert('I1-08 child 有 7 個頂層情境',
    GUIDED_MENU.child.situations.length === 7, GUIDED_MENU.child.situations.length);
}

/* ════════════════════════════════════════════════
   I2 validateGuidedSelection — 合法/非法
════════════════════════════════════════════════ */
console.log('── I2 validateGuidedSelection ──');
{
  assert('I2-01 child + homework → true',
    validateGuidedSelection('child', 'homework') === true, false);
  assert('I2-02 child + screen + screen_time → true',
    validateGuidedSelection('child', 'screen', 'screen_time') === true, false);
  assert('I2-03 parents + cross_generation + grandparent_treat_override → true',
    validateGuidedSelection('parents', 'cross_generation', 'grandparent_treat_override') === true, false);

  // 非法：情境不屬於該對象
  assert('I2-04 child + overtime → false（overtime 屬於 boss）',
    validateGuidedSelection('child', 'overtime') === false, true);
  assert('I2-05 boss + lateSleep → false（lateSleep 屬於 child）',
    validateGuidedSelection('boss', 'lateSleep') === false, true);

  // 非法：子情境不存在
  assert('I2-06 child + screen + invalid_sub → false',
    validateGuidedSelection('child', 'screen', 'invalid_sub') === false, true);

  // 非法：targetKey 不存在
  assert('I2-07 unknown_target → false',
    validateGuidedSelection('unknown_target', 'homework') === false, true);

  // 空情境清單的對象
  assert('I2-08 sibling（無情境）+ 任何 key → false',
    validateGuidedSelection('sibling', 'care') === false, true);
}

/* ════════════════════════════════════════════════
   I3 getClarificationOptions — 出現條件
════════════════════════════════════════════════ */
console.log('── I3 getClarificationOptions 出現條件 ──');
{
  // general 層 → 應回傳選項
  const { c: cGen, e: eGen } = pipe('孩子今天讓我很崩潰', '孩子');
  const optsGen = getClarificationOptions(cGen, eGen);
  assert('I3-01 general 層 → 回傳非空陣列', Array.isArray(optsGen) && optsGen.length > 0, optsGen.length);

  // conflict 層 → 應回傳選項
  const { c: cConf, e: eConf } = pipe('感覺太累了，忙不過來，快撐不住', '老闆');
  const optsConf = getClarificationOptions(cConf, eConf);
  assert('I3-02 conflict 層 → 回傳非空陣列', Array.isArray(optsConf) && optsConf.length > 0, optsConf.length);

  // specific + high confidence → 空陣列
  const { c: cHigh, e: eHigh } = pipe('孩子作業還沒開始，沒動筆', '孩子');
  const optsHigh = getClarificationOptions(cHigh, eHigh);
  assert('I3-03 specific + high → []',
    Array.isArray(optsHigh) && optsHigh.length === 0, optsHigh.length);

  // specific + medium confidence → 空陣列
  const { c: cMed, e: eMed } = pipe('孩子玩手機', {
    targetLabel: '孩子',
    guidedSelection: { situationKey: 'screen', subSituationKey: 'screen_time' }
  });
  // guided valid → high; use a case that gives medium
  // Use a case with guided_invalid to get medium
  const { c: cMed2, e: eMed2 } = pipe('孩子玩手機', {
    targetLabel: '孩子',
    guidedSelection: { situationKey: 'screen', subSituationKey: 'invalid_sub' }
  });
  const optsMed = getClarificationOptions(cMed2, eMed2);
  assert('I3-04 guided_invalid（medium）specific → []',
    Array.isArray(optsMed) && optsMed.length === 0, optsMed.length);

  // low confidence → 應回傳選項
  // 找一個 low confidence 的情況：另一半說不尊重我（boundary_violation 與 respect_dignity 衝突邊界，low conf）
  const { c: cLow, e: eLow } = pipe('另一半說不尊重我，看不起我', '另一半');
  const optsLow = getClarificationOptions(cLow, eLow);
  assert('I3-05 low confidence → 回傳非空陣列',
    Array.isArray(optsLow) && optsLow.length > 0, optsLow.length);

  // null 輸入 → []
  assert('I3-06 null 輸入 → []',
    getClarificationOptions(null, null).length === 0, null);

  // specific layer（不論 confidence）的 boss 主管：overtime high → []
  const { c: cBossSpec, e: eBossSpec } = pipe('今天又加班到很晚', '老闆');
  const optsBoss = getClarificationOptions(cBossSpec, eBossSpec);
  assert('I3-07 specific overtime high → []',
    Array.isArray(optsBoss) && optsBoss.length === 0, optsBoss.length);

  // general 層（無情境的 other target）→ freetext
  const { c: cOther, e: eOther } = pipe('今天發生了一件事', '其他');
  const optsOther = getClarificationOptions(cOther, eOther);
  assert('I3-08 general + other（無情境）→ freetext',
    optsOther.length > 0 && optsOther[0].type === 'freetext', optsOther[0] && optsOther[0].type);
}

/* ════════════════════════════════════════════════
   I4 getClarificationOptions — 內容品質（小天鼠語氣）
════════════════════════════════════════════════ */
console.log('── I4 clarificationOptions 內容品質 ──');
{
  const BANNED_SURVEY = ['請問', '您', '建議您', '請選擇', '感受', '填寫'];

  const { c, e } = pipe('孩子今天讓我很崩潰', '孩子');
  const opts = getClarificationOptions(c, e);

  assert('I4-01 選項陣列存在', opts.length > 0, opts.length);

  const opt = opts[0];
  assert('I4-02 選項有 id 欄位',     typeof opt.id === 'string' && opt.id.length > 0, opt.id);
  assert('I4-03 選項有 prompt 欄位', typeof opt.prompt === 'string' && opt.prompt.length > 0, opt.prompt);
  assert('I4-04 選項有 type 欄位',   opt.type === 'guided' || opt.type === 'freetext', opt.type);

  // prompt 不含問卷用語
  assert('I4-05 prompt 無問卷用語',
    !BANNED_SURVEY.some(w => opt.prompt.includes(w)), opt.prompt);

  // guided 型選項的 options 陣列有 key 和 label
  if (opt.type === 'guided') {
    assert('I4-06 guided options 每項有 key+label',
      Array.isArray(opt.options) && opt.options.every(o => o.key && o.label),
      opt.options && opt.options.slice(0, 2));
  } else {
    assert('I4-06 freetext 無 options 欄位（或 undefined）',
      !('options' in opt) || opt.options === undefined, opt);
  }
}

/* ════════════════════════════════════════════════
   I5 buildGuidedInput — 組裝 Phase 1 輸入
════════════════════════════════════════════════ */
console.log('── I5 buildGuidedInput ──');
{
  const g1 = buildGuidedInput('孩子', 'homework');
  assert('I5-01 無子情境 → guidedSelection 有 situationKey',
    g1.targetLabel === '孩子' && g1.guidedSelection.situationKey === 'homework',
    g1);
  assert('I5-02 無子情境 → guidedSelection 無 subSituationKey',
    !('subSituationKey' in g1.guidedSelection),
    g1.guidedSelection);

  const g2 = buildGuidedInput('孩子', 'screen', 'screen_time');
  assert('I5-03 有子情境 → guidedSelection 有 subSituationKey',
    g2.guidedSelection.situationKey === 'screen' && g2.guidedSelection.subSituationKey === 'screen_time',
    g2);
  assert('I5-04 targetLabel 正確傳遞',
    g2.targetLabel === '孩子', g2.targetLabel);
}

/* ════════════════════════════════════════════════
   I6 整合：guided 路徑通過 Phase 1 → Phase 2 → Phase 3
════════════════════════════════════════════════ */
console.log('── I6 整合：guided 路徑 ──');
{
  // homework guided
  const gInput1 = buildGuidedInput('孩子', 'homework');
  const c1 = classifyInput('孩子不想動', gInput1);
  assert('I6-01 guided homework → situationKey = homework',
    c1.situationKey === 'homework', c1.situationKey);
  assert('I6-02 guided homework → guidedSelectionValid = true',
    c1.guidedSelectionValid === true, c1.guidedSelectionValid);

  // screen + screen_time guided
  const gInput2 = buildGuidedInput('孩子', 'screen', 'screen_time');
  const c2 = classifyInput('孩子看手機', gInput2);
  assert('I6-03 guided screen+screen_time → subSituationKey = screen_time',
    c2.subSituationKey === 'screen_time', c2.subSituationKey);

  // invalid guided → guidedSelectionValid = false，classificationSource 含 guided_invalid
  const gInput3 = buildGuidedInput('孩子', 'overtime');   // overtime 屬於 boss，不合法
  const c3 = classifyInput('孩子加班', gInput3);
  assert('I6-04 invalid guided → guidedSelectionValid = false',
    c3.guidedSelectionValid === false, c3.guidedSelectionValid);
}

/* ════════════════════════════════════════════════
   I7 Phase 1/2/3 回歸（既有功能不受影響）
════════════════════════════════════════════════ */
console.log('── I7 Phase 1/2/3 回歸 ──');
{
  // Phase 1 正常分類不受 guided-menu 模組影響
  const c1 = classifyInput('孩子不寫作業', '孩子');
  assert('I7-01 Phase 1 homework 正常',
    c1.situationKey === 'homework', c1.situationKey);

  // Phase 2 正常 evidence check
  const e1 = checkEvidence(c1);
  assert('I7-02 Phase 2 homework specific 正常',
    e1.layer === 'specific' && e1.layerKey === 'homework', [e1.layer, e1.layerKey]);

  // Phase 3 generator 仍可正常生成（不受 guided-menu 引入影響）
  const r1 = generateRoast(e1, { targetKey: 'child', input: '孩子不寫作業' });
  assert('I7-03 Phase 3 generator 正常回傳', r1 !== null, r1);
  assert('I7-04 Phase 3 mouseOutput 完整', r1 && r1.mouseOutput.truth.length > 0, r1 && r1.mouseOutput.truth);

  // getClarificationOptions 在 specific+high 時不干擾輸出
  const opts = getClarificationOptions(c1, e1);
  assert('I7-05 specific+high → clarificationOptions 為 []',
    Array.isArray(opts) && opts.length === 0, opts.length);

  // Phase 1 回歸：marriage still works
  const c2 = classifyInput('爸媽逼婚，催婚', '爸媽');
  assert('I7-06 Phase 1 marriage 回歸',
    c2.situationKey === 'marriage', c2.situationKey);
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
