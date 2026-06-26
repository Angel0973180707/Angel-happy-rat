/**
 * roast-engine-v2.js — Phase 5 嗆聲引擎橋接
 *
 * 以 type="module" 載入（index.html），把 Phase 1–4 模組掛到
 * window.RoastEngineV2，供非模組的 app.js 呼叫。
 *
 * app.js 使用方式：
 *   window.RoastEngineV2.run(input, labelOrGuidedInput, lastWorld)
 *   window.RoastEngineV2.buildGuidedInput(targetLabel, sitKey, subKey)
 *   window.RoastEngineV2.GUIDED_MENU
 */

import { classifyInput }  from './content-engine-v2.js';
import { checkEvidence }  from './evidence-checker-v2.js';
import { generateRoast }  from './character-generator-v1.js';
import {
  getClarificationOptions,
  buildGuidedInput,
  GUIDED_MENU,
} from './guided-menu-v1.js';

window.RoastEngineV2 = {
  GUIDED_MENU: GUIDED_MENU,
  buildGuidedInput: buildGuidedInput,

  /**
   * run(input, labelOrOpts, lastWorld)
   *   input       使用者原句
   *   labelOrOpts 對象標籤字串 或 buildGuidedInput() 回傳值
   *   lastWorld   上次 comicWorld（供 pickVaried 避免相鄰重複）
   *
   * @returns {{ roast, clarifyOpts, classification, evidence }} | null
   */
  run: function(input, labelOrOpts, lastWorld) {
    try {
      var classification = classifyInput(input, labelOrOpts);
      var evidence = checkEvidence(classification);
      var roast = generateRoast(evidence, {
        targetKey: classification.targetRole,
        input: input,
        lastWorld: lastWorld || null,
      });
      if (!roast) return null;
      var clarifyOpts = getClarificationOptions(classification, evidence);
      return {
        roast: roast,
        clarifyOpts: clarifyOpts,
        classification: classification,
        evidence: evidence,
      };
    } catch (e) {
      console.error('[RoastV2] run() 失敗:', e);
      return null;
    }
  },
};
