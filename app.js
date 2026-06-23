'use strict';

const CONFIG = {
  gasEndpoint: '', // Apps Script Web App URL. Empty keeps records on this device.
  gaMeasurementId: '', // Example: G-ABC1234567
  clarityProjectId: '',
  partner: {
    name: '智慧之門合作方',
    referralCode: 'LAUGH-MOUSE-DEMO',
    url: '',
    apiEndpoint: ''
  }
};

const MODE_META = {
  roast: { label: '小天鼠上線', eventMode: '嗆聲模式' },
  selfMock: { label: '小天鼠自嘲室', eventMode: '自嘲模式' },
  bigDream: { label: '唬爛虎開講', eventMode: '畫大餅模式' },
  lost: { label: '迷航導航中', eventMode: '迷航模式' },
  strength: { label: '亮點探照燈', eventMode: '我的亮點' },
  director: { label: '自導自演開拍', eventMode: '自導自演' },
  workshop: { label: '創作工坊啟動', eventMode: '創作工坊' },
  share: { label: '分享文案出爐', eventMode: '分享模式' }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  mode: 'roast',
  route: 'easy',
  lastInput: '',
  lastOutput: '',
  lastRecord: null,
  variationIndex: 0,
  deferredInstallPrompt: null
};

const ids = getIdentity();

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindUi();
  registerServiceWorker();
  initializeAnalytics();
  trackEvent('APP_OPEN', { route: state.route });
  await saveRecord(buildRecord('APP_OPEN', '', ''), { silent: true });
}

function bindUi() {
  $$('.mode-card').forEach((button) => {
    button.addEventListener('click', () => selectMode(button.dataset.mode));
  });

  $$('.route').forEach((button) => {
    button.addEventListener('click', () => selectRoute(button.dataset.route));
  });

  $('#generateBtn').addEventListener('click', () => generate(false));
  $('#regenBtn').addEventListener('click', () => generate(true));
  $('#copyBtn').addEventListener('click', copyResult);
  $('#shareBtn').addEventListener('click', shareResult);
  $('#workshopBtn').addEventListener('click', enterWorkshop);
  $('#waitlistBtn').addEventListener('click', joinWaitlist);
  $('#partnerBtn').addEventListener('click', partnerClick);

  $$('.workshop-grid button').forEach((button) => {
    button.addEventListener('click', () => runWorkshopTool(button.dataset.tool));
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    $('#installBtn').hidden = false;
  });

  $('#installBtn').addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    $('#installBtn').hidden = true;
  });
}

function selectMode(mode) {
  state.mode = mode;
  $$('.mode-card').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#modeLabel').textContent = MODE_META[mode].label;
  trackEvent('MODE_SELECT', { mode: MODE_META[mode].eventMode });
}

