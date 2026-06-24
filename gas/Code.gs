// ==============================================
// 笑鼠人了！Code.gs  v3
// doPost 已整合 quota.gs 路由（handleQuotaAction）
// ==============================================

var SPREADSHEET_ID = '1e6A5DXw_rGkSNi-Kk7LrsVje0KJkLrwO07aeLVuH_cI';

var SHEET_NAMES = [
  '01_生成紀錄','02_模式設定','03_小天鼠詞庫','04_唬爛虎詞庫',
  '05_迷航翻譯庫','06_亮點庫','07_自導自演劇本庫','08_歌曲模板庫',
  '09_繪圖提示庫','10_影片分鏡庫','11_分享文案庫','12_禁用詞',
  '13_近期使用紀錄','14_合作夥伴設定','15_合作導流紀錄','16_流量事件',
  '17_每日統計'
];

var RECORD_HEADERS = [
  'timestamp','action','mode','route','input','output',
  'userId','sessionId','url','userAgent','partner','email',
  'partnerId','referralCode','targetUrl',
  'targetCategory','situationCategory','matchType'
];

// ----------------------------------------------
// doGet
// ----------------------------------------------
function doGet() {
  return jsonOutput({
    ok: true,
    app: '笑鼠人了！',
    message: 'GAS endpoint ready. 不算命，不解卦，只負責把紀錄好好接住。'
  });
}

// ----------------------------------------------
// doPost（主路由）
// ----------------------------------------------
function doPost(e) {
  try {
    var raw  = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    var action = data.action || '';

    // 額度系統路由（轉交 quota.gs 的 handleQuotaAction）
    if (action === 'getQuota' || action === 'consumeQuota' || action === 'redeemCode' ||
        action.indexOf('admin') === 0) {
      return jsonOutput(handleQuotaAction(action, data));
    }

    // 流量事件紀錄
    if (action === 'logEvent') {
      return jsonOutput(saveLogEvent(data));
    }

    // 生成紀錄（action === 'saveRecord' 或舊格式）
    var generated = data.output ? data : simpleGenerate(data);
    var saved = saveRecord(generated);
    return jsonOutput({ ok: true, saved: saved, data: generated });

  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

// ----------------------------------------------
// saveLogEvent -- 寫入 16_流量事件
// ----------------------------------------------
function saveLogEvent(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('16_流量事件');
  if (!sheet) return { ok: false, message: '找不到 16_流量事件' };
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['時間','userId','eventType','mode','subMode','source','device','sessionId','targetCategory','situationCategory','matchType']);
    sheet.getRange(1,1,1,11).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    data.time              || new Date().toISOString(),
    data.userId            || '',
    data.eventType         || data.action || '',
    data.mode              || '',
    data.subMode           || '',
    data.source            || '',
    data.device            || data.userAgent || '',
    data.sessionId         || '',
    data.targetCategory    || '',
    data.situationCategory || '',
    data.matchType         || ''
  ]);
  return { ok: true };
}

// ----------------------------------------------
// setupSheets
// ----------------------------------------------
function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  SHEET_NAMES.forEach(function(name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(getHeadersForSheet(name));
    seedSheet(sheet, name);
  });
  return jsonOutput({ ok: true, sheets: SHEET_NAMES });
}

function getHeadersForSheet(name) {
  if (name === '14_合作夥伴設定') return ['partnerId','name','url','apiEndpoint','referralCode','revenueShare','whiteLabelUrl','enabled'];
  if (name === '15_合作導流紀錄') return ['timestamp','partnerId','userId','sessionId','referralCode','targetUrl','action'];
  if (name === '16_流量事件')     return ['時間','userId','eventType','mode','subMode','source','device','sessionId','targetCategory','situationCategory','matchType'];
  if (name === '17_每日統計')     return ['日期','快速生成','工坊生成','複製','分享','合作點擊'];
  return RECORD_HEADERS;
}

