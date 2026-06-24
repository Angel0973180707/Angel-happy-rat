/**
 * tests/validate-classifier-v2.mjs
 * Phase 1 Classifier v2.1 — table-driven tests
 *
 * 執行：node tests/validate-classifier-v2.mjs
 *
 * C1  正常命中（20 組）
 * C2  子情境辨識（9 組）
 * C3  信心等級與 classificationSource（6 組）
 * C4  Evidence tokens（5 組）
 * C5  角色與 schema 完整性（6 組）
 * C6  衝突類型與 evidence 閘門（6 組）
 * C7  Domain / interactionType / humorLevel（6 組）
 * C8  關鍵字碰撞與加權評分（10 組）
 * C9  未知情境跨六領域 fallback（10 組）
 * C10 否定語氣與能力差異（5 組）
 * C11 guidedSelection 覆寫（5 組）
 */

import { classifyInput, VERSION } from '../content-engine-v2.js';

/* ── Runner ── */
let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, got) {
  if (condition) { passed++; }
  else { failed++; failures.push({ label, got: JSON.stringify(got) }); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) !== -1; }
function notIn(arr, v) { return !Array.isArray(arr) || arr.indexOf(v) === -1; }

console.log(`\n笑鼠人了！ content-engine-v2.js ${VERSION}\n`);

/* ════════════════════════════════════════════════
   C1 正常命中（20 組）
════════════════════════════════════════════════ */
console.log('── C1 正常命中 ──');
{
  const r = classifyInput('孩子一直不想寫作業，坐在那邊發呆', '孩子');
  assert('C1-01 homework', r.situationKey === 'homework', r.situationKey);
  assert('C1-01 targetRole child', r.targetRole === 'child', r.targetRole);
}
{
  const r = classifyInput('早上叫不起來，鬧鐘響了也不動', '孩子');
  assert('C1-02 lateSleep', r.situationKey === 'lateSleep', r.situationKey);
}
{
  const r = classifyInput('到了約定時間孩子還不關手機', '孩子');
  assert('C1-03 screen (time kw)', r.situationKey === 'screen', r.situationKey);
}
{
  const r = classifyInput('孩子說頂嘴，講他就反嗆', '孩子');
  assert('C1-04 talkBack', r.situationKey === 'talkBack', r.situationKey);
}
{
  const r = classifyInput('玩具到處都是，地上不整理', '孩子');
  assert('C1-05 messyRoom', r.situationKey === 'messyRoom', r.situationKey);
}
{
  const r = classifyInput('孩子說挑食，那個不吃這個也不要', '孩子');
  assert('C1-06 picky', r.situationKey === 'picky', r.situationKey);
}
{
  const r = classifyInput('今天又加班到很晚，假日也被叫回來', '老闆');
  assert('C1-07 overtime', r.situationKey === 'overtime', r.situationKey);
  assert('C1-07 targetRole boss', r.targetRole === 'boss', r.targetRole);
}
{
  const r = classifyInput('老闆語氣差，亂罵人，不把我當人看', '老闆');
  assert('C1-08 disrespect', r.situationKey === 'disrespect', r.situationKey);
}
{
  const r = classifyInput('背鍋了，說是我的問題，明明不是我決定的', '老闆');
  assert('C1-09 blame', r.situationKey === 'blame', r.situationKey);
}
{
  const r = classifyInput('客戶說稿子不對，要改，改完又說再調整', '客戶');
  assert('C1-10 revision', r.situationKey === 'revision', r.situationKey);
}
{
  const r = classifyInput('同事把我做的報告說成他的', '同事');
  assert('C1-11 credit', r.situationKey === 'credit', r.situationKey);
}
{
  const r = classifyInput('爸媽一直催婚，說年紀到了', '爸媽');
  assert('C1-12 marriage', r.situationKey === 'marriage', r.situationKey);
}
{
  const r = classifyInput('爸媽說不能再吃糖，爺奶卻說沒關係', '爸媽');
  assert('C1-13 cross_generation', r.situationKey === 'cross_generation', r.situationKey);
}
{
  const r = classifyInput('另一半說家事都是我在做，沒分擔', '另一半');
  assert('C1-14 partner chores', r.situationKey === 'chores', r.situationKey);
}
{
  const r = classifyInput('另一半一直滑手機，都在看平板', '另一半');
  assert('C1-15 partner screen', r.situationKey === 'screen', r.situationKey);
}
{
  const r = classifyInput('朋友說好要來，臨時取消，也沒說原因', '朋友');
  assert('C1-16 flake', r.situationKey === 'flake', r.situationKey);
}
{
  const r = classifyInput('我一直拖延，事情都放著不做', '自己');
  assert('C1-17 self_procrastinate', r.situationKey === 'self_procrastinate', r.situationKey);
  assert('C1-17 targetRole self', r.targetRole === 'self', r.targetRole);
}
{
  const r = classifyInput('不知道方向，不知道要做什麼，感覺很迷惘', '自己');
  assert('C1-18 self_direction', r.situationKey === 'self_direction', r.situationKey);
}
{
  const r = classifyInput('存不到錢，一直月光，薪水不夠', '自己');
  assert('C1-19 self_finance', r.situationKey === 'self_finance', r.situationKey);
}
{
  const r = classifyInput('另一半花錢花太多，消費觀念不同', '另一半');
  assert('C1-20 partner finance', r.situationKey === 'finance', r.situationKey);
}

