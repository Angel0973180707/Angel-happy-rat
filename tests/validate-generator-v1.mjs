/**
 * tests/validate-generator-v1.mjs
 * Phase 3 Character Generator — table-driven tests
 *
 * 執行：node tests/validate-generator-v1.mjs
 *
 * G1  Schema 完整性（16 組）
 * G2  comicWorld 一致性（6 組）
 * G3  小天鼠角色標記（directRoast / selfOwn / comicExit）（6 組）
 * G4  唬爛虎三級誇飾（l1 / l2 / landing）（6 組）
 * G5  無捏造細節（BANNED_PATTERNS 掃描）（6 組）
 * G6  角色互換測試必須失敗（4 組）
 * G7  三層路由（specific / conflict / general）（6 組）
 * G8  {input} 替換（general 層 truth）（3 組）
 * G9  邊界容錯（3 組）
 */

import { classifyInput } from '../content-engine-v2.js';
import { checkEvidence } from '../evidence-checker-v2.js';
import {
  generateRoast,
  isMouseOutput,
  isTigerOutput,
  BANNED_PATTERNS,
  VERSION,
} from '../character-generator-v1.js';

/* ── Runner ── */
let passed = 0, failed = 0;
const failures = [];

function assert(label, condition, got) {
  if (condition) { passed++; }
  else { failed++; failures.push({ label, got: JSON.stringify(got) }); }
}

/** Phase 1 → Phase 2 pipeline helper */
function pipe(input, targetLabel) {
  return checkEvidence(classifyInput(input, targetLabel));
}

console.log(`\n笑鼠人了！ character-generator-v1.js ${VERSION}\n`);

// ── 共用 Fixtures（三層各一）──────────────────────────────────────────
const rSpec = generateRoast(
  pipe('孩子不寫作業', '孩子'),
  { targetKey: 'child', input: '孩子不寫作業' }
);
const rConf = generateRoast(
  pipe('感覺太累了，忙不過來，快撐不住', '老闆'),
  { targetKey: 'boss', input: '感覺太累了，忙不過來，快撐不住' }
);
const rGen = generateRoast(
  pipe('孩子今天讓我很崩潰', '孩子'),
  { targetKey: 'child', input: '孩子今天讓我很崩潰' }
);

/* ════════════════════════════════════════════════
   G1 Schema 完整性
════════════════════════════════════════════════ */
console.log('── G1 Schema 完整性 ──');
{
  const r = rSpec;
  assert('G1-01 result 非 null（specific）',  r !== null, r);
  assert('G1-02 mouseOutput 存在',            r && 'mouseOutput' in r, r);
  assert('G1-03 tigerOutput 存在',            r && 'tigerOutput' in r, r);

  const m = r && r.mouseOutput;
  assert('G1-04 mouse.comicWorld 非空字串',   m && typeof m.comicWorld === 'string' && m.comicWorld.length > 0, m && m.comicWorld);
  assert('G1-05 mouse.truth 非空',            m && m.truth.length > 0,     m && m.truth);
  assert('G1-06 mouse.analogy 非空',          m && m.analogy.length > 0,   m && m.analogy);
  assert('G1-07 mouse.honest 非空',           m && m.honest.length > 0,    m && m.honest);
  assert('G1-08 mouse.boundary 非空',         m && m.boundary.length > 0,  m && m.boundary);
  assert('G1-09 mouse.selfOwn 非空',          m && m.selfOwn.length > 0,   m && m.selfOwn);
  assert('G1-10 mouse.comicExit 非空',        m && m.comicExit.length > 0, m && m.comicExit);
  assert('G1-11 mouse.callback 非空',         m && m.callback.length > 0,  m && m.callback);

  const t = r && r.tigerOutput;
  assert('G1-12 tiger.comicWorld 非空字串',   t && typeof t.comicWorld === 'string' && t.comicWorld.length > 0, t && t.comicWorld);
  assert('G1-13 tiger.l1 非空',              t && t.l1.length > 0,       t && t.l1);
  assert('G1-14 tiger.l2 非空',              t && t.l2.length > 0,       t && t.l2);
  assert('G1-15 tiger.landing 非空',         t && t.landing.length > 0,  t && t.landing);
  assert('G1-16 tiger.callback 非空',        t && t.callback.length > 0, t && t.callback);
}

