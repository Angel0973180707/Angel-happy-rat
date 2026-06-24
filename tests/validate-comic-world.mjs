/**
 * tests/validate-comic-world.mjs
 * 嗆聲 comicWorld 全流程銜接驗證
 *
 * 執行：node tests/validate-comic-world.mjs
 * 策略：剝除 IIFE 包裝，在 vm sandbox 中執行 app.js 主體，
 *       以 window/document/navigator mock 替代瀏覽器環境。
 *
 * T1  資料結構完整性（W1-W5 必要欄位）
 * T2  世界一致性（無跨世界混用、W2 改哪科、W3/W4 無 songA/B）
 * T3  genRoast 回傳 9 個欄位全非空
 * T4  12 次再生成不連續重複世界
 * T5  草稿儲存 / 恢復，9 個欄位完全一致
 * T6  全流程銜接：W1/W2/W5 嗆聲→唬爛虎→SongA→SongB→分享
 * T7  W3/W4 明確 gating（style 顯示製作中，非通用 Lo-fi/Indie）
 * T8  快速模式獨立運作（無 comicWorld 前置）
 * T9  禁止用語不得出現於任何詞庫
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, runInNewContext } from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const rawSrc = readFileSync(join(__dir, '..', 'app.js'), 'utf-8');

/* ── 1. 剝除 IIFE 包裝 ── */
// app.js 結構：
//   /* block comment */
//   (function(){
//   "use strict";
//   ... code ...
//   });
//   })();
let appSrc = rawSrc;
// 去掉頂部 block comment
appSrc = appSrc.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
// 去掉 (function(){ 這一行
appSrc = appSrc.replace(/^\(function\(\)\{\s*[\r\n]+/, '');
// 去掉 "use strict"; 這一行
appSrc = appSrc.replace(/^"use strict";\s*[\r\n]+/, '');
// 去掉最末 })(); 這一行
appSrc = appSrc.replace(/[\r\n]+\}\)\(\);\s*$/, '\n');

/* ── 2. Browser mock sandbox ── */
const ssMap = {};
const lsMap = {};

function makeEl() {
  return {
    style:{}, className:'', innerHTML:'', textContent:'', href:'', value:'',
    setAttribute(){}, getAttribute(){ return null; }, appendChild(){}, removeChild(){},
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){},
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; }, replace(){} },
    children:[], parentNode:null, dataset:{}, offsetWidth:0, offsetHeight:0,
    getBoundingClientRect(){ return {top:0,left:0,right:0,bottom:0,width:0,height:0}; }
  };
}

const mockDoc = {
  addEventListener: ()=>{},
  removeEventListener: ()=>{},
  getElementById: ()=>null,
  querySelector: ()=>null,
  querySelectorAll: ()=>{ const a=[]; a.forEach=Array.prototype.forEach.bind(a); return a; },
  getElementsByClassName: ()=>{ const a=[]; a[Symbol.iterator]=Array.prototype[Symbol.iterator].bind(a); return a; },
  getElementsByTagName: ()=>{ const a=[]; a[Symbol.iterator]=Array.prototype[Symbol.iterator].bind(a); return a; },
  body: makeEl(),
  head: makeEl(),
  documentElement: makeEl(),
  createElement: ()=>makeEl(),
  createElementNS: ()=>makeEl(),
  createTextNode: (t)=>({ textContent:t }),
  title: '',
  readyState: 'complete',
};