/* ════════════════════════════════════════════════
   C2 子情境辨識（9 組）
════════════════════════════════════════════════ */
console.log('── C2 子情境辨識 ──');
{
  const r = classifyInput('到了約定時間，孩子還不肯關手機', '孩子');
  assert('C2-01 screen_time', r.subSituationKey === 'screen_time', r.subSituationKey);
}
{
  const r = classifyInput('孩子睡前還在玩平板，催了也不睡', '孩子');
  assert('C2-02 screen_at_bedtime', r.subSituationKey === 'screen_at_bedtime', r.subSituationKey);
}
{
  const r = classifyInput('吃飯時孩子一直看電視，叫他放下不理', '孩子');
  assert('C2-03 screen_at_meals', r.subSituationKey === 'screen_at_meals', r.subSituationKey);
}
{
  const r = classifyInput('孩子偷偷拿我手機在玩，以為我不知道', '孩子');
  assert('C2-04 screen_hidden_use', r.subSituationKey === 'screen_hidden_use', r.subSituationKey);
}
{
  const r = classifyInput('孩子看不適合的影片，暴力內容', '孩子');
  assert('C2-05 screen_content', r.subSituationKey === 'screen_content', r.subSituationKey);
}
{
  // screen 無子關鍵字 → screen_general
  const r = classifyInput('孩子一直玩遊戲不放下', '孩子');
  assert('C2-06 screen_general fallback', r.subSituationKey === 'screen_general', r.subSituationKey);
}
{
  const r = classifyInput('爸媽說不能再吃糖，爺奶卻說沒關係', '爸媽');
  assert('C2-07 grandparent_treat_override', r.subSituationKey === 'grandparent_treat_override', r.subSituationKey);
}
{
  // cross_gen 無糖 → grandparent_rules_general
  const r = classifyInput('爺爺奶奶和我們管教標準不同', '爸媽');
  assert('C2-08 grandparent_rules_general', r.subSituationKey === 'grandparent_rules_general', r.subSituationKey);
}
{
  // 無子情境規則的情境 → subSituationKey = null
  const r = classifyInput('孩子頂嘴，講他就反嗆', '孩子');
  assert('C2-09 talkBack sub = null', r.subSituationKey === null, r.subSituationKey);
}