function selectRoute(route) {
  state.route = route;
  $$('.route').forEach((button) => {
    const active = button.dataset.route === route;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $('#routeHint').textContent = route === 'easy'
    ? '選模式 → 輸入一句話 → 產生 → 複製分享'
    : '一句話 → 情緒轉化 → 願景 → 亮點 → 故事 → 創作 → 分享';
}

async function generate(isRegenerate) {
  const input = $('#userInput').value.trim();
  if (!input) {
    setResult('先丟一句話啦。小天鼠沒有讀心術，只有嘴砲術。', '等你一句話');
    return;
  }

  state.lastInput = input;
  let output = state.route === 'full' ? generateFullJourney(input) : generateByMode(state.mode, input);
  if (isRegenerate) output = addVariation(output);
  state.lastOutput = avoidRepeat(output, state.lastOutput);
  const record = buildRecord(isRegenerate ? 'REGENERATE' : 'GENERATE', input, state.lastOutput);
  state.lastRecord = record;

  setResult(state.lastOutput, '儲存中...');
  toggleResultActions(true);
  $('#regenBtn').disabled = false;
  trackEvent(isRegenerate ? 'REGENERATE' : 'GENERATE', { mode: MODE_META[state.mode].eventMode, route: state.route });
  await saveRecord(record);
}

function generateByMode(mode, input) {
  const generators = {
    roast: generateRoast,
    selfMock: generateSelfMock,
    bigDream: generateBigDream,
    lost: generateLost,
    strength: generateStrength,
    director: generateDirector,
    workshop: generateWorkshop,
    share: generateShareCopy
  };
  return generators[mode](input);
}

function generateFullJourney(input) {
  return [
    '【情緒翻譯】',
    generateLost(input),
    '',
    '【願望放大】',
    generateBigDream(input),
    '',
    '【亮點整理】',
    generateStrength(input),
    '',
    '【自導自演】',
    generateDirector(input),
    '',
    '【創作出口】',
    generateWorkshop(input),
    '',
    '【分享文案】',
    generateShareCopy(input)
  ].join('\n');
}

function generateRoast(input) {
  return `😤 小天鼠翻譯機：
你說：「${input}」
我聽到的是：「我已經很努力了，但生活還在旁邊按重播鍵。」

嗆聲版：
今天的煩惱不要太囂張，你只是臨時演員，不是我人生導演。
我可以崩潰三分鐘，但第四分鐘要開始把你寫成段子。

一句毒雞湯：
別怕丟臉，臉只是社交皮膚，不是靈魂不動產。`;
}

function generateSelfMock(input) {
  return `🤣 自嘲模式：
我原本以為「${input}」是人生低谷。
後來發現不是低谷，是我在谷底開了分店。

但也行啦，至少我很穩，穩定地離譜。
今天先承認自己像未更新的 App，卡是卡了一點，重新整理還是有希望。`;
}

function generateBigDream(input) {
  return `🐯 唬爛虎願景放大：
你以為你在煩「${input}」。
其實你是在預告：我想要更大的舞台、更爽的節奏、更像自己的生活。

畫大餅版願望：
我不是要逃避現實，我是要把現實升級到配得上我的版本。
今天先吹牛，明天拆步驟，後天讓別人說：你怎麼真的做到了？`;
}

function generateLost(input) {
  const map = [
    ['焦慮', '大腦怕你受傷，像保全太盡責，連紙箱都當刺客。'],
    ['嫉妒', '不是你壞，是你心裡有一句「我也想要」正在敲碗。'],
    ['拖延', '通常不是懶，是任務太大或怕失敗，大腦直接裝死省電。'],
    ['生氣', '多半是界線被踩到，你的內心警報器在喊：鞋子拿開。']
  ];
  const picked = map.find(([key]) => input.includes(key)) || map[Math.floor(Math.random() * map.length)];
  return `🧭 迷航翻譯：
「${input}」

大腦導航說：${picked[1]}

親民版重算路線：
先不要逼自己立刻變超人。把事情切成一口大小，先做 5 分鐘，讓大腦知道這不是山崩，是一小塊餅乾。`;
}

function generateStrength(input) {
  return `💎 我的亮點：
從「${input}」裡挖到三顆鑽石：
1. 你有感覺，代表你不是麻木機器。
2. 你想改變，代表心裡還有一個不服輸的小引擎。
3. 你願意說出來，代表這件事已經從內耗變成素材。

亮點標題：
《把爛局翻成作品的人》`;
}

function generateDirector(input) {
  return `🎬 自導自演三幕劇：
片名：《今天也沒有被人生剪掉》

第一幕：主角遇到「${input}」，表面冷靜，內心彈幕已經爆量。
第二幕：主角把情緒翻成願望，發現自己不是廢，是正在載入。
第三幕：主角用一個小行動反擊，沒有立刻封神，但成功把煩惱變成片尾花絮。

金句：我不是卡關，我是在等劇情更新。`;
}

function generateWorkshop(input) {
  return `🎤 創作工坊草稿：
歌名：《笑到有風》
主歌：我把「${input}」塞進口袋，走路有點歪，但眼神還亮。
副歌：笑掉煩惱，吹大夢想，今天狼狽也能發光。

AI 繪圖提示：
歡樂人生片場，一個普通人把煩惱氣球吹成星球，暖黃色、珊瑚紅、電影感、幽默但不幼稚。

MV 分鏡：
1. 手機跳出煩惱訊息。
2. 主角深呼吸，表情從崩潰變成想笑。
3. 煩惱變成彩色道具，大家一起收工。`;
}

function generateShareCopy(input) {
  return `📣 分享模式：
今天把「${input}」交給小天鼠處理。

結論是：我沒有輸，我只是素材比較多。
煩惱先退下，夢想請上桌，人生這齣戲我本人還要加戲。

#笑鼠人了 #把人生活成作品 #今日笑果`;
}

function avoidRepeat(newText, lastText) {
  if (!lastText || newText !== lastText) return newText;
  return `${newText}\n\n加碼：同一招又來？沒事，人生也是靠重播練成代表作。`;
}

function setResult(text, status) {
  $('#resultText').textContent = text;
  $('#saveStatus').textContent = status;
}

function toggleResultActions(enabled) {
  $('#copyBtn').disabled = !enabled;
  $('#shareBtn').disabled = !enabled;
  $('#workshopBtn').disabled = !enabled;
}

async function copyResult() {
  try {
    await copyText(state.lastOutput);
    $('#saveStatus').textContent = '已複製';
    trackEvent('COPY', { mode: MODE_META[state.mode].eventMode });
    await saveRecord(buildRecord('COPY', state.lastInput, state.lastOutput));
  } catch (error) {
    console.warn('Copy failed', error);
    $('#saveStatus').textContent = '複製失敗，請手動選取';
  }
}

function addVariation(output) {
  const variations = [
    '小天鼠補一句：今天先贏五分鐘，剩下的明天再演。',
    '唬爛虎補一句：願望可以吹大，下一步記得切小。',
    '導演補一句：這場不必完美，先留下可以剪進正片的鏡頭。',
    '片尾彩蛋：你不是沒進度，你正在累積很好笑的幕後花絮。'
  ];
  const variation = variations[state.variationIndex % variations.length];
  state.variationIndex += 1;
  return `${output}\n\n【這版加碼】\n${variation}`;
}

async function shareResult() {
  const shareData = { title: '笑鼠人了！', text: state.lastOutput, url: location.href };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await copyText(`${shareData.text}\n${shareData.url}`);
    }
    $('#saveStatus').textContent = navigator.share ? '已分享' : '分享內容已複製';
    trackEvent('SHARE', { mode: MODE_META[state.mode].eventMode });
    await saveRecord(buildRecord('SHARE', state.lastInput, state.lastOutput));
  } catch (error) {
    if (error.name !== 'AbortError') console.warn('Share failed', error);
  }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard API unavailable');
}

