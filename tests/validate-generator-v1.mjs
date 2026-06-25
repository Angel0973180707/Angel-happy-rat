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
 * G10 角色語義標記（14 組：語氣辨識 11 + 禁用語氣 3）
 * G11 pickVaried 不重複相鄰輪換（5 組）
 * G12 全詞庫 BANNED_PATTERNS 靜態掃描（1 組）
 * G13 comicWorld 不跳世界（9 組：3 pool × 3 world 標記）
 * G14 每池幽默標記（9 組：3 pool × 誇飾 + 反差 + 自我解嘲）
 */

import { classifyInput } from '../content-engine-v2.js';
import { checkEvidence } from '../evidence-checker-v2.js';
import {
  generateRoast,
  isMouseOutput,
  isTigerOutput,
  BANNED_PATTERNS,
  BANNED_TONE,
  _CONTENT_DB,
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
   G10 角色語義標記（語氣辨識）
   小天鼠：直接嗆聲標記必須出現
   唬爛虎：誇飾升溫標記必須出現；落地必須含「現在」
   語義互換：mouse 內容不含 tiger 誇飾標記；tiger 不含 mouse 嗆聲標記
════════════════════════════════════════════════ */
console.log('── G10 角色語義標記 ──');
{
  // 小天鼠直接嗆聲標記（必須出現在 truth + boundary + selfOwn + comicExit 的任一欄）
  const MOUSE_SEMANTIC = ['你', '不是在', '套餐', '先焦', '先冒煙', '嗶——'];
  // 唬爛虎誇飾升溫標記（必須出現在 l1 + l2 的任一段）
  const TIGER_EXAGGERATION = ['峰會', '認證', '宣布', '稽查員', '委員會', '歷史時刻', '緊急'];

  function mouseText(r) {
    const m = r && r.mouseOutput;
    if (!m) return '';
    return [m.truth, m.boundary, m.selfOwn, m.comicExit].join('');
  }
  function tigerEscalation(r) {
    const t = r && r.tigerOutput;
    if (!t) return '';
    return [t.l1, t.l2].join('');
  }

  // 小天鼠：三組輸出各至少命中一個直接嗆聲標記
  assert('G10-01 specific mouse 命中直接嗆聲標記',
    MOUSE_SEMANTIC.some(m => mouseText(rSpec).includes(m)), mouseText(rSpec).slice(0, 60));
  assert('G10-02 conflict mouse 命中直接嗆聲標記',
    MOUSE_SEMANTIC.some(m => mouseText(rConf).includes(m)), mouseText(rConf).slice(0, 60));
  assert('G10-03 general  mouse 命中直接嗆聲標記',
    MOUSE_SEMANTIC.some(m => mouseText(rGen).includes(m)),  mouseText(rGen).slice(0, 60));

  // 唬爛虎：三組輸出各至少命中一個誇飾升溫標記
  assert('G10-04 specific tiger 命中誇飾升溫標記',
    TIGER_EXAGGERATION.some(m => tigerEscalation(rSpec).includes(m)), tigerEscalation(rSpec).slice(0, 60));
  assert('G10-05 conflict tiger 命中誇飾升溫標記',
    TIGER_EXAGGERATION.some(m => tigerEscalation(rConf).includes(m)), tigerEscalation(rConf).slice(0, 60));
  assert('G10-06 general  tiger 命中誇飾升溫標記',
    TIGER_EXAGGERATION.some(m => tigerEscalation(rGen).includes(m)),  tigerEscalation(rGen).slice(0, 60));

  // 唬爛虎 landing 必含「現在」（反差落地標記）
  assert('G10-07 specific tiger landing 含「現在」',
    rSpec && rSpec.tigerOutput.landing.includes('現在'), rSpec && rSpec.tigerOutput.landing);
  assert('G10-08 conflict tiger landing 含「現在」',
    rConf && rConf.tigerOutput.landing.includes('現在'), rConf && rConf.tigerOutput.landing);
  assert('G10-09 general  tiger landing 含「現在」',
    rGen  && rGen.tigerOutput.landing.includes('現在'),  rGen  && rGen.tigerOutput.landing);

  // 語義互換測試：mouse 的嗆聲文案不含 tiger 誇飾標記
  assert('G10-10 mouse content 無 tiger 誇飾標記（semantic swap 失敗）',
    !TIGER_EXAGGERATION.some(m => mouseText(rSpec).includes(m)), mouseText(rSpec).slice(0, 60));
  // 語義互換測試：tiger l1+l2 不含 mouse 專屬嗆聲構型
  const MOUSE_UNIQUE = ['套餐', '先焦', '先冒煙', '嗶——'];
  assert('G10-11 tiger escalation 無 mouse 專屬嗆聲標記（semantic swap 失敗）',
    !MOUSE_UNIQUE.some(m => tigerEscalation(rSpec).includes(m)), tigerEscalation(rSpec).slice(0, 60));

  // 禁用語氣：三組輸出全文均不含心理師/成功學語氣詞
  function allGeneratedText(r) {
    if (!r) return '';
    return [
      ...Object.values(r.mouseOutput || {}).filter(v => typeof v === 'string'),
      ...Object.values(r.tigerOutput || {}).filter(v => typeof v === 'string'),
    ].join('');
  }
  assert('G10-12 specific 無禁用語氣',
    !BANNED_TONE.some(w => allGeneratedText(rSpec).includes(w)),
    BANNED_TONE.filter(w => allGeneratedText(rSpec).includes(w)));
  assert('G10-13 conflict 無禁用語氣',
    !BANNED_TONE.some(w => allGeneratedText(rConf).includes(w)),
    BANNED_TONE.filter(w => allGeneratedText(rConf).includes(w)));
  assert('G10-14 general  無禁用語氣',
    !BANNED_TONE.some(w => allGeneratedText(rGen).includes(w)),
    BANNED_TONE.filter(w => allGeneratedText(rGen).includes(w)));
}

/* ════════════════════════════════════════════════
   G11 pickVaried 不重複相鄰輪換
   陣列長度 ≥ 2 時保證第 N 次與第 N-1 次不同
════════════════════════════════════════════════ */
console.log('── G11 pickVaried 輪換 ──');
{
  const specE = pipe('孩子不寫作業', '孩子');
  const truths = [];
  for (let i = 0; i < 6; i++) {
    const r = generateRoast(specE, { targetKey: 'child', input: '孩子不寫作業' });
    truths.push(r ? r.mouseOutput.truth : '');
  }
  for (let i = 1; i < truths.length; i++) {
    assert(`G11-0${i} truth[${i}] ≠ truth[${i - 1}]（pickVaried 保證不相鄰重複）`,
      truths[i] !== truths[i - 1],
      [truths[i - 1].slice(0, 20), truths[i].slice(0, 20)]);
  }
}

/* ════════════════════════════════════════════════
   G12 全詞庫靜態 BANNED_PATTERNS 掃描
   掃描 _CONTENT_DB 內所有字串，不依賴生成隨機性
════════════════════════════════════════════════ */
console.log('── G12 全詞庫 BANNED_PATTERNS ──');
{
  function collectAllDBText() {
    const all = [];
    Object.values(_CONTENT_DB).forEach(pool => {
      ['truth', 'honest', 'boundary'].forEach(f => (pool[f] || []).forEach(t => all.push(t)));
      Object.values(pool.worlds || {}).forEach(wd => {
        ['analogy', 'selfOwn', 'comicExit', 'callback'].forEach(f => (wd[f] || []).forEach(t => all.push(t)));
        const tiger = wd.tiger || {};
        ['l1', 'l2', 'landing'].forEach(f => (tiger[f] || []).forEach(t => all.push(t)));
      });
    });
    return all;
  }
  const allDBTexts = collectAllDBText();
  const dbHits = [];
  allDBTexts.forEach(text => {
    BANNED_PATTERNS.forEach(p => { if (p.test(text)) dbHits.push({ text: text.slice(0, 40), pattern: String(p) }); });
  });
  assert('G12-01 全詞庫所有變體均不含 BANNED_PATTERNS', dbHits.length === 0, dbHits.slice(0, 3));
}

/* ════════════════════════════════════════════════
   G13 comicWorld 不跳世界
   chef 內容不含氣象/客服詞；weather 不含食材/客服詞；helpdesk 不含食材/氣象詞
════════════════════════════════════════════════ */
console.log('── G13 comicWorld 不跳世界 ──');
{
  const CONTAMINATION = {
    chef:     ['氣象', '天氣', '颱風', '播報', '客服', '申訴', '待辦氣象台'],
    weather:  ['食材', '備料', '主廚', '出菜', '廚房', '套餐', '客服', '申訴'],
    helpdesk: ['食材', '備料', '主廚', '出菜', '廚房', '套餐', '氣象', '天氣', '颱風'],
  };

  Object.entries(_CONTENT_DB).forEach(([poolKey, pool]) => {
    Object.entries(pool.worlds || {}).forEach(([worldKey, wd]) => {
      const forbidden = CONTAMINATION[worldKey] || [];
      if (forbidden.length === 0) return;

      const worldTexts = [
        ...['analogy','selfOwn','comicExit','callback'].flatMap(f => wd[f] || []),
        ...['l1','l2','landing'].flatMap(f => (wd.tiger || {})[f] || []),
      ];
      const contaminated = worldTexts.filter(t => forbidden.some(w => t.includes(w)));
      assert(`G13 ${poolKey}.${worldKey} 無跨世界污染`,
        contaminated.length === 0,
        contaminated.map(t => t.slice(0, 30)));
    });
  });
}

/* ════════════════════════════════════════════════
   G14 每池幽默標記（誇飾 + 反差 + 自我解嘲）
   每個詞庫的所有文案合併後，三類幽默至少命中二
════════════════════════════════════════════════ */
console.log('── G14 幽默標記 ──');
{
  const TIGER_EXG  = ['峰會', '認證', '宣布', '稽查員', '委員會', '歷史時刻', '緊急'];
  const CONTRAST   = ['先不', '現在：'];
  const SELF_MOCK  = ['我先', '我承認', '我以前', '先讓你', '先停', '先退', '先申報', '先收回', '先不敲', '先去補', '忘了', '失效了'];

  Object.entries(_CONTENT_DB).forEach(([poolKey, pool]) => {
    const allPoolTexts = [
      ...['truth','honest','boundary'].flatMap(f => pool[f] || []),
      ...Object.values(pool.worlds || {}).flatMap(wd => [
        ...['analogy','selfOwn','comicExit','callback'].flatMap(f => wd[f] || []),
        ...['l1','l2','landing'].flatMap(f => (wd.tiger || {})[f] || []),
      ]),
    ].join('');

    const hasExg     = TIGER_EXG.some(w => allPoolTexts.includes(w));
    const hasContrast = CONTRAST.some(w => allPoolTexts.includes(w));
    const hasMock    = SELF_MOCK.some(w => allPoolTexts.includes(w));
    const score = [hasExg, hasContrast, hasMock].filter(Boolean).length;

    assert(`G14 ${poolKey} 幽默三類至少命中 2/3（誇飾:${hasExg} 反差:${hasContrast} 自嘲:${hasMock}）`,
      score >= 2,
      { score, pool: poolKey });
  });
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
