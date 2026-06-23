const SHEET_NAMES = [
  '01_生成紀錄',
  '02_模式設定',
  '03_小天鼠詞庫',
  '04_唬爛虎詞庫',
  '05_迷航翻譯庫',
  '06_亮點庫',
  '07_自導自演劇本庫',
  '08_歌曲模板庫',
  '09_繪圖提示庫',
  '10_影片分鏡庫',
  '11_分享文案庫',
  '12_禁用詞',
  '13_近期使用紀錄',
  '14_合作夥伴設定',
  '15_合作導流紀錄',
  '16_會員資料',
  '17_創作紀錄',
  '18_分享紀錄',
  '19_每日統計',
  '20_內容排行榜'
];

const RECORD_HEADERS = [
  'timestamp',
  'action',
  'mode',
  'route',
  'input',
  'output',
  'userId',
  'sessionId',
  'url',
  'userAgent',
  'partner',
  'email',
  'partnerId',
  'referralCode',
  'targetUrl'
];

function doGet() {
  return jsonOutput({
    ok: true,
    app: '笑鼠人了！',
    message: 'GAS endpoint ready. 不算命，不解卦，只負責把紀錄好好接住。'
  });
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    var generated = data.output ? data : simpleGenerate(data);
    var saved = saveRecord(generated);
    return jsonOutput({ ok: true, saved: saved, data: generated });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SHEET_NAMES.forEach(function(name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(getHeadersForSheet(name));
    }
    seedSheet(sheet, name);
  });
  return jsonOutput({ ok: true, sheets: SHEET_NAMES });
}

function getHeadersForSheet(name) {
  if (name === '14_合作夥伴設定') return ['partnerId', 'name', 'url', 'apiEndpoint', 'referralCode', 'revenueShare', 'whiteLabelUrl', 'enabled'];
  if (name === '15_合作導流紀錄') return ['timestamp', 'partnerId', 'userId', 'sessionId', 'referralCode', 'targetUrl', 'action'];
  if (name === '16_會員資料') return ['userId', 'createdAt', 'lastSeenAt', 'note'];
  if (name === '19_每日統計') return ['date', 'appOpen', 'generate', 'copy', 'share', 'partnerClick'];
  if (name === '20_內容排行榜') return ['contentHash', 'mode', 'output', 'copyCount', 'shareCount', 'lastUsedAt'];
  return RECORD_HEADERS;
}

function seedSheet(sheet, name) {
  if (sheet.getLastRow() > 1) return;
  var seeds = {
    '02_模式設定': ['roast', '嗆聲模式', '把火氣變笑氣', 'enabled'],
    '03_小天鼠詞庫': ['毒雞湯', '別怕丟臉，臉只是社交皮膚。', '1'],
    '04_唬爛虎詞庫': ['願景', '先吹牛，後拆步驟。', '1'],
    '05_迷航翻譯庫': ['拖延', '任務太大或怕失敗，大腦直接裝死省電。', '1'],
    '06_亮點庫': ['亮點', '你願意說出來，代表內耗已經變素材。', '1'],
    '07_自導自演劇本庫': ['三幕劇', '遇到卡關、翻成願望、做一個小行動。', '1'],
    '08_歌曲模板庫': ['明亮華語流行', '笑掉煩惱，吹大夢想。', '1'],
    '09_繪圖提示庫': ['人生創作片場', '暖黃色、珊瑚紅、幽默表情、電影感。', '1'],
    '10_影片分鏡庫': ['MV', '煩惱訊息、情緒轉化、片場發光。', '1'],
    '11_分享文案庫': ['社群', '我沒有輸，我只是素材比較多。', '1'],
    '12_禁用詞': ['醫療承諾', '診斷、治療、保證成功、算命斷言', 'enabled'],
    '14_合作夥伴設定': ['wisdom-gate-demo', '智慧之門合作方', '', '', 'LAUGH-MOUSE-DEMO', '', '', 'false']
  };
  if (seeds[name]) sheet.appendRow(seeds[name]);
}