/* ════════════════════════════════════════════════
   C3 信心等級與 classificationSource
════════════════════════════════════════════════ */
console.log('── C3 信心等級 ──');
{
  const r = classifyInput('孩子不想寫作業', '孩子');
  assert('C3-01 homework → high', r.classificationConfidence === 'high', r.classificationConfidence);
  assert('C3-01 source has user_input', has(r.classificationSource, 'user_input'), r.classificationSource);
}
{
  // screen 無子關鍵字 → medium（sub_general）
  const r = classifyInput('孩子一直玩遊戲', '孩子');
  assert('C3-02 screen_general → medium', r.classificationConfidence === 'medium', r.classificationConfidence);
}
{
  // 無 situationKey 但有 sharedConflict → low + ['user_input','inferred']
  const r = classifyInput('今天心情很差，太累了撐不住', '孩子');
  assert('C3-03 no situation → low', r.classificationConfidence === 'low', r.classificationConfidence);
  assert('C3-03 source has inferred', has(r.classificationSource, 'inferred'), r.classificationSource);
}
{
  // 完全無信號 → low + ['target_chip','inferred']
  const r = classifyInput('今天天氣很好', '孩子');
  assert('C3-04 no signal → low', r.classificationConfidence === 'low', r.classificationConfidence);
}
{
  // 高分 single situation → high
  const r = classifyInput('老闆語氣差，亂罵人，不尊重', '老闆');
  assert('C3-05 disrespect → high', r.classificationConfidence === 'high', r.classificationConfidence);
}
{
  // cross_generation + 糖 → high（有具體子情境）
  const r = classifyInput('爺奶說可以吃糖，但我說不能', '爸媽');
  assert('C3-06 treat_override → high', r.classificationConfidence === 'high', r.classificationConfidence);
}

/* ════════════════════════════════════════════════
   C4 Evidence tokens
════════════════════════════════════════════════ */
console.log('── C4 Evidence tokens ──');
{
  // 作業(homework_explicit) + 沒動筆/沒開始(not_started_explicit) 同時命中
  const r = classifyInput('孩子作業還沒動筆，沒開始', '孩子');
  assert('C4-01 homework_explicit', has(r.evidenceTokens, 'homework_explicit'), r.evidenceTokens);
  assert('C4-01 not_started_explicit', has(r.evidenceTokens, 'not_started_explicit'), r.evidenceTokens);
}
{
  const r = classifyInput('到了約定時間孩子不關手機', '孩子');
  assert('C4-02 screen_time_explicit', has(r.evidenceTokens, 'screen_time_explicit'), r.evidenceTokens);
}
{
  const r = classifyInput('爸媽說不能再吃糖，爺奶卻說沒關係', '爸媽');
  assert('C4-03 grandparent_explicit', has(r.evidenceTokens, 'grandparent_explicit'), r.evidenceTokens);
  assert('C4-03 treat_override_explicit', has(r.evidenceTokens, 'treat_override_explicit'), r.evidenceTokens);
  assert('C4-03 parent_rule_explicit', has(r.evidenceTokens, 'parent_rule_explicit'), r.evidenceTokens);
}
{
  const r = classifyInput('說好的規定不遵守', '孩子');
  assert('C4-04 rules_conflict_explicit', has(r.evidenceTokens, 'rules_conflict_explicit'), r.evidenceTokens);
}
{
  const r = classifyInput('今天心情還可以', '其他');
  assert('C4-05 無 evidence → empty', r.evidenceTokens.length === 0, r.evidenceTokens);
}

