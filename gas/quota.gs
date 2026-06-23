/**
 * 笑鼠人了！額度系統 GAS 核心
 *
 * 包含：
 *   setupQuotaSheets()  — 建立 21/22/23 三張新分頁（可重複執行，已存在則跳過）
 *   getQuota(userId)    — 查詢使用者當日剩餘額度
 *   consumeQuota(userId, quotaType) — 扣除一次額度（含 LockService）
 *   redeemCode(code, userId) — 兌換方案碼
 *   getAdminMenu()      — onOpen 選單（供綁定試算表使用）
 *   generateGiftCode()  — 產生客戶贈送碼
 *   generateStudentCode() — 產生學員方案碼
 */

var QS_ID = '1e6A5DXw_rGkSNi-Kk7LrsVje0KJkLrwO07aeLVuH_cI';

/* ── 方案預設值 ── */
var PLANS = {
  free:    { quick: 20, journey: 2, workshop: 3 },
  student: { quick: 50, journey: 10, workshop: 10 },
  basic:   { quick: 50, journey: 10, workshop: 10 },
  pro:     { quick: 999, journey: 99, workshop: 99 }
};

/* ── 欄位定義 ── */
var MEMBER_HEADERS = [
  'userId','planType','planEndAt','bonusBalance',
  'lastSeenAt','createdAt',
  'lastUsageDate','dailyQuickUsed','dailyJourneyUsed','dailyWorkshopUsed'
];
var CODE_HEADERS = [
  'code','type','value','planType','planDays',
  'dailyQuickLimit','dailyJourneyLimit','dailyWorkshopLimit',
  'expiresAt','maxRedemptions','redeemedCount','enabled','note','createdAt'
];
var LEDGER_HEADERS = [
  '時間','userId','action','quotaType','amount',
  'balanceBefore','balanceAfter','code','reason'
];

/* ════════════════════════════════════════
   建表（可重複執行）
   ════════════════════════════════════════ */
function setupQuotaSheets() {
  var ss = SpreadsheetApp.openById(QS_ID);
  var created = [];

  function ensureSheet(name, headers) {
    var s = ss.getSheetByName(name);
    if (!s) {
      s = ss.insertSheet(name);
      s.appendRow(headers);
      s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      s.setFrozenRows(1);
      created.push(name + ' 新建');
    } else {
      created.push(name + ' 已存在，跳過');
    }
  }

  ensureSheet('21_會員資料',   MEMBER_HEADERS);
  ensureSheet('22_贈送額度碼', CODE_HEADERS);
  ensureSheet('23_額度異動紀錄', LEDGER_HEADERS);

  var msg = '=== setupQuotaSheets ===\n' + created.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch(e) {}
}

/* ════════════════════════════════════════
   工具：取得台灣今日日期字串 YYYY-MM-DD
   ════════════════════════════════════════ */
function getTwDate_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

/* ════════════════════════════════════════
   查詢或初始化會員列
   ════════════════════════════════════════ */
function getMemberRow_(ss, userId) {
  var sheet = ss.getSheetByName('21_會員資料');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var col  = data[0].indexOf('userId');
  for (var i = 1; i < data.length; i++) {
    if (data[i][col] === userId) {
      return { sheet: sheet, rowIndex: i + 1, data: data[i], headers: data[0] };
    }
  }
  return null;
}

function getOrCreateMember_(ss, userId) {
  var found = getMemberRow_(ss, userId);
  if (found) return found;

  var sheet = ss.getSheetByName('21_會員資料');
  var now   = new Date().toISOString();
  var row   = MEMBER_HEADERS.map(function(h) {
    if (h === 'userId')    return userId;
    if (h === 'planType')  return 'free';
    if (h === 'bonusBalance') return 0;
    if (h === 'createdAt') return now;
    if (h === 'lastSeenAt') return now;
    if (h === 'lastUsageDate') return '';
    if (h === 'dailyQuickUsed')   return 0;
    if (h === 'dailyJourneyUsed') return 0;
    if (h === 'dailyWorkshopUsed') return 0;
    return '';
  });
  sheet.appendRow(row);

  var data = sheet.getDataRange().getValues();
  var lastRow = data.length;
  return { sheet: sheet, rowIndex: lastRow, data: row, headers: MEMBER_HEADERS };
}