function saveRecord(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('01_生成紀錄') || ss.insertSheet('01_生成紀錄');
  if (sheet.getLastRow() === 0) sheet.appendRow(RECORD_HEADERS);
  var clean = normalizeRecord(data);
  sheet.appendRow(RECORD_HEADERS.map(function(key) { return clean[key] || ''; }));
  saveRecentRecord(clean);
  saveCreationRecord(clean);
  if (clean.action === 'SHARE') saveShareRecord(clean);
  if (clean.action === 'PARTNER_CLICK') trackPartnerClick(clean);
  updateDailyStats(clean);
  updateContentRanking(clean);
  return true;
  } finally {
    lock.releaseLock();
  }
}

function normalizeRecord(data) {
  data = data || {};
  return {
    timestamp: data.timestamp || new Date().toISOString(),
    action: sanitizeText(data.action || 'GENERATE'),
    mode: sanitizeText(data.mode || ''),
    route: sanitizeText(data.route || ''),
    input: sanitizeText(data.input || ''),
    output: sanitizeText(data.output || ''),
    userId: sanitizeText(data.userId || ''),
    sessionId: sanitizeText(data.sessionId || ''),
    url: sanitizeText(data.url || ''),
    userAgent: sanitizeText(data.userAgent || ''),
    partner: data.partner ? JSON.stringify(data.partner) : '',
    email: sanitizeText(data.email || ''),
    partnerId: sanitizeText(data.partnerId || (data.partner && data.partner.partnerId) || (data.partner && data.partner.name) || ''),
    referralCode: sanitizeText(data.referralCode || (data.partner && data.partner.referralCode) || ''),
    targetUrl: sanitizeText(data.targetUrl || (data.partner && data.partner.url) || '')
  };
}

function sanitizeText(text) {
  var clean = String(text || '')
    .replace(/[<>]/g, '')
    .replace(/\b(診斷|治療|保證成功|算命斷言)\b/g, '保留一點神秘但不亂承諾')
    .slice(0, 4000);
  return /^[=+\-@]/.test(clean) ? "'" + clean : clean;
}

function simpleGenerate(data) {
  data = data || {};
  var mode = data.mode || '嗆聲模式';
  if (mode === '自嘲模式') return generateSelfMockMode(data);
  if (mode === '畫大餅模式') return generateBigDreamMode(data);
  if (mode === '迷航模式') return generateLostMode(data);
  if (mode === '我的亮點') return generateStrengthMode(data);
  if (mode === '自導自演') return generateDirectorMode(data);
  if (mode === '創作工坊') return generateCreativeWorkshop(data);
  if (mode === '分享模式') return generateShareCopy(data);
  return generateRoastMode(data);
}

function generateRoastMode(data) {
  var input = sanitizeText(data.input || '今天有點煩');
  data.output = '小天鼠：' + input + ' 先不要囂張，煩惱只是臨演，不是人生導演。';
  return data;
}

function generateSelfMockMode(data) {
  var input = sanitizeText(data.input || '我又卡住了');
  data.output = '自嘲版：我以為 ' + input + ' 是低谷，結果我在谷底開了分店，但至少很有商業頭腦。';
  return data;
}

function generateBigDreamMode(data) {
  var input = sanitizeText(data.input || '我想變好');
  data.output = '唬爛虎：' + input + ' 不是妄想，是願景還沒拆成待辦事項。先吹牛，後拆步驟。';
  return data;
}

function generateLostMode(data) {
  var input = sanitizeText(data.input || '我很焦慮');
  data.output = '迷航翻譯：' + input + ' 可能是大腦怕你受傷，保全太認真。先切成 5 分鐘小任務。';
  return data;
}

function generateStrengthMode(data) {
  var input = sanitizeText(data.input || '我很亂');
  data.output = '亮點整理：' + input + ' 代表你還有感覺、還想改變、還願意把內耗變素材。';
  return data;
}