/* ════════════════════════════════════════════════
   C5 角色與 schema 完整性
════════════════════════════════════════════════ */
console.log('── C5 角色與 schema ──');
{
  const r = classifyInput('孩子不寫作業', '孩子');
  assert('C5-01 speakerRole parent', r.speakerRole === 'parent', r.speakerRole);
  assert('C5-01 interactionType directed', r.interactionType === 'directed', r.interactionType);
  assert('C5-01 subjectKey homework', r.subjectKey === 'homework', r.subjectKey);
}
{
  const r = classifyInput('老闆叫我加班', '老闆');
  assert('C5-02 speakerRole employee', r.speakerRole === 'employee', r.speakerRole);
}
{
  const r = classifyInput('爸媽催婚', '爸媽');
  assert('C5-03 speakerRole adult_child', r.speakerRole === 'adult_child', r.speakerRole);
}
{
  const r = classifyInput('我一直拖延', '自己');
  assert('C5-04 self interactionType self', r.interactionType === 'self', r.interactionType);
  assert('C5-04 speakerRole self', r.speakerRole === 'self', r.speakerRole);
}
{
  // cross_generation → subjectRole = 'child'
  const r = classifyInput('爺奶說可以吃糖，爸媽說不行', '爸媽');
  assert('C5-05 cross_gen subjectRole child', r.subjectRole === 'child', r.subjectRole);
}
{
  // Schema 完整性：所有必要欄位存在
  const r = classifyInput('孩子不寫作業', '孩子');
  const required = ['speakerRole','targetRole','subjectRole','subjectKey','interactionType',
    'domain','situationKey','subSituationKey','primaryConflictType','secondaryConflictTypes',
    'primaryNeedType','secondaryNeedTypes','primaryOutcomeType','humorLevel',
    'evidenceTokens','candidateSituationKeys','classificationSource','classificationConfidence'];
  let allPresent = true;
  required.forEach(k => { if (!(k in r)) allPresent = false; });
  assert('C5-06 schema 欄位完整', allPresent, Object.keys(r));
}

/* ════════════════════════════════════════════════
   C6 衝突類型與 evidence 閘門
════════════════════════════════════════════════ */
console.log('── C6 衝突類型 ──');
{
  // homework + not_started_explicit → avoidance
  const r = classifyInput('孩子還沒開始寫作業，沒動筆', '孩子');
  assert('C6-01 homework+start → avoidance', r.primaryConflictType === 'avoidance', r.primaryConflictType);
}
{
  // homework 無 not_started + 無 ability_gap → unknown
  const r = classifyInput('孩子的作業放在那邊', '孩子');
  assert('C6-02 homework 無 evidence → unknown', r.primaryConflictType === 'unknown', r.primaryConflictType);
}
{
  // screen_time → boundary_violation
  const r = classifyInput('到了約定時間孩子不關手機', '孩子');
  assert('C6-03 screen_time → boundary_violation', r.primaryConflictType === 'boundary_violation', r.primaryConflictType);
}
{
  // screen_hidden_use → trust
  const r = classifyInput('孩子偷偷用手機，以為我不知道', '孩子');
  assert('C6-04 screen_hidden → trust', r.primaryConflictType === 'trust', r.primaryConflictType);
}
{
  // 無 situationKey 但有 overload sharedConflict
  const r = classifyInput('太累了，壓力太大，快撐不住', '孩子');
  assert('C6-05 fallback → overload', r.primaryConflictType === 'overload', r.primaryConflictType);
}
{
  // disrespect → respect_dignity → gentle humorLevel
  const r = classifyInput('老闆不尊重我，態度差，語氣差', '老闆');
  assert('C6-06 disrespect → gentle', r.humorLevel === 'gentle', r.humorLevel);
}

/* ════════════════════════════════════════════════
   C7 Domain / interactionType / humorLevel
════════════════════════════════════════════════ */
console.log('── C7 Domain / humor ──');
{
  assert('C7-01 child → parenting',
    classifyInput('孩子不寫作業', '孩子').domain === 'parenting', null);
}
{
  assert('C7-02 boss → workplace',
    classifyInput('老闆叫我加班', '老闆').domain === 'workplace', null);
}
{
  assert('C7-03 parents → family',
    classifyInput('爸媽催婚', '爸媽').domain === 'family', null);
}
{
  assert('C7-04 partner → relationship',
    classifyInput('另一半不做家事', '另一半').domain === 'relationship', null);
}
{
  assert('C7-05 self → self',
    classifyInput('我一直拖延', '自己').domain === 'self', null);
}
{
  // self + 存不到錢 → finance domain
  assert('C7-06 self + finance kw → finance',
    classifyInput('存不到錢，月光族', '自己').domain === 'finance', null);
}