const sandbox = {
  window: null, // set after sandbox created
  document: mockDoc,
  navigator: { userAgent:'Mozilla/5.0 (Node.js test)', onLine:true, language:'zh-TW', clipboard:{ writeText:()=>Promise.resolve() } },
  location: { href:'http://localhost/', pathname:'/', search:'', hash:'', assign(){}, replace(){}, origin:'http://localhost' },
  history: { pushState(){}, replaceState(){}, back(){} },
  screen: { width:1920, height:1080 },
  sessionStorage: {
    getItem:  k => ssMap[k]!==undefined ? ssMap[k] : null,
    setItem:  (k,v) => { ssMap[k]=String(v); },
    removeItem: k => { delete ssMap[k]; }
  },
  localStorage: {
    getItem:  k => lsMap[k]!==undefined ? lsMap[k] : null,
    setItem:  (k,v) => { lsMap[k]=String(v); },
    removeItem: k => { delete lsMap[k]; }
  },
  console: { log(){}, warn(){}, error(){}, info(){}, debug(){} },
  setTimeout: ()=>0, setInterval: ()=>0, clearTimeout(){}, clearInterval(){},
  requestAnimationFrame: ()=>0, cancelAnimationFrame(){},
  performance: { now(){ return Date.now(); }, mark(){}, measure(){} },
  CustomEvent: function(name,opts){ this.type=name; this.detail=opts&&opts.detail; },
  Event: function(name){ this.type=name; },
  Image: function(){ this.onload=null; this.src=''; },
  XMLHttpRequest: function(){
    this.open=()=>{}; this.send=()=>{}; this.setRequestHeader=()=>{};
    this.readyState=4; this.status=200; this.responseText='{}';
  },
  gtag: ()=>{},
  liff: {
    isInClient(){ return false; }, isLoggedIn(){ return false; },
    getProfile(){ return Promise.resolve({ userId:'TEST', displayName:'TEST', pictureUrl:'' }); },
    init(){ return Promise.resolve(); }, login(){}, logout(){}
  },
  fetch: ()=>Promise.resolve({ ok:false, json(){ return Promise.resolve({}); }, text(){ return Promise.resolve(''); } }),
  IntersectionObserver: function(cb){ this.observe=()=>{}; this.unobserve=()=>{}; this.disconnect=()=>{}; },
  MutationObserver: function(cb){ this.observe=()=>{}; this.disconnect=()=>{}; },
  ResizeObserver: function(cb){ this.observe=()=>{}; this.unobserve=()=>{}; this.disconnect=()=>{}; },
  Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, TypeError,
  isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, btoa:(s)=>Buffer.from(s).toString('base64'),
  Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
  URLSearchParams, URL,
  getComputedStyle: ()=>({ getPropertyValue:()=>'' }),
};
sandbox.window = sandbox; // self-reference like browser
createContext(sandbox);

try {
  runInNewContext(appSrc, sandbox, { filename:'app.js', displayErrors:true });
} catch(e) {
  // 如果錯誤只是 DOM 相關（DOMContentLoaded 後的 UI 初始化），可繼續
  if (e.message.includes('Cannot set properties') || e.message.includes('null') ||
      e.message.includes('classList') || e.message.includes('addEventListener')) {
    console.warn('⚠️  非關鍵 DOM 錯誤（跳過）:', e.message.split('\n')[0]);
  } else {
    console.error('❌ vm 執行錯誤：', e.message);
    console.error(e.stack.split('\n').slice(0,5).join('\n'));
    process.exit(1);
  }
}

// 提取必要函式與資料
const genRoast        = sandbox.genRoast;
const genBigDream     = sandbox.genBigDream;
const genSongVersionA = sandbox.genSongVersionA;
const genSongVersionB = sandbox.genSongVersionB;
const genShareCopy    = sandbox.genShareCopy;
const saveDraft       = sandbox.saveDraft;
const loadDraft       = sandbox.loadDraft;
const clearDraft      = sandbox.clearDraft;
const emptyContext    = sandbox.emptyContext;
const TARGET_ROAST_DB = sandbox.TARGET_ROAST_DB;

if(!TARGET_ROAST_DB){ console.error('❌ TARGET_ROAST_DB 未定義'); process.exit(1); }
if(!genRoast){ console.error('❌ genRoast 未定義'); process.exit(1); }

/* ── 3. 測試 runner ── */
let passed=0, failed=0;
const log=[];
function ok(name, cond, detail=''){
  const line=`  ${cond?'✅':'❌'} ${name}${detail?`  → ${String(detail).slice(0,60)}`:''}`;
  log.push(line);
  if(cond) passed++; else failed++;
}

const WORLDS=['W1','W2','W3','W4','W5'];
const hw=TARGET_ROAST_DB.child.situations.homework;