/* ════════════════════════════════════════════════
   G2 comicWorld 一致性
════════════════════════════════════════════════ */
console.log('── G2 comicWorld 一致性 ──');
{
  assert('G2-01 specific mouse === tiger world',
    rSpec && rSpec.mouseOutput.comicWorld === rSpec.tigerOutput.comicWorld,
    rSpec && [rSpec.mouseOutput.comicWorld, rSpec.tigerOutput.comicWorld]);
  assert('G2-02 conflict mouse === tiger world',
    rConf && rConf.mouseOutput.comicWorld === rConf.tigerOutput.comicWorld,
    rConf && [rConf.mouseOutput.comicWorld, rConf.tigerOutput.comicWorld]);
  assert('G2-03 general  mouse === tiger world',
    rGen  && rGen.mouseOutput.comicWorld  === rGen.tigerOutput.comicWorld,
    rGen  && [rGen.mouseOutput.comicWorld,  rGen.tigerOutput.comicWorld]);

  assert('G2-04 specific comicWorld = chef',
    rSpec && rSpec.mouseOutput.comicWorld === 'chef', rSpec && rSpec.mouseOutput.comicWorld);
  assert('G2-05 conflict comicWorld = weather',
    rConf && rConf.mouseOutput.comicWorld === 'weather', rConf && rConf.mouseOutput.comicWorld);
  assert('G2-06 general  comicWorld = helpdesk',
    rGen  && rGen.mouseOutput.comicWorld  === 'helpdesk', rGen && rGen.mouseOutput.comicWorld);
}

/* ════════════════════════════════════════════════
   G3 小天鼠角色標記
════════════════════════════════════════════════ */
console.log('── G3 小天鼠角色標記 ──');
{
  assert('G3-01 specific mouse.truth 非空（directRoast）',
    rSpec && rSpec.mouseOutput.truth.length > 0, rSpec && rSpec.mouseOutput.truth);
  assert('G3-02 conflict mouse.truth 非空（directRoast）',
    rConf && rConf.mouseOutput.truth.length > 0, rConf && rConf.mouseOutput.truth);

  assert('G3-03 specific mouse.selfOwn 非空',
    rSpec && rSpec.mouseOutput.selfOwn.length > 0, rSpec && rSpec.mouseOutput.selfOwn);
  assert('G3-04 conflict mouse.selfOwn 非空',
    rConf && rConf.mouseOutput.selfOwn.length > 0, rConf && rConf.mouseOutput.selfOwn);

  assert('G3-05 specific mouse.comicExit 非空',
    rSpec && rSpec.mouseOutput.comicExit.length > 0, rSpec && rSpec.mouseOutput.comicExit);

  // comicExit 不含自我撤回語（台階但不撤回界線）
  const SELF_REVOKE = ['可能都是我', '算了', '都是我的問題', '我也懶', '沒資格'];
  assert('G3-06 comicExit 無自我撤回句',
    rSpec && !SELF_REVOKE.some(p => rSpec.mouseOutput.comicExit.includes(p)),
    rSpec && rSpec.mouseOutput.comicExit);
}

/* ════════════════════════════════════════════════
   G4 唬爛虎三級誇飾
════════════════════════════════════════════════ */
console.log('── G4 唬爛虎三級誇飾 ──');
{
  const t = rSpec && rSpec.tigerOutput;
  assert('G4-01 tiger.l1 非空',      t && t.l1.length > 0,     t && t.l1);
  assert('G4-02 tiger.l2 非空',      t && t.l2.length > 0,     t && t.l2);
  assert('G4-03 tiger.landing 非空', t && t.landing.length > 0, t && t.landing);
  assert('G4-04 l1 ≠ l2（各級內容不同）',      t && t.l1 !== t.l2,       null);
  assert('G4-05 l2 ≠ landing（落地有反差）',    t && t.l2 !== t.landing,   null);

  const tc = rConf && rConf.tigerOutput;
  assert('G4-06 conflict tiger 三級完整',
    tc && tc.l1.length > 0 && tc.l2.length > 0 && tc.landing.length > 0, tc);
}