/* ════════════════════════════════════════════════
   C8 關鍵字碰撞與加權評分（10 組）
════════════════════════════════════════════════ */
console.log('── C8 關鍵字碰撞 ──');
{
  // 「爺爺奶奶比較寵孩子」：cross_gen 分(4) > compare 的「比」(0，len=1)
  const r = classifyInput('爺爺奶奶比較寵孩子', '爸媽');
  assert('C8-01 爺奶+比 → cross_generation', r.situationKey === 'cross_generation', r.situationKey);
}
{
  // 「爸媽一直跟別人比」：compare 分(別人=2) > cross_gen(0)
  const r = classifyInput('爸媽一直跟別人比，別人家的孩子都比我好', '爸媽');
  assert('C8-02 別人 → compare', r.situationKey === 'compare', r.situationKey);
}
{
  // lateSleep + screen 同時：lateSleep 列在前，且有高分 kw 鬧鐘(2)
  // screen 有平板(2)
  // 鬧鐘=2 vs 平板=2，lateSleep 先列 → 取 lateSleep (tie 取第一個)
  const r = classifyInput('早上叫不起來，鬧鐘響了，說要看平板才起', '孩子');
  assert('C8-03 lateSleep+screen → lateSleep（先列優先）', r.situationKey === 'lateSleep', r.situationKey);
}
{
  // procrastinate(等一下=3) > messyRoom 無命中
  const r = classifyInput('等一下再去收拾，等一下就去', '孩子');
  assert('C8-04 等一下 → procrastinate', r.situationKey === 'procrastinate', r.situationKey);
}
{
  // partner.chores vs partner.finance: 洗碗(2)+整理(2)=4 vs 花費(2)=2
  const r = classifyInput('另一半不洗碗，家事都是我做，但他花費很大', '另一半');
  assert('C8-05 chores 分>finance', r.situationKey === 'chores', r.situationKey);
}
{
  // overtime vs blame 都在 boss: 加班(2)=2 vs 甩鍋(2)=2 → tie → medium
  // 注意：避免「都是我」(3分)讓 blame 超過 overtime，只用單一等分 kw
  const r = classifyInput('老闆要我加班還在甩鍋', '老闆');
  assert('C8-06 overtime+blame tie → medium', r.classificationConfidence === 'medium', r.classificationConfidence);
  assert('C8-06 candidates includes both',
    has(r.candidateSituationKeys, 'overtime') && has(r.candidateSituationKeys, 'blame'),
    r.candidateSituationKeys);
}
{
  // 單字「比」不觸發 compare（score < MIN_SCORE）
  const r = classifyInput('爸媽比較嚴格', '爸媽');
  // 「比」len=1 → score=0，不觸發；嚴格不在 compare 清單
  assert('C8-07 單字比 < MIN_SCORE → no compare', r.situationKey !== 'compare', r.situationKey);
}
{
  // partner.screen vs partner.chores: 手機(2)+平板(2)=4 vs 家事(2)=2 → screen wins
  const r = classifyInput('另一半一直看手機看平板，家事還是沒做', '另一半');
  assert('C8-08 screen(4) > chores(2)', r.situationKey === 'screen', r.situationKey);
}
{
  // gossip 的「說了」vs flake 無命中
  const r = classifyInput('朋友把我說的秘密到處說，跟別人說了', '朋友');
  assert('C8-09 gossip 命中', r.situationKey === 'gossip', r.situationKey);
}
{
  // self_direction 的「未來」vs self_finance 的「存款」: 都有 kw
  // self_direction: 未來(2)+迷惘(2)=4 vs self_finance: 存款(2)=2 → direction wins
  const r = classifyInput('不知道未來，感覺很迷惘，存款也不多', '自己');
  assert('C8-10 direction(4)>finance(2)', r.situationKey === 'self_direction', r.situationKey);
}