/* ── T1: 資料結構完整性 ── */
console.log('\n=== T1: 資料結構完整性（W1-W5 必要欄位）===');
WORLDS.forEach(w=>{
  const wd=hw.worlds[w];
  ok(`${w} 存在`, !!wd);
  if(!wd) return;
  ok(`${w}.name`,           typeof wd.name==='string'&&wd.name.length>0, wd.name);
  ok(`${w}.analogy[]`,      Array.isArray(wd.analogy)&&wd.analogy.length>0);
  ok(`${w}.comicExit[]`,    Array.isArray(wd.comicExit)&&wd.comicExit.length>0);
  ok(`${w}.tiger`,          typeof wd.tiger==='string'&&wd.tiger.length>0, wd.tiger.slice(0,30));
  ok(`${w}.nextAction`,     typeof wd.nextAction==='string'&&wd.nextAction.length>0);
  ok(`${w}.resolutionWish[]`, Array.isArray(wd.resolutionWish)&&wd.resolutionWish.length>0);
  ok(`${w}.callback[]`,     Array.isArray(wd.callback)&&wd.callback.length>0);
});

/* ── T2: 世界一致性 ── */
console.log('\n=== T2: 世界一致性（無混用）===');
const w5=hw.worlds.W5, w2=hw.worlds.W2, w3=hw.worlds.W3, w4=hw.worlds.W4;
ok('W5 analogy 無博物館/展品', !w5.analogy.some(a=>a.includes('博物館')||a.includes('展品')));
ok('W5 tiger 無博物館/展品',   !(w5.tiger.includes('博物館')||w5.tiger.includes('展品')));
if(w5.songA){
  ok('W5 songA lyrics 無博物館', !w5.songA.lyrics.includes('博物館'));
  ok('W5 songA hook 無展品',     !w5.songA.hook.includes('展品'));
}
// 「哪科」或「哪一科」都接受，重點是不以「幾點」為唯一解法
ok('W2.nextAction 含「哪」（哪科/哪一科）且不含「幾點」',
  w2.nextAction.includes('哪')&&!w2.nextAction.includes('幾點'), w2.nextAction);
if(w2.songA) ok('W2 songA hook 不含「幾點開始你說了算」', !w2.songA.hook.includes('幾點開始你說了算'), w2.songA.hook.split('\n')[0]);
if(w2.songB) ok('W2 songB hook 不含「幾點上場選手說」',   !w2.songB.hook.includes('幾點上場選手說'),   w2.songB.hook.split('\n')[0]);
ok('W3 無 songA（待核准）', !w3.songA);
ok('W4 無 songA（待核准）', !w4.songA);
ok('W3 無 songB（待核准）', !w3.songB);
ok('W4 無 songB（待核准）', !w4.songB);

/* ── T3: genRoast 回傳 9 個欄位 ── */
console.log('\n=== T3: genRoast 回傳 9 個欄位（全非空）===');
sandbox.flow.context=emptyContext();
const r3=genRoast('孩子不寫作業','孩子');
const FIELDS=['comicWorld','truth','analogy','honest','boundary','comicExit','nextAction','resolutionWish','callback'];
FIELDS.forEach(f=>ok(`genRoast.${f} 非空`,
  r3[f]!==undefined&&r3[f]!==null&&r3[f]!=='', String(r3[f]).slice(0,30)));
ok('comicWorld ∈ W1-W5', WORLDS.includes(r3.comicWorld), r3.comicWorld);

/* ── T4: 連續生成不重複世界 ── */
console.log('\n=== T4: 12 次再生成不連續重複世界 ===');
Object.keys(ssMap).forEach(k=>{ if(k.startsWith('lsr_recent_')) delete ssMap[k]; });
sandbox.flow.context=emptyContext();
const seq4=[]; let consecutive=false;
for(let i=0;i<12;i++){
  const r=genRoast('孩子不寫作業','孩子');
  if(seq4.length&&r.comicWorld===seq4[seq4.length-1]){ consecutive=true; break; }
  seq4.push(r.comicWorld);
}
ok('12 次無連續重複', !consecutive, seq4.join('→'));