/* ════════════════════════════════════════
   getQuota(userId)
   回傳 { quick, journey, workshop, bonus, planType }
   ════════════════════════════════════════ */
function getQuota(userId) {
  var ss      = SpreadsheetApp.openById(QS_ID);
  var member  = getOrCreateMember_(ss, userId);
  var today   = getTwDate_();
  var headers = member.headers;
  var row     = member.data;

  function col(name) { return row[headers.indexOf(name)]; }

  var planType = col('planType') || 'free';
  var planEndAt = col('planEndAt');
  if (planEndAt && new Date(planEndAt) < new Date()) planType = 'free';

  var limits   = PLANS[planType] || PLANS.free;
  var lastDate = col('lastUsageDate');

  var quickUsed    = lastDate === today ? (col('dailyQuickUsed')    || 0) : 0;
  var journeyUsed  = lastDate === today ? (col('dailyJourneyUsed')  || 0) : 0;
  var workshopUsed = lastDate === today ? (col('dailyWorkshopUsed') || 0) : 0;
  var bonus        = col('bonusBalance') || 0;

  return {
    planType: planType,
    quick:    Math.max(0, limits.quick    - quickUsed),
    journey:  Math.max(0, limits.journey  - journeyUsed),
    workshop: Math.max(0, limits.workshop - workshopUsed),
    bonus:    bonus
  };
}

/* ════════════════════════════════════════
   consumeQuota(userId, quotaType)
   quotaType: 'quick' | 'journey' | 'workshop' | 'bonus'
   回傳 { ok, remaining, reason }
   ════════════════════════════════════════ */
function consumeQuota(userId, quotaType) {
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    var ss     = SpreadsheetApp.openById(QS_ID);
    var member = getOrCreateMember_(ss, userId);
    var today  = getTwDate_();
    var headers = member.headers;
    var row     = member.data;
    var sheet   = member.sheet;
    var rowIdx  = member.rowIndex;

    function getVal(name) { return row[headers.indexOf(name)]; }
    function setVal(name, val) {
      var c = headers.indexOf(name);
      sheet.getRange(rowIdx, c + 1).setValue(val);
    }

    var planType  = getVal('planType') || 'free';
    var planEndAt = getVal('planEndAt');
    if (planEndAt && new Date(planEndAt) < new Date()) planType = 'free';

    var limits    = PLANS[planType] || PLANS.free;
    var lastDate  = getVal('lastUsageDate');
    var isNewDay  = lastDate !== today;

    /* 歸零當日用量（新的一天） */
    if (isNewDay) {
      setVal('lastUsageDate',    today);
      setVal('dailyQuickUsed',   0);
      setVal('dailyJourneyUsed', 0);
      setVal('dailyWorkshopUsed', 0);
      row[headers.indexOf('lastUsageDate')]    = today;
      row[headers.indexOf('dailyQuickUsed')]   = 0;
      row[headers.indexOf('dailyJourneyUsed')] = 0;
      row[headers.indexOf('dailyWorkshopUsed')] = 0;
    }

    /* 判斷扣哪個桶 */
    if (quotaType === 'bonus') {
      var bonus = getVal('bonusBalance') || 0;
      if (bonus <= 0) return { ok: false, remaining: 0, reason: 'bonus_empty' };
      setVal('bonusBalance', bonus - 1);
      writeLedger_(ss, userId, 'BONUS_USED', 'bonus', 1, bonus, bonus - 1, '', '');
      setVal('lastSeenAt', new Date().toISOString());
      return { ok: true, remaining: bonus - 1 };
    }

    var usedKey = 'daily' + quotaType.charAt(0).toUpperCase() + quotaType.slice(1) + 'Used';
    var used    = getVal(usedKey) || 0;
    var limit   = limits[quotaType] || 0;

    if (used >= limit) {
      /* 額度用完，嘗試扣 bonus */
      var bonusNow = getVal('bonusBalance') || 0;
      if (quotaType === 'workshop' && bonusNow > 0) {
        setVal('bonusBalance', bonusNow - 1);
        writeLedger_(ss, userId, 'BONUS_USED', 'workshop', 1, bonusNow, bonusNow - 1, '', 'daily_exhausted');
        setVal('lastSeenAt', new Date().toISOString());
        return { ok: true, remaining: bonusNow - 1, source: 'bonus' };
      }
      return { ok: false, remaining: 0, reason: 'quota_exhausted' };
    }

    var newUsed = used + 1;
    setVal(usedKey, newUsed);
    setVal('lastSeenAt', new Date().toISOString());
    writeLedger_(ss, userId, 'DAILY_' + quotaType.toUpperCase(), quotaType, 1, limit - used, limit - newUsed, '', '');
    return { ok: true, remaining: limit - newUsed };

  } finally {
    lock.releaseLock();
  }
}