/* ════════════════════════════════════════════════
   C9 未知情境跨六領域 fallback（10 組）
════════════════════════════════════════════════ */
console.log('── C9 未知情境 domain fallback ──');
{
  // 無具體 kw → low，但 domain 來自 target
  const r = classifyInput('老闆今天讓我覺得不舒服', '老闆');
  assert('C9-01 不舒服(無命中kw) → workplace', r.domain === 'workplace', r.domain);
  assert('C9-01 情境 → null 或 disrespect', r.situationKey === null || r.situationKey === 'disrespect', r.situationKey);
}
{
  const r = classifyInput('今天心情很差', '另一半');
  assert('C9-02 情緒 → relationship', r.domain === 'relationship', r.domain);
  assert('C9-02 low confidence', r.classificationConfidence === 'low', r.classificationConfidence);
}
{
  const r = classifyInput('不知道怎麼辦', '朋友');
  assert('C9-03 朋友 → social_life', r.domain === 'social_life', r.domain);
  assert('C9-03 null situation', r.situationKey === null, r.situationKey);
}
{
  const r = classifyInput('感覺很迷惘不知道未來', '自己');
  assert('C9-04 自己迷惘 → self_direction 或 self', r.situationKey === 'self_direction' || r.domain === 'self', r.situationKey);
}
{
  // other target + 無 finance kw → unknown domain
  const r = classifyInput('今天發生了一件事', '其他');
  assert('C9-05 other + 無 kw → unknown domain', r.domain === 'unknown', r.domain);
  assert('C9-05 unknown conflict', r.primaryConflictType === 'unknown', r.primaryConflictType);
}
{
  // other + 錢 → finance domain（keyword override）
  const r = classifyInput('錢不夠用，存款快見底了', '其他');
  assert('C9-06 other + 錢 → finance', r.domain === 'finance', r.domain);
}
{
  const r = classifyInput('爸媽讓我有點難受', '爸媽');
  assert('C9-07 family domain', r.domain === 'family', r.domain);
  assert('C9-07 low', r.classificationConfidence === 'low', r.classificationConfidence);
}
{
  // shared conflict 可識別：太累 → overload → low 但有 primaryConflictType
  const r = classifyInput('覺得太累了，撐不住', '同事');
  assert('C9-08 overload shared conflict', r.primaryConflictType === 'overload', r.primaryConflictType);
  assert('C9-08 source has inferred', has(r.classificationSource, 'inferred'), r.classificationSource);
}
{
  const r = classifyInput('不確定接下來該怎麼辦，沒有答案', '自己');
  assert('C9-09 uncertainty shared', r.primaryConflictType === 'uncertainty', r.primaryConflictType);
}
{
  // 完全空白 → all unknown
  const r = classifyInput('', '其他');
  assert('C9-10 空輸入 → null situation', r.situationKey === null, r.situationKey);
  assert('C9-10 low confidence', r.classificationConfidence === 'low', r.classificationConfidence);
}