function seedSheet(sheet, name) {
  if (sheet.getLastRow() > 1) return;
  var seeds = {
    '02_模式設定':        ['roast','嗆聲模式','把火氣變笑氣','enabled'],
    '03_小天鼠詞庫':      ['毒雞湯','別怕丟臉，臉只是社交皮膚。','1'],
    '04_唬爛虎詞庫':      ['願景','先吹牛，後拆步驟。','1'],
    '05_迷航翻譯庫':      ['拖延','任務太大或怕失敗，大腦直接裝死省電。','1'],
    '06_亮點庫':          ['亮點','你願意說出來，代表內耗已經變素材。','1'],
    '07_自導自演劇本庫':  ['三幕劇','遇到卡關、翻成願望、做一個小行動。','1'],
    '08_歌曲模板庫':      ['明亮華語流行','笑掉煩惱，吹大夢想。','1'],
    '09_繪圖提示庫':      ['人生創作片場','暖黃色、珊瑚紅、幽默表情、電影感。','1'],
    '10_影片分鏡庫':      ['MV','煩惱訊息、情緒轉化、片場發光。','1'],
    '11_分享文案庫':      ['社群','我沒有輸，我只是素材比較多。','1'],
    '12_禁用詞':          ['醫療承諾','診斷、治療、保證成功、算命斷言','enabled'],
    '14_合作夥伴設定':    ['wisdom-gate-demo','智慧之門合作方','','','LAUGH-MOUSE-DEMO','','','false']
  };
  if (seeds[name]) sheet.appendRow(seeds[name]);
}