/* ════════════════════════════════════════
   redeemCode(code, userId)
   回傳 { ok, type, message }
   ════════════════════════════════════════ */
function redeemCode(code, userId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    var ss       = SpreadsheetApp.openById(QS_ID);
    var codeSheet = ss.getSheetByName('22_贈送額度碼');
    if (!codeSheet) return { ok: false, message: '系統尚未設定額度碼功能' };

    var data    = codeSheet.getDataRange().getValues();
    var headers = data[0];
    function cIdx(name) { return headers.indexOf(name); }

    var codeRow = null, codeRowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][cIdx('code')] === code) { codeRow = data[i]; codeRowIdx = i + 1; break; }
    }
    if (!codeRow) return { ok: false, message: '找不到此方案碼' };
    if (!codeRow[cIdx('enabled')]) return { ok: false, message: '此方案碼已停用' };

    var expiresAt = codeRow[cIdx('expiresAt')];
    if (expiresAt && new Date(expiresAt) < new Date()) return { ok: false, message: '方案碼已過期' };

    var maxR    = codeRow[cIdx('maxRedemptions')] || 1;
    var usedR   = codeRow[cIdx('redeemedCount')]  || 0;
    if (usedR >= maxR) return { ok: false, message: '此方案碼已達兌換上限' };

    /* 同一 userId 不可重複兌換 */
    var ledgerSheet = ss.getSheetByName('23_額度異動紀錄');
    if (ledgerSheet) {
      var ledger = ledgerSheet.getDataRange().getValues();
      var lh = ledger[0];
      for (var j = 1; j < ledger.length; j++) {
        if (ledger[j][lh.indexOf('userId')] === userId &&
            ledger[j][lh.indexOf('code')]   === code &&
            (ledger[j][lh.indexOf('action')] === 'REDEEM_GIFT' ||
             ledger[j][lh.indexOf('action')] === 'ACTIVATE_STUDENT')) {
          return { ok: false, message: '你已經兌換過此方案碼' };
        }
      }
    }

    /* 執行兌換 */
    var member = getOrCreateMember_(ss, userId);
    var mSheet = member.sheet, mRow = member.rowIndex, mData = member.data, mH = member.headers;

    var type = codeRow[cIdx('type')];
    if (type === 'gift') {
      var value      = codeRow[cIdx('value')] || 0;
      var bonusBefore = mData[mH.indexOf('bonusBalance')] || 0;
      var bonusAfter  = bonusBefore + value;
      mSheet.getRange(mRow, mH.indexOf('bonusBalance') + 1).setValue(bonusAfter);
      codeSheet.getRange(codeRowIdx, cIdx('redeemedCount') + 1).setValue(usedR + 1);
      writeLedger_(ss, userId, 'REDEEM_GIFT', 'bonus', -value, bonusBefore, bonusAfter, code, '兌換贈送碼');
      return { ok: true, type: 'gift', value: value, bonusBalance: bonusAfter, message: '成功兌換！獲得 ' + value + ' 次工坊額度' };
    }

    if (type === 'student') {
      var planDays    = codeRow[cIdx('planDays')] || 30;
      var planEndAt   = new Date();
      planEndAt.setDate(planEndAt.getDate() + planDays);
      mSheet.getRange(mRow, mH.indexOf('planType')  + 1).setValue('student');
      mSheet.getRange(mRow, mH.indexOf('planEndAt') + 1).setValue(planEndAt.toISOString());
      codeSheet.getRange(codeRowIdx, cIdx('redeemedCount') + 1).setValue(usedR + 1);
      writeLedger_(ss, userId, 'ACTIVATE_STUDENT', 'plan', 0, 0, 0, code, '學員方案 ' + planDays + ' 天');
      return { ok: true, type: 'student', planEndAt: planEndAt.toISOString(), message: '學員方案啟用成功！有效期 ' + planDays + ' 天' };
    }

    return { ok: false, message: '未知的方案碼類型' };
  } finally {
    lock.releaseLock();
  }
}