/* ── T5: 草稿儲存 / 恢復 ── */
console.log('\n=== T5: 草稿儲存 / 恢復（9 欄位完全一致）===');
clearDraft();
sandbox.flow.context=emptyContext();
const r5=genRoast('孩子不寫作業','孩子');
FIELDS.forEach(f=>{ sandbox.flow.context[f]=r5[f]; });
sandbox.flow.context.event='孩子不寫作業';
sandbox.flow.context.targetCategory=r5.targetCategory||'child';
sandbox.flow.context.situationCategory=r5.situationCategory||'homework';
saveDraft();
const draft=loadDraft();
ok('草稿 loadDraft 非空', !!draft);
if(draft){
  FIELDS.forEach(f=>ok(`草稿.${f} 一致`,
    draft.context&&draft.context[f]===sandbox.flow.context[f],
    draft.context?String(draft.context[f]).slice(0,25):'無'));
}

/* ── T6: 全流程銜接（W1/W2/W5）── */
console.log('\n=== T6: 全流程銜接（嗆聲→唬爛虎→SongA→SongB→分享）===');
['W1','W2','W5'].forEach(wt=>{
  Object.keys(ssMap).forEach(k=>{ if(k.startsWith('lsr_recent_')) delete ssMap[k]; });
  sandbox.flow.context=emptyContext();
  let rW=null;
  for(let i=0;i<40;i++){
    const r=genRoast('孩子不寫作業','孩子');
    if(r.comicWorld===wt){ rW=r; break; }
  }
  if(!rW){ ok(`${wt} 可觸發（40次內）`,false,'無法觸發'); return; }
  ok(`${wt} 可觸發`, true, wt);

  FIELDS.forEach(f=>{ sandbox.flow.context[f]=rW[f]; });
  sandbox.flow.context.situationCategory='homework';
  sandbox.flow.context.targetCategory='child';

  // 唬爛虎
  const tiger=genBigDream('','');
  const tigerFull=tiger.blocks?tiger.blocks.map(b=>b.join(' ')).join(' '):'';
  const worldTigerSnippet=(hw.worlds[wt].tiger||'').slice(0,8);
  ok(`${wt} 唬爛虎用世界 tiger`, tigerFull.includes(worldTigerSnippet),
    tigerFull.slice(0,40));

  // Song A
  const sa=genSongVersionA(sandbox.flow.context);
  const expectedHookA=hw.worlds[wt].songA&&hw.worlds[wt].songA.hook;
  ok(`${wt} songA hook 一致`, expectedHookA&&sa.hook===expectedHookA,
    sa.hook?sa.hook.split('\n')[0]:'(無)');

  // Song B
  const sb=genSongVersionB(sandbox.flow.context);
  const expectedHookB=hw.worlds[wt].songB&&hw.worlds[wt].songB.hook;
  ok(`${wt} songB hook 一致`, expectedHookB&&sb.hook===expectedHookB,
    sb.hook?sb.hook.split('\n')[0]:'(無)');

  // 分享文案
  sandbox.flow.context.songVersions=[sa,sb];
  const share=genShareCopy(sandbox.flow.context);
  const cb=rW.callback||'';
  const hk0=sa.hook?sa.hook.split('\n')[0]:'';
  const shareAll=[share.line,share.fb,share.ig,share.threads].join(' ');
  const cbHit=cb&&shareAll.includes(cb.slice(0,8));
  const hkHit=hk0&&shareAll.includes(hk0.slice(0,6));
  ok(`${wt} 分享文案回收 callback 或 hook`, cbHit||hkHit,
    cbHit?`cb="${cb.slice(0,15)}"`:hkHit?`hk="${hk0.slice(0,15)}"`:
    `miss: cb="${cb.slice(0,12)}" hk="${hk0.slice(0,12)}"`);
});