/* ════════════════════════════════════════════════
   G5 無捏造細節
════════════════════════════════════════════════ */
console.log('── G5 無捏造細節 ──');
{
  function allText(r) {
    if (!r) return [];
    const out = [];
    Object.values(r.mouseOutput || {}).forEach(v => { if (typeof v === 'string') out.push(v); });
    Object.values(r.tigerOutput || {}).forEach(v => { if (typeof v === 'string') out.push(v); });
    return out;
  }

  function checkBanned(label, r) {
    const texts = allText(r);
    const hits = [];
    texts.forEach(text => {
      BANNED_PATTERNS.forEach(p => { if (p.test(text)) hits.push({ text, pattern: String(p) }); });
    });
    assert(label, hits.length === 0, hits);
  }

  checkBanned('G5-01 specific 全文無捏造細節', rSpec);
  checkBanned('G5-02 conflict 全文無捏造細節', rConf);
  checkBanned('G5-03 general  全文無捏造細節', rGen);

  assert('G5-04 specific boundary 無「次」字',
    rSpec && !/次/.test(rSpec.mouseOutput.boundary), rSpec && rSpec.mouseOutput.boundary);
  assert('G5-05 specific comicExit 無「每」字',
    rSpec && !/每/.test(rSpec.mouseOutput.comicExit), rSpec && rSpec.mouseOutput.comicExit);
  assert('G5-06 specific truth 無「叫了/催了」',
    rSpec && !/叫了|催了/.test(rSpec.mouseOutput.truth), rSpec && rSpec.mouseOutput.truth);
}

/* ════════════════════════════════════════════════
   G6 角色互換測試（必須失敗）
════════════════════════════════════════════════ */
console.log('── G6 角色互換測試 ──');
{
  const mouse = rSpec && rSpec.mouseOutput;
  const tiger = rSpec && rSpec.tigerOutput;

  assert('G6-01 mouseOutput IS   mouse output',    isMouseOutput(mouse),  mouse);
  assert('G6-02 mouseOutput IS NOT tiger output',  !isTigerOutput(mouse), mouse);
  assert('G6-03 tigerOutput IS   tiger output',    isTigerOutput(tiger),  tiger);
  assert('G6-04 tigerOutput IS NOT mouse output',  !isMouseOutput(tiger), tiger);
}

/* ════════════════════════════════════════════════
   G7 三層路由
════════════════════════════════════════════════ */
console.log('── G7 三層路由 ──');
{
  assert('G7-01 specific 路由成功（非 null）', rSpec !== null, rSpec);
  assert('G7-02 specific comicWorld = chef',
    rSpec && rSpec.mouseOutput.comicWorld === 'chef', rSpec && rSpec.mouseOutput.comicWorld);

  assert('G7-03 conflict 路由成功（非 null）', rConf !== null, rConf);
  assert('G7-04 conflict comicWorld = weather',
    rConf && rConf.mouseOutput.comicWorld === 'weather', rConf && rConf.mouseOutput.comicWorld);

  assert('G7-05 general 路由成功（非 null）', rGen !== null, rGen);
  assert('G7-06 general comicWorld = helpdesk',
    rGen && rGen.mouseOutput.comicWorld === 'helpdesk', rGen && rGen.mouseOutput.comicWorld);
}

/* ════════════════════════════════════════════════
   G8 {input} 替換
════════════════════════════════════════════════ */
console.log('── G8 {input} 替換 ──');
{
  assert('G8-01 general truth 含使用者原句',
    rGen && rGen.mouseOutput.truth.includes('孩子今天讓我很崩潰'),
    rGen && rGen.mouseOutput.truth);
  assert('G8-02 general truth 無 {input} 殘留',
    rGen && !rGen.mouseOutput.truth.includes('{input}'),
    rGen && rGen.mouseOutput.truth);

  // 超長輸入裁切至 20 字不崩潰
  const longInput = '這是一個超過二十個中文字的輸入測試句子，應該被裁切到二十個字以內才對啊';
  const rLong = generateRoast(
    pipe('孩子今天讓我很崩潰', '孩子'),
    { targetKey: 'child', input: longInput }
  );
  assert('G8-03 long input 裁切不崩潰、無 {input} 殘留',
    rLong && !rLong.mouseOutput.truth.includes('{input}'),
    rLong && rLong.mouseOutput.truth);
}

/* ════════════════════════════════════════════════
   G9 邊界容錯
════════════════════════════════════════════════ */
console.log('── G9 邊界容錯 ──');
{
  assert('G9-01 null evidenceReport → null',      generateRoast(null)      === null, null);
  assert('G9-02 undefined evidenceReport → null', generateRoast(undefined) === null, null);

  // 找不到對應詞庫 → null
  const rMissing = generateRoast(
    { layer: 'general', layerKey: 'workplace', hitTokens: [], layerConfidence: 'low' },
    { targetKey: 'boss', input: '老闆態度很差' }
  );
  assert('G9-03 詞庫不存在 → null', rMissing === null, rMissing);
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