// ----------------------------------------------
// saveRecord -- 寫入 01_生成紀錄
// ----------------------------------------------
function saveRecord(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('01_生成紀錄') || ss.insertSheet('01_生成紀錄');
    if (sheet.getLastRow() === 0) sheet.appendRow(RECORD_HEADERS);
    var clean = normalizeRecord(data);
    sheet.appendRow(RECORD_HEADERS.map(function(key) { return clean[key] || ''; }));
    saveRecentRecord(clean, ss);
    if (clean.action === 'PARTNER_CLICK') trackPartnerClick(clean, ss);
    updateDailyStats(clean, ss);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function normalizeRecord(data) {
  data = data || {};
  return {
    timestamp:    data.timestamp    || new Date().toISOString(),
    action:       sanitizeText(data.action       || 'GENERATE'),
    mode:         sanitizeText(data.mode         || ''),
    route:        sanitizeText(data.route        || ''),
    input:        sanitizeText(data.input        || ''),
    output:       sanitizeText(data.output       || ''),
    userId:       sanitizeText(data.userId       || ''),
    sessionId:    sanitizeText(data.sessionId    || ''),
    url:          sanitizeText(data.url          || ''),
    userAgent:    sanitizeText(data.userAgent    || ''),
    partner:      data.partner ? JSON.stringify(data.partner) : '',
    email:        sanitizeText(data.email        || ''),
    partnerId:         sanitizeText(data.partnerId    || (data.partner && data.partner.partnerId) || ''),
    referralCode:      sanitizeText(data.referralCode || (data.partner && data.partner.referralCode) || ''),
    targetUrl:         sanitizeText(data.targetUrl    || (data.partner && data.partner.url) || ''),
    targetCategory:    sanitizeText(data.targetCategory    || ''),
    situationCategory: sanitizeText(data.situationCategory || ''),
    matchType:         sanitizeText(data.matchType         || '')
  };
}

function sanitizeText(text) {
  var clean = String(text || '')
    .replace(/[<>]/g, '')
    .replace(/\b(診斷|治療|保證成功|算命斷言)\b/g, '保留一點神秘但不亂承諾')
    .slice(0, 4000);
  return /^[=+\-@]/.test(clean) ? "'" + clean : clean;
}

// ----------------------------------------------
// simpleGenerate（doPost fallback）
// ----------------------------------------------
function simpleGenerate(data) {
  data = data || {};
  var mode = data.mode || '嗆聲模式';
  if (mode === '自嘲模式')   return generateSelfMockMode(data);
  if (mode === '畫大餅模式') return generateBigDreamMode(data);
  if (mode === '迷航模式')   return generateLostMode(data);
  if (mode === '我的亮點')   return generateStrengthMode(data);
  if (mode === '自導自演')   return generateDirectorMode(data);
  if (mode === '創作工坊')   return generateCreativeWorkshop(data);
  if (mode === '分享模式')   return generateShareCopy(data);
  return generateRoastMode(data);
}

function generateRoastMode(data) {
  var i = sanitizeText(data.input || '今天有點煩');
  data.output = '小天鼠：' + i + ' 先不要囂張，煩惱只是臨演，不是人生導演。';
  return data;
}
function generateSelfMockMode(data) {
  var i = sanitizeText(data.input || '我又卡住了');
  data.output = '自嘲版：我以為 ' + i + ' 是低谷，結果我在谷底開了分店，但至少很有商業頭腦。';
  return data;
}
function generateBigDreamMode(data) {
  var i = sanitizeText(data.input || '我想變好');
  data.output = '唬爛虎：' + i + ' 不是妄想，是願景還沒拆成待辦事項。先吹牛，後拆步驟。';
  return data;
}
function generateLostMode(data) {
  var i = sanitizeText(data.input || '我很焦慮');
  data.output = '迷航翻譯：' + i + ' 可能是大腦怕你受傷，保全太認真。先切成 5 分鐘小任務。';
  return data;
}
function generateStrengthMode(data) {
  var i = sanitizeText(data.input || '我很亂');
  data.output = '亮點整理：' + i + ' 代表你還有感覺、還想改變、還願意把內耗變素材。';
  return data;
}
function generateDirectorMode(data) {
  var i = sanitizeText(data.input || '今天卡關');
  data.output = '三幕劇：第一幕 ' + i + '。第二幕翻成願望。第三幕做一個小行動，片尾字幕：我還沒下片。';
  return data;
}
function generateCreativeWorkshop(data) {
  var i = sanitizeText(data.input || '把今天變作品');
  data.output = generateSong({input:i}).output + '\n' + generateImagePrompt({input:i}).output + '\n' + generateStoryboard({input:i}).output;
  return data;
}
function generateShareCopy(data) {
  var i = sanitizeText(data.input || '今天也努力了');
  data.output = '今天把「' + i + '」交給小天鼠。結論：我沒有輸，我只是素材比較多。#笑鼠人了';
  return data;
}
function generateSong(data) {
  var i = sanitizeText(data.input || '今天有點亂');
  data.output = '歌名：《把今天笑回來》\n主歌：' + i + '\n副歌：笑掉煩惱，吹大夢想，我把狼狽唱成發光。';
  return data;
}
function generateImagePrompt(data) {
  var i = sanitizeText(data.input || '人生片場');
  data.output = '歡樂人生創作片場，主角把「' + i + '」變成彩色道具，暖黃色、珊瑚紅、電影感、幽默但不幼稚。';
  return data;
}
function generateStoryboard(data) {
  var i = sanitizeText(data.input || '煩惱變作品');
  data.output = '1. 手機出現「' + i + '」。2. 小天鼠把火氣變笑氣。3. 唬爛虎拿出願景看板。4. 主角走向片場燈光。';
  return data;
}

// ----------------------------------------------
// 輔助寫入函式
// ----------------------------------------------
function saveRecentRecord(clean, ss) {
  var sheet = ss.getSheetByName('13_近期使用紀錄') || ss.insertSheet('13_近期使用紀錄');
  // Gate3A schema: 8 欄，與 16_流量事件 相同
  var headers = ['時間','userId','eventType','mode','subMode','source','device','sessionId'];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1,1,1,headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.insertRowAfter(1);
  sheet.getRange(2,1,1,headers.length).setValues([[
    clean.timestamp || new Date().toISOString(),
    clean.userId    || '',
    clean.action    || '',
    clean.mode      || '',
    '',
    '',
    clean.userAgent || '',
    clean.sessionId || ''
  ]]);
  if (sheet.getLastRow() > 101) sheet.deleteRows(102, sheet.getLastRow() - 101);
}

function trackPartnerClick(data, ss) {
  var sheet = ss.getSheetByName('15_合作導流紀錄') || ss.insertSheet('15_合作導流紀錄');
  if (sheet.getLastRow() === 0) sheet.appendRow(getHeadersForSheet('15_合作導流紀錄'));
  sheet.appendRow([new Date().toISOString(), data.partnerId||'', data.userId||'',
    data.sessionId||'', data.referralCode||'', data.targetUrl||'', data.action||'PARTNER_CLICK']);
}

function updateDailyStats(clean, ss) {
  var sheet = ss.getSheetByName('17_每日統計') || ss.insertSheet('17_每日統計');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(getHeadersForSheet('17_每日統計'));
    sheet.getRange(1,1,1,6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  var today  = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  var values = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < values.length; i++) {
    var d = values[i][0];
    var ds = (d instanceof Date) ? Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd') : String(d);
    if (ds === today) { rowIdx = i + 1; break; }
  }
  if (rowIdx === -1) { sheet.appendRow([today,0,0,0,0,0]); rowIdx = sheet.getLastRow(); }
  // 快速生成:2, 工坊生成:3, 複製:4, 分享:5, 合作點擊:6
  var colMap = { GENERATE:2, REGENERATE:2, GENERATE_SONG:3, ENTER_WORKSHOP:3, COPY:4, SHARE:5, PARTNER_CLICK:6 };
  var col = colMap[clean.action];
  if (col) sheet.getRange(rowIdx,col).setValue(Number(sheet.getRange(rowIdx,col).getValue()||0)+1);
}

// ----------------------------------------------
// migrateRoastColumns
// 一次性遷移：為 01_生成紀錄 和 16_流量事件 補上三個追蹤欄位
// 只補缺少的，不覆蓋、不搬動既有資料，遷移前後資料筆數不變
// ----------------------------------------------
function migrateRoastColumns() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var results = [];

  // 01_生成紀錄：期望表頭是 RECORD_HEADERS（18 欄）
  var sheet01 = ss.getSheetByName('01_生成紀錄');
  if (sheet01) {
    var before01 = sheet01.getLastRow();
    var h01 = sheet01.getRange(1, 1, 1, sheet01.getLastColumn()).getValues()[0];
    var toAdd01 = ['targetCategory','situationCategory','matchType'].filter(function(c){ return h01.indexOf(c) === -1; });
    toAdd01.forEach(function(col) {
      var newCol = sheet01.getLastColumn() + 1;
      sheet01.getRange(1, newCol).setValue(col).setFontWeight('bold');
    });
    sheet01.setFrozenRows(1);
    results.push({sheet:'01_生成紀錄', added:toAdd01, rowsBefore:before01, rowsAfter:sheet01.getLastRow()});
  }

  // 16_流量事件：期望表頭 11 欄
  var sheet16 = ss.getSheetByName('16_流量事件');
  if (sheet16) {
    var before16 = sheet16.getLastRow();
    var h16 = sheet16.getRange(1, 1, 1, sheet16.getLastColumn()).getValues()[0];
    var toAdd16 = ['targetCategory','situationCategory','matchType'].filter(function(c){ return h16.indexOf(c) === -1; });
    toAdd16.forEach(function(col) {
      var newCol = sheet16.getLastColumn() + 1;
      sheet16.getRange(1, newCol).setValue(col).setFontWeight('bold');
    });
    sheet16.setFrozenRows(1);
    results.push({sheet:'16_流量事件', added:toAdd16, rowsBefore:before16, rowsAfter:sheet16.getLastRow()});
  }

  return results;
}

// ----------------------------------------------
// addRoastColumnNotes
// 為 01_生成紀錄 和 16_流量事件 的三個英文欄位加中文儲存格備註
// 只寫備註，不改欄位名稱，不影響資料
// ----------------------------------------------
function addRoastColumnNotes() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var NOTES = {
    targetCategory:    '嗆聲對象分類（child / boss / client / coworker / parents / sibling / partner / friend / other）',
    situationCategory: '嗆聲情境分類（如 lateSleep / homework / talkBack / general…）；未命中情境時為 general',
    matchType:         '命中類型：specific = 情境關鍵字命中；general = 使用同對象通用詞庫'
  };
  var results = [];
  ['01_生成紀錄', '16_流量事件'].forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) { results.push({sheet: name, ok: false, reason: '找不到工作表'}); return; }
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var added = [];
    headers.forEach(function(h, i) {
      if (NOTES[h]) {
        sheet.getRange(1, i + 1).setNote(NOTES[h]);
        added.push(h);
      }
    });
    results.push({sheet: name, notesAdded: added});
  });
  Logger.log(JSON.stringify(results));
  return results;
}

// ----------------------------------------------
// jsonOutput
// ----------------------------------------------
function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