function enterWorkshop() {
  $('#workshopPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  trackEvent('ENTER_WORKSHOP', { mode: MODE_META[state.mode].eventMode });
}

function runWorkshopTool(tool) {
  const input = state.lastInput || $('#userInput').value.trim() || '今天有點亂，但我想把它變成作品';
  const outputMap = {
    song: generateSong(input),
    image: generateImagePrompt(input),
    video: generateStoryboard(input)
  };
  const eventMap = { song: 'GENERATE_SONG', image: 'GENERATE_IMAGE', video: 'GENERATE_VIDEO' };
  $('#workshopOutput').textContent = outputMap[tool];
  trackEvent(eventMap[tool], { mode: MODE_META[state.mode].eventMode });
  saveRecord(buildRecord(eventMap[tool], input, outputMap[tool]));
}

function generateSong(input) {
  return `歌名：《把今天笑回來》
風格：明亮華語流行，帶一點喜劇片片尾曲感
主歌：${input}
副歌：笑掉煩惱，吹大夢想，我把狼狽唱成發光`;
}

function generateImagePrompt(input) {
  return `一個歡樂的人生創作片場，主角把「${input}」變成彩色氣球和電影道具，暖黃色陽光、珊瑚紅點綴、幽默表情、動態構圖、適合社群分享。`;
}

function generateStoryboard(input) {
  return `MV 分鏡：
1. 近景：主角看著手機，畫面文字「${input}」。
2. 中景：小天鼠把火氣吹成笑氣，唬爛虎拿出超大願望看板。
3. 遠景：主角走進片場，煩惱變成道具，燈光亮起。
4. 結尾：字幕「把人生活成作品」。`;
}

function joinWaitlist() {
  const email = prompt('留下 email，智慧之門開門時通知你。');
  if (!email) return;
  trackEvent('JOIN_WAITLIST', { source: 'partner_panel' });
  saveRecord({ ...buildRecord('JOIN_WAITLIST', email, '智慧之門等待名單'), email });
  $('#saveStatus').textContent = '已加入等待名單';
}

function partnerClick() {
  trackEvent('PARTNER_CLICK', { partner: CONFIG.partner.name, referralCode: CONFIG.partner.referralCode });
  saveRecord({
    ...buildRecord('PARTNER_CLICK', CONFIG.partner.name, CONFIG.partner.url),
    partner: CONFIG.partner,
    partnerId: CONFIG.partner.name,
    referralCode: CONFIG.partner.referralCode,
    targetUrl: CONFIG.partner.url
  });
  if (CONFIG.partner.url) {
    location.href = `${CONFIG.partner.url}?ref=${encodeURIComponent(CONFIG.partner.referralCode)}&uid=${encodeURIComponent(ids.userId)}`;
  } else {
    alert('合作接口已預留：可設定合作方連結、推薦碼、API endpoint、導流紀錄與白標頁。');
  }
}

function buildRecord(action, input, output) {
  return {
    timestamp: new Date().toISOString(),
    action,
    mode: MODE_META[state.mode].eventMode,
    route: state.route,
    input,
    output,
    userId: ids.userId,
    sessionId: ids.sessionId,
    url: location.href,
    userAgent: navigator.userAgent
  };
}

async function saveRecord(record, options = {}) {
  saveRecentLocal(record);
  if (!CONFIG.gasEndpoint) {
    if (!options.silent) $('#saveStatus').textContent = '已存在本機';
    return;
  }
  try {
    await fetch(CONFIG.gasEndpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(record)
    });
    if (!options.silent) $('#saveStatus').textContent = '已送出紀錄';
  } catch (error) {
    console.warn('saveRecord failed', error);
    if (!options.silent) $('#saveStatus').textContent = '本機已保存';
  }
}