function generateDirectorMode(data) {
  var input = sanitizeText(data.input || '今天卡關');
  data.output = '三幕劇：第一幕 ' + input + '。第二幕翻成願望。第三幕做一個小行動，片尾字幕：我還沒下片。';
  return data;
}

function generateCreativeWorkshop(data) {
  var input = sanitizeText(data.input || '把今天變作品');
  data.output = generateSong({ input: input }).output + '\n' + generateImagePrompt({ input: input }).output + '\n' + generateStoryboard({ input: input }).output;
  return data;
}

function generateShareCopy(data) {
  var input = sanitizeText(data.input || '今天也努力了');
  data.output = '今天把「' + input + '」交給小天鼠。結論：我沒有輸，我只是素材比較多。#笑鼠人了';
  return data;
}

function generateSong(data) {
  var input = sanitizeText(data.input || '今天有點亂');
  data.output = '歌名：《把今天笑回來》\n主歌：' + input + '\n副歌：笑掉煩惱，吹大夢想，我把狼狽唱成發光。';
  return data;
}

function generateSunoPrompt(data) {
  var input = sanitizeText(data.input || '情緒轉化');
  data.output = 'Mandopop comedy ending theme, bright, warm, playful, lyric theme: ' + input + ', catchy chorus.';
  return data;
}

function generateImagePrompt(data) {
  var input = sanitizeText(data.input || '人生片場');
  data.output = '歡樂人生創作片場，主角把「' + input + '」變成彩色道具，暖黃色、珊瑚紅、電影感、幽默但不幼稚。';
  return data;
}

function generateStoryboard(data) {
  var input = sanitizeText(data.input || '煩惱變作品');
  data.output = '1. 手機出現「' + input + '」。2. 小天鼠把火氣變笑氣。3. 唬爛虎拿出願景看板。4. 主角走向片場燈光。';
  return data;
}

function generateVideoPrompt(data) {
  var input = sanitizeText(data.input || '笑出來');
  data.output = '短影音提示：普通人把「' + input + '」轉化成片場作品，節奏明快，喜劇感，結尾字幕「把人生活成作品」。';
  return data;
}

function weightedPick(items) {
  if (!items || !items.length) return null;
  var total = items.reduce(function(sum, item) { return sum + Number(item.weight || 1); }, 0);
  var roll = Math.random() * total;
  for (var i = 0; i < items.length; i++) {
    roll -= Number(items[i].weight || 1);
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function avoidRepeat(newText, lastText) {
  if (!lastText || newText !== lastText) return newText;
  return newText + '\n加碼：同一句再來一次，表示人生正在幫你做 A/B test。';
}

function getPartnerConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('14_合作夥伴設定');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return values.map(function(row) {
    return {
      partnerId: row[0],
      name: row[1],
      url: row[2],
      apiEndpoint: row[3],
      referralCode: row[4],
      revenueShare: row[5],
      whiteLabelUrl: row[6],
      enabled: String(row[7]) === 'true'
    };
  });
}

function trackPartnerClick(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('15_合作導流紀錄') || ss.insertSheet('15_合作導流紀錄');
  if (sheet.getLastRow() === 0) sheet.appendRow(getHeadersForSheet('15_合作導流紀錄'));
  sheet.appendRow([
    new Date().toISOString(),
    data.partnerId || '',
    data.userId || '',
    data.sessionId || '',
    data.referralCode || '',
    data.targetUrl || '',
    data.action || 'PARTNER_CLICK'
  ]);
  return true;
}

function redirectToPartner() {
  var partner = getPartnerConfig().filter(function(item) { return item.enabled && /^https:\/\//i.test(item.url); })[0];
  if (!partner) return HtmlService.createHtmlOutput('智慧之門 Coming Soon');
  var separator = partner.url.indexOf('?') === -1 ? '?' : '&';
  var target = partner.url + separator + 'ref=' + encodeURIComponent(partner.referralCode || '');
  return HtmlService.createHtmlOutput('<script>location.replace(' + JSON.stringify(target) + ');</script>');
}

function getPartnerTrial() {
  return {
    ok: true,
    status: 'coming_soon',
    message: '智慧之門目前只預留接口，不做易經、不算命、不解卦。'
  };
}

function callPartnerApi(payload) {
  var config = (getPartnerConfig() || []).filter(function(item) { return item.enabled && item.apiEndpoint; })[0];
  if (!config) return { ok: false, message: 'No enabled partner API endpoint.' };
  var response = UrlFetchApp.fetch(config.apiEndpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  });
  return { ok: true, status: response.getResponseCode(), body: response.getContentText() };
}

function savePartnerLead(data) {
  data = data || {};
  data.action = 'PARTNER_LEAD';
  return saveRecord(data);
}

function saveRecentRecord(clean) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('13_近期使用紀錄') || ss.insertSheet('13_近期使用紀錄');
  if (sheet.getLastRow() === 0) sheet.appendRow(RECORD_HEADERS);
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, RECORD_HEADERS.length).setValues([RECORD_HEADERS.map(function(key) { return clean[key] || ''; })]);
  if (sheet.getLastRow() > 101) sheet.deleteRows(102, sheet.getLastRow() - 101);
}