/* ════════════════════════════════════════════════
   C10 否定語氣與能力差異（5 組）
════════════════════════════════════════════════ */
console.log('── C10 否定/能力差異 ──');
{
  // 「不是不寫，是不會寫」— 命中 homework + ability_gap → skill_gap，不是 avoidance
  const r = classifyInput('不是不寫，是不會寫這一題，看不懂題目', '孩子');
  assert('C10-01 situationKey homework', r.situationKey === 'homework', r.situationKey);
  assert('C10-01 ability_gap_explicit', has(r.evidenceTokens, 'ability_gap_explicit'), r.evidenceTokens);
  assert('C10-01 conflictType = skill_gap', r.primaryConflictType === 'skill_gap', r.primaryConflictType);
  assert('C10-01 NOT avoidance', r.primaryConflictType !== 'avoidance', r.primaryConflictType);
}
{
  // 「不是逃避，只是不知道怎麼開始」— negation_of_avoidance 命中
  const r = classifyInput('孩子說不是不寫，只是不知道怎麼開始，不知道如何下筆', '孩子');
  assert('C10-02 negation_of_avoidance token', has(r.evidenceTokens, 'negation_of_avoidance'), r.evidenceTokens);
  assert('C10-02 skill_gap not avoidance', r.primaryConflictType === 'skill_gap', r.primaryConflictType);
}
{
  // 「孩子不會寫這題」— 有 ability_gap，無 not_started → skill_gap
  // 需要作業 kw 讓 homework situationKey 觸發
  const r = classifyInput('孩子的作業說不會做，學不來', '孩子');
  assert('C10-03 ability_gap → skill_gap', r.primaryConflictType === 'skill_gap', r.primaryConflictType);
}
{
  // 「孩子還沒開始寫」— not_started 有，無 ability_gap → avoidance
  const r = classifyInput('孩子的作業還沒開始寫，沒動筆', '孩子');
  assert('C10-04 not_started → avoidance', r.primaryConflictType === 'avoidance', r.primaryConflictType);
  assert('C10-04 NOT skill_gap', r.primaryConflictType !== 'skill_gap', r.primaryConflictType);
}
{
  // 「孩子的作業就放在那裡」— 無 not_started 無 ability_gap → unknown
  const r = classifyInput('孩子的作業就放在桌上', '孩子');
  assert('C10-05 無 evidence → unknown', r.primaryConflictType === 'unknown', r.primaryConflictType);
}

/* ════════════════════════════════════════════════
   C11 guidedSelection 覆寫（5 組）
════════════════════════════════════════════════ */
console.log('── C11 guidedSelection ──');
{
  // 明確引導選擇 → high confidence + guided_select source
  const r = classifyInput('孩子一直玩遊戲', {
    targetLabel: '孩子',
    guidedSelection: { situationKey: 'screen', subSituationKey: 'screen_time' }
  });
  assert('C11-01 guided situationKey', r.situationKey === 'screen', r.situationKey);
  assert('C11-01 guided subSituationKey', r.subSituationKey === 'screen_time', r.subSituationKey);
  assert('C11-01 source guided_select', has(r.classificationSource, 'guided_select'), r.classificationSource);
  assert('C11-01 confidence high', r.classificationConfidence === 'high', r.classificationConfidence);
}
{
  // 引導選 homework，文字也有作業 kw，score 低不算衝突 → high + user_input
  const r = classifyInput('孩子作業沒做', {
    targetLabel: '孩子',
    guidedSelection: { situationKey: 'homework' }
  });
  assert('C11-02 guided confirm → high', r.classificationConfidence === 'high', r.classificationConfidence);
  assert('C11-02 source has user_input', has(r.classificationSource, 'user_input'), r.classificationSource);
}
{
  // 引導選 homework，但文字強烈提示 screen（score≥4）→ text_conflict → medium
  const r = classifyInput('孩子一直玩手機看平板不放下', {
    targetLabel: '孩子',
    guidedSelection: { situationKey: 'homework' }
  });
  assert('C11-03 text_conflict → medium', r.classificationConfidence === 'medium', r.classificationConfidence);
  assert('C11-03 source text_conflict', has(r.classificationSource, 'text_conflict'), r.classificationSource);
}
{
  // string 形式 targetLabel（向後相容）
  const r = classifyInput('孩子不寫作業', '孩子');
  assert('C11-04 string options 仍可用', r.situationKey === 'homework', r.situationKey);
}
{
  // 引導選擇優先於模糊文字（空白輸入 + guided → high）
  const r = classifyInput('', {
    targetLabel: '孩子',
    guidedSelection: { situationKey: 'lateSleep' }
  });
  assert('C11-05 空輸入+guided → high', r.classificationConfidence === 'high', r.classificationConfidence);
  assert('C11-05 guided lateSleep', r.situationKey === 'lateSleep', r.situationKey);
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