function saveRecentLocal(record) {
  const key = 'laughMouseRecentRecords';
  let current = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    current = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Recent records were reset', error);
  }
  current.unshift(record);
  try {
    localStorage.setItem(key, JSON.stringify(current.slice(0, 20)));
  } catch (error) {
    console.warn('Local record storage unavailable', error);
  }
}

function getIdentity() {
  const userKey = 'laughMouseUserId';
  let userId = null;
  try {
    userId = localStorage.getItem(userKey);
  } catch (error) {
    console.warn('localStorage unavailable', error);
  }
  if (!userId) {
    userId = `u_${createRandomId()}`;
    try { localStorage.setItem(userKey, userId); } catch (error) { console.warn('userId not persisted', error); }
  }
  const sessionId = `s_${createRandomId()}`;
  try { localStorage.setItem('laughMouseSessionId', sessionId); } catch (error) { console.warn('sessionId not persisted', error); }
  return { userId, sessionId };
}

function createRandomId() {
  return globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function initializeAnalytics() {
  if (CONFIG.gaMeasurementId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', CONFIG.gaMeasurementId, { send_page_view: false, user_id: ids.userId });
    loadExternalScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(CONFIG.gaMeasurementId)}`);
  }
  if (CONFIG.clarityProjectId) {
    window.clarity = window.clarity || function clarity() {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    loadExternalScript(`https://www.clarity.ms/tag/${encodeURIComponent(CONFIG.clarityProjectId)}`);
    window.clarity('identify', ids.userId, ids.sessionId);
  }
}

function loadExternalScript(src) {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function trackEvent(name, params = {}) {
  const payload = { ...params, user_id: ids.userId, session_id: ids.sessionId };
  if (typeof window.gtag === 'function' && CONFIG.gaMeasurementId) {
    window.gtag('event', name, payload);
  }
  if (typeof window.clarity === 'function' && CONFIG.clarityProjectId) {
    window.clarity('event', name);
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('service-worker.js');
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
}