/* ════════════════════════════════════════
   writeLedger_ — 寫異動紀錄
   ════════════════════════════════════════ */
function writeLedger_(ss, userId, action, quotaType, amount, before, after, code, reason) {
  var sheet = ss.getSheetByName('23_額度異動紀錄');
  if (!sheet) return;
  sheet.appendRow([
    new Date().toISOString(), userId, action, quotaType,
    amount, before, after, code || '', reason || ''
  ]);
}

/* ════════════════════════════════════════
   管理選單（綁定至試算表 onOpen）
   ════════════════════════════════════════ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('笑鼠人了！後台')
    .addItem('建立額度分頁', 'setupQuotaSheets')
    .addSeparator()
    .addItem('產生客戶贈送碼', 'uiGenerateGiftCode')
    .addItem('產生學員方案碼', 'uiGenerateStudentCode')
    .addSeparator()
    .addItem('查看有效方案碼', 'uiListActiveCodes')
    .addItem('停用方案碼',     'uiDisableCode')
    .addToUi();
}

/* ════════════════════════════════════════
   管理介面：產生客戶贈送碼
   ════════════════════════════════════════ */
function uiGenerateGiftCode() {
  var ui   = SpreadsheetApp.getUi();
  var note = ui.prompt('客戶備註（例如：王小明 活動獎勵）').getResponseText().trim();
  var val  = parseInt(ui.prompt('贈送工坊次數（整數）').getResponseText(), 10);
  var days = parseInt(ui.prompt('方案碼有效天數（例如：90）').getResponseText(), 10);
  if (!note || isNaN(val) || val <= 0 || isNaN(days) || days <= 0) {
    ui.alert('輸入無效，取消產生');
    return;
  }
  var result = generateGiftCode({ note: note, value: val, expiryDays: days, maxRedemptions: 1 });
  ui.alert('贈送碼已建立\n\n方案碼：' + result.code +
    '\n贈送工坊：' + val + ' 次' +
    '\n有效期限：' + result.expiresAt.slice(0,10) +
    '\n\n分享文字（複製給客戶）：\n' +
    '🎁 你的專屬兌換碼：' + result.code +
    '\n兌換後可獲得 ' + val + ' 次創作工坊額度\n有效期至 ' + result.expiresAt.slice(0,10));
}

function generateGiftCode(opts) {
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet) { setupQuotaSheets(); sheet = ss.getSheetByName('22_贈送額度碼'); }

  var code    = 'HAPPY-' + randomSegment_(4) + '-' + randomSegment_(4);
  var now     = new Date();
  var expires = new Date(now);
  expires.setDate(expires.getDate() + (opts.expiryDays || 90));

  sheet.appendRow([
    code, 'gift', opts.value || 1, '', '',
    '', '', '',
    expires.toISOString(), opts.maxRedemptions || 1, 0, true,
    opts.note || '', now.toISOString()
  ]);
  return { code: code, expiresAt: expires.toISOString() };
}

/* ════════════════════════════════════════
   管理介面：產生學員方案碼
   ════════════════════════════════════════ */