/* ── T7: W3/W4 Gating ── */
console.log('\n=== T7: W3/W4 Gating（style 顯示製作中）===');
['W3','W4'].forEach(wg=>{
  sandbox.flow.context=emptyContext();
  sandbox.flow.context.comicWorld=wg;
  sandbox.flow.context.situationCategory='homework';
  sandbox.flow.context.targetCategory='child';
  const wd7=hw.worlds[wg];
  sandbox.flow.context.callback=wd7.callback[0];
  sandbox.flow.context.comicExit=wd7.comicExit[0];
  sandbox.flow.context.nextAction=wd7.nextAction;
  sandbox.flow.context.boundary=wd7.nextAction;
  sandbox.flow.context.resolutionWish=wd7.resolutionWish[0];
  const saG=genSongVersionA(sandbox.flow.context);
  ok(`${wg} songA style 含「製作中」`, (saG.style||'').includes('製作中'), saG.style||'(無)');
  ok(`${wg} songA 非通用 Lo-fi/Pop`,  !(saG.genre||'').includes('Lo-fi')&&!(saG.genre||'').includes('輕快 Pop'), saG.genre||'(無)');
  ok(`${wg} songA hook 非空`,          (saG.hook||'').length>0, saG.hook||'(空)');
  const sbG=genSongVersionB(sandbox.flow.context);
  ok(`${wg} songB style 含「製作中」`, (sbG.style||'').includes('製作中'), sbG.style||'(無)');
  ok(`${wg} songB 非通用 Indie/電音`,  !(sbG.genre||'').includes('Indie')&&!(sbG.genre||'').includes('電音底'), sbG.genre||'(無)');
  ok(`${wg} songB hook 非空`,          (sbG.hook||'').length>0, sbG.hook||'(空)');
});

/* ── T8: 快速模式獨立 ── */
console.log('\n=== T8: 快速模式獨立 ===');
sandbox.flow.context=emptyContext();
const qr=genRoast('孩子不寫作業','孩子');
ok('快速 genRoast 有 4 個 blocks', qr.blocks&&qr.blocks.length===4, String(qr.blocks&&qr.blocks.length));
ok('快速 genRoast 有 comicWorld',  !!qr.comicWorld, qr.comicWorld||'none');
sandbox.flow.context=emptyContext();
const qb=genBigDream('我的大夢','學習');
ok('無 comicWorld 的 bigdream 有 blocks', qb.blocks&&qb.blocks.length>0);

/* ── T9: 禁止用語 ── */
console.log('\n=== T9: 禁止用語（不得出現於任何詞庫）===');
const FORBIDDEN=[
  '作業贏了，你輸了',
  '我不問你現在是什麼感覺',
  '幾點上場選手說',
  '幾點開始你說了算',
  '焦慮是我的功課，作業是孩子的事',
  '博物館',
];
const allTexts=[
  ...hw.truth,...hw.honest,...hw.boundary,...(hw.comicExit||[]),
  ...WORLDS.flatMap(w=>hw.worlds[w].analogy||[]),
  ...WORLDS.flatMap(w=>hw.worlds[w].comicExit||[]),
  ...WORLDS.flatMap(w=>hw.worlds[w].resolutionWish||[]),
  ...WORLDS.flatMap(w=>hw.worlds[w].callback||[]),
  ...WORLDS.flatMap(w=>hw.worlds[w].songA?[hw.worlds[w].songA.hook,hw.worlds[w].songA.lyrics]:[]),
  ...WORLDS.flatMap(w=>hw.worlds[w].songB?[hw.worlds[w].songB.hook,hw.worlds[w].songB.lyrics]:[]),
];
FORBIDDEN.forEach(f=>{
  const hit=allTexts.find(s=>s&&s.includes(f));
  ok(`"${f}" 不出現`, !hit, hit?`出現：${hit.slice(0,50)}…`:'');
});

/* ── 最終輸出 ── */
console.log('\n'+log.join('\n'));
console.log(`\n${'═'.repeat(58)}`);
console.log(`✅ Passed: ${passed}   ❌ Failed: ${failed}   Total: ${passed+failed}`);
if(failed>0){ console.log('\n❌ 驗收未通過，請修正後再次執行。'); process.exit(1); }
else { console.log('\n✅ 所有測試通過。'); }