function saveCreationRecord(clean) {
  if (['GENERATE_SONG', 'GENERATE_IMAGE', 'GENERATE_VIDEO'].indexOf(clean.action) === -1) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('17_創作紀錄') || ss.insertSheet('17_創作紀錄');
  if (sheet.getLastRow() === 0) sheet.appendRow(RECORD_HEADERS);
  sheet.appendRow(RECORD_HEADERS.map(function(key) { return clean[key] || ''; }));
}

function saveShareRecord(clean) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('18_分享紀錄') || ss.insertSheet('18_分享紀錄');
  if (sheet.getLastRow() === 0) sheet.appendRow(RECORD_HEADERS);
  sheet.appendRow(RECORD_HEADERS.map(function(key) { return clean[key] || ''; }));
}

function updateDailyStats(clean) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('19_每日統計') || ss.insertSheet('19_每日統計');
  if (sheet.getLastRow() === 0) sheet.appendRow(getHeadersForSheet('19_每日統計'));
  var date = new Date().toISOString().slice(0, 10);
  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === date) rowIndex = i + 1;
  }
  if (rowIndex === -1) {
    sheet.appendRow([date, 0, 0, 0, 0, 0]);
    rowIndex = sheet.getLastRow();
  }
  var columnMap = { APP_OPEN: 2, GENERATE: 3, REGENERATE: 3, COPY: 4, SHARE: 5, PARTNER_CLICK: 6 };
  var col = columnMap[clean.action];
  if (col) sheet.getRange(rowIndex, col).setValue(Number(sheet.getRange(rowIndex, col).getValue() || 0) + 1);
}

function updateContentRanking(clean) {
  if (['COPY', 'SHARE'].indexOf(clean.action) === -1 || !clean.output) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('20_內容排行榜') || ss.insertSheet('20_內容排行榜');
  if (sheet.getLastRow() === 0) sheet.appendRow(getHeadersForSheet('20_內容排行榜'));
  var hash = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, clean.output)
  ).slice(0, 24);
  var values = sheet.getDataRange().getValues();
  var row = -1;
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === hash) row = i + 1;
  }
  if (row === -1) {
    sheet.appendRow([hash, clean.mode, clean.output, 0, 0, new Date().toISOString()]);
    row = sheet.getLastRow();
  }
  var countColumn = clean.action === 'COPY' ? 4 : 5;
  sheet.getRange(row, countColumn).setValue(Number(sheet.getRange(row, countColumn).getValue() || 0) + 1);
  sheet.getRange(row, 6).setValue(new Date().toISOString());
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