function uiGenerateStudentCode() {
  var ui      = SpreadsheetApp.getUi();
  var name    = ui.prompt('課程／班級名稱').getResponseText().trim();
  var days    = parseInt(ui.prompt('有效天數（例如：30）').getResponseText(), 10);
  var maxPpl  = parseInt(ui.prompt('最多啟用人數').getResponseText(), 10);
  if (!name || isNaN(days) || days <= 0 || isNaN(maxPpl) || maxPpl <= 0) {
    ui.alert('輸入無效，取消產生');
    return;
  }
  var result = generateStudentCode({ note: name, planDays: days, maxRedemptions: maxPpl });
  ui.alert('學員方案碼已建立\n\n方案碼：' + result.code +
    '\n有效天數：' + days + ' 天' +
    '\n最多人數：' + maxPpl + ' 人' +
    '\n方案碼到期：' + result.expiresAt.slice(0,10) +
    '\n\n分享文字：\n🎓 學員專屬碼：' + result.code +
    '\n兌換後可使用 ' + days + ' 天學員方案\n有效期至 ' + result.expiresAt.slice(0,10));
}

function generateStudentCode(opts) {
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet) { setupQuotaSheets(); sheet = ss.getSheetByName('22_贈送額度碼'); }

  var code    = 'LEARN-' + randomSegment_(4) + '-' + randomSegment_(4);
  var now     = new Date();
  var expires = new Date(now);
  expires.setDate(expires.getDate() + (opts.planDays || 30) + 7); // 多7天緩衝

  sheet.appendRow([
    code, 'student', 0, 'student', opts.planDays || 30,
    PLANS.student.quick, PLANS.student.journey, PLANS.student.workshop,
    expires.toISOString(), opts.maxRedemptions || 1, 0, true,
    opts.note || '', now.toISOString()
  ]);
  return { code: code, expiresAt: expires.toISOString() };
}

/* ════════════════════════════════════════
   管理介面：查看有效方案碼
   ════════════════════════════════════════ */
function uiListActiveCodes() {
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('目前沒有任何方案碼');
    return;
  }
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  function cIdx(n) { return headers.indexOf(n); }
  var now   = new Date();
  var lines = ['有效方案碼列表：\n'];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[cIdx('enabled')]) continue;
    var exp = row[cIdx('expiresAt')];
    if (exp && new Date(exp) < now) continue;
    lines.push((row[cIdx('type')] === 'gift' ? '🎁' : '🎓') +
      ' ' + row[cIdx('code')] +
      ' | 已用 ' + (row[cIdx('redeemedCount')] || 0) + '/' + (row[cIdx('maxRedemptions')] || 1) +
      ' | ' + (exp ? exp.slice(0,10) : '無期限') +
      ' | ' + (row[cIdx('note')] || ''));
  }
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

/* ════════════════════════════════════════
   管理介面：停用方案碼
   ════════════════════════════════════════ */
function uiDisableCode() {
  var ui   = SpreadsheetApp.getUi();
  var code = ui.prompt('輸入要停用的方案碼').getResponseText().trim();
  if (!code) return;

  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet) { ui.alert('找不到方案碼分頁'); return; }

  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var codeCol = headers.indexOf('code');
  var enabCol = headers.indexOf('enabled');
  for (var i = 1; i < data.length; i++) {
    if (data[i][codeCol] === code) {
      sheet.getRange(i + 1, enabCol + 1).setValue(false);
      ui.alert('方案碼 ' + code + ' 已停用');
      return;
    }
  }
  ui.alert('找不到方案碼：' + code);
}

/* ════════════════════════════════════════
   工具：產生隨機碼段（大寫英數）
   ════════════════════════════════════════ */
function randomSegment_(len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字元
  var result = '';
  for (var i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/* ════════════════════════════════════════
   doPost 路由（新增至現有 GAS doPost）
   ════════════════════════════════════════ */
function handleQuotaAction(action, data) {
  if (action === 'getQuota')    return getQuota(data.userId);
  if (action === 'consumeQuota') return consumeQuota(data.userId, data.quotaType);
  if (action === 'redeemCode')  return redeemCode(data.code, data.userId);
  return { ok: false, message: 'Unknown quota action' };
}
