// ==============================================
// Angel-happy-rat quota.gs  v2
// 笑鼠人了！額度系統 GAS 核心
// ==============================================

var QS_ID = '1e6A5DXw_rGkSNi-Kk7LrsVje0KJkLrwO07aeLVuH_cI';

var PLANS = {
  free:    { quick: 20, journey: 2,  workshop: 3  },
  student: { quick: 50, journey: 10, workshop: 10 },
  basic:   { quick: 50, journey: 10, workshop: 10 },
  pro:     { quick: 999, journey: 99, workshop: 99 }
};

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
// 統一用 'time'，不用中文欄名
var LEDGER_HEADERS = [
  'time','userId','action','quotaType','amount',
  'balanceBefore','balanceAfter','code','reason'
];

// ----------------------------------------------
// toTwDateStr_ -- 統一轉換日期值為 yyyy-MM-dd 字串
// Sheets 可能回傳 Date 物件或字串，都轉為台灣時區日期字串
// ----------------------------------------------
function toTwDateStr_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  var s = String(val).trim();
  // 若是 ISO 字串，取日期部分並轉台灣時區
  if (s.length >= 10) {
    try {
      return Utilities.formatDate(new Date(s), 'Asia/Taipei', 'yyyy-MM-dd');
    } catch (e) {}
  }
  return s;
}

// ----------------------------------------------
// getTwDate_ -- 台灣今日日期 yyyy-MM-dd
// ----------------------------------------------
function getTwDate_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

// ----------------------------------------------
// ensureSheet_
// ----------------------------------------------
function ensureSheet_(ss, name, headers) {
  var s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.appendRow(headers);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    s.setFrozenRows(1);
    return name + ' 新建';
  }
  return name + ' 已存在，跳過';
}

// ----------------------------------------------
// setupQuotaSheets -- 建立 21/22/23 三張分頁（執行一次）
// ----------------------------------------------
function setupQuotaSheets() {
  var ss  = SpreadsheetApp.openById(QS_ID);
  var log = [];
  log.push(ensureSheet_(ss, '21_會員資料',    MEMBER_HEADERS));
  log.push(ensureSheet_(ss, '22_贈送額度碼',  CODE_HEADERS));
  log.push(ensureSheet_(ss, '23_額度異動紀錄', LEDGER_HEADERS));
  var msg = '=== setupQuotaSheets ===\n' + log.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

// ----------------------------------------------
// getMemberRow_ -- 查找會員列（不自動建立）
// ----------------------------------------------
function getMemberRow_(ss, userId) {
  var sheet = ss.getSheetByName('21_會員資料');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var col  = data[0].indexOf('userId');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][col]) === userId) {
      return { sheet: sheet, rowIndex: i + 1, data: data[i], headers: data[0] };
    }
  }
  return null;
}

// ----------------------------------------------
// getOrCreateMember_ -- 查找或新建會員列
// ----------------------------------------------
function getOrCreateMember_(ss, userId) {
  var found = getMemberRow_(ss, userId);
  if (found) return found;
  var sheet = ss.getSheetByName('21_會員資料');
  if (!sheet) throw new Error('21_會員資料 分頁不存在，請先執行 setupQuotaSheets');
  var now = new Date().toISOString();
  var row = MEMBER_HEADERS.map(function(h) {
    if (h === 'userId')            return userId;
    if (h === 'planType')          return 'free';
    if (h === 'bonusBalance')      return 0;
    if (h === 'createdAt')         return now;
    if (h === 'lastSeenAt')        return now;
    if (h === 'lastUsageDate')     return '';
    if (h === 'dailyQuickUsed')    return 0;
    if (h === 'dailyJourneyUsed')  return 0;
    if (h === 'dailyWorkshopUsed') return 0;
    return '';
  });
  sheet.appendRow(row);
  return { sheet: sheet, rowIndex: sheet.getLastRow(), data: row, headers: MEMBER_HEADERS };
}

// ----------------------------------------------
// writeLedger_ -- 寫 23_額度異動紀錄
// ----------------------------------------------
function writeLedger_(ss, userId, action, quotaType, amount, before, after, code, reason) {
  var sheet = ss.getSheetByName('23_額度異動紀錄');
  if (!sheet) return;
  sheet.appendRow([
    new Date().toISOString(), userId, action, quotaType,
    amount, before, after, code || '', reason || ''
  ]);
}

// ----------------------------------------------
// getQuota(userId)
// 回傳 { ok, planType, quick, journey, workshop, bonus, remaining, reason }
// remaining = 當日 quick 剩餘（向前相容）
// ----------------------------------------------
function getQuota(userId) {
  var ss      = SpreadsheetApp.openById(QS_ID);
  var member  = getOrCreateMember_(ss, userId);
  var today   = getTwDate_();
  var headers = member.headers;
  var row     = member.data;

  function col(name) { return row[headers.indexOf(name)]; }

  var planType  = col('planType') || 'free';
  var planEndAt = col('planEndAt');
  if (planEndAt && new Date(planEndAt) < new Date()) planType = 'free';

  var limits   = PLANS[planType] || PLANS.free;
  var lastDate = toTwDateStr_(col('lastUsageDate'));
  var isToday  = lastDate === today;

  var quickUsed    = isToday ? (Number(col('dailyQuickUsed'))    || 0) : 0;
  var journeyUsed  = isToday ? (Number(col('dailyJourneyUsed'))  || 0) : 0;
  var workshopUsed = isToday ? (Number(col('dailyWorkshopUsed')) || 0) : 0;

  var qRemain = Math.max(0, limits.quick    - quickUsed);
  var jRemain = Math.max(0, limits.journey  - journeyUsed);
  var wRemain = Math.max(0, limits.workshop - workshopUsed);
  var bonus   = Number(col('bonusBalance')) || 0;

  return {
    ok:       true,
    planType: planType,
    quick:    qRemain,
    journey:  jRemain,
    workshop: wRemain,
    bonus:    bonus,
    remaining: qRemain,
    reason:   ''
  };
}

// ----------------------------------------------
// consumeQuota(userId, quotaType)
// quotaType: 'quick' | 'journey' | 'workshop'
// 回傳 { ok, planType, quick, journey, workshop, bonus, remaining, source, reason }
// ----------------------------------------------
function consumeQuota(userId, quotaType) {
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    var ss      = SpreadsheetApp.openById(QS_ID);
    var member  = getOrCreateMember_(ss, userId);
    var today   = getTwDate_();
    var headers = member.headers;
    var row     = member.data.slice(); // 操作本機副本
    var sheet   = member.sheet;
    var rowIdx  = member.rowIndex;

    function getVal(name) { return row[headers.indexOf(name)]; }
    function setVal(name, val) {
      row[headers.indexOf(name)] = val;
      sheet.getRange(rowIdx, headers.indexOf(name) + 1).setValue(val);
    }

    var planType  = getVal('planType') || 'free';
    var planEndAt = getVal('planEndAt');
    if (planEndAt && new Date(planEndAt) < new Date()) planType = 'free';

    var limits   = PLANS[planType] || PLANS.free;
    var lastDate = toTwDateStr_(getVal('lastUsageDate'));

    // 新的一天：重置每日用量
    if (lastDate !== today) {
      setVal('lastUsageDate',     today);
      setVal('dailyQuickUsed',    0);
      setVal('dailyJourneyUsed',  0);
      setVal('dailyWorkshopUsed', 0);
    }

    var usedKey = 'daily' + quotaType.charAt(0).toUpperCase() + quotaType.slice(1) + 'Used';
    var used    = Number(getVal(usedKey)) || 0;
    var limit   = limits[quotaType] || 0;
    var bonus   = Number(getVal('bonusBalance')) || 0;

    function calcAllRemaining() {
      return {
        quick:    Math.max(0, limits.quick    - (Number(getVal('dailyQuickUsed'))    || 0)),
        journey:  Math.max(0, limits.journey  - (Number(getVal('dailyJourneyUsed'))  || 0)),
        workshop: Math.max(0, limits.workshop - (Number(getVal('dailyWorkshopUsed')) || 0)),
        bonus:    Number(getVal('bonusBalance')) || 0
      };
    }

    // 每日額度還有
    if (used < limit) {
      setVal(usedKey, used + 1);
      setVal('lastSeenAt', new Date().toISOString());
      writeLedger_(ss, userId, 'DAILY_' + quotaType.toUpperCase(), quotaType,
                   1, limit - used, limit - used - 1, '', '');
      var rem = calcAllRemaining();
      return {
        ok: true, source: 'daily',
        planType:  planType,
        quick:     rem.quick,
        journey:   rem.journey,
        workshop:  rem.workshop,
        bonus:     rem.bonus,
        remaining: rem[quotaType],
        reason:    ''
      };
    }

    // 工坊 bonus 補充
    if (quotaType === 'workshop' && bonus > 0) {
      setVal('bonusBalance', bonus - 1);
      setVal('lastSeenAt', new Date().toISOString());
      writeLedger_(ss, userId, 'BONUS_USED', 'workshop', 1, bonus, bonus - 1, '', 'daily_exhausted');
      var rem2 = calcAllRemaining();
      return {
        ok: true, source: 'bonus',
        planType:  planType,
        quick:     rem2.quick,
        journey:   rem2.journey,
        workshop:  rem2.workshop,
        bonus:     rem2.bonus,
        remaining: rem2.bonus,
        reason:    ''
      };
    }

    // 額度耗盡
    var rem3 = calcAllRemaining();
    return {
      ok: false, source: '',
      planType:  planType,
      quick:     rem3.quick,
      journey:   rem3.journey,
      workshop:  rem3.workshop,
      bonus:     rem3.bonus,
      remaining: 0,
      reason:    'quota_exhausted'
    };

  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------
// redeemCode(code, userId)
// ----------------------------------------------
function redeemCode(code, userId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    var ss        = SpreadsheetApp.openById(QS_ID);
    var codeSheet = ss.getSheetByName('22_贈送額度碼');
    if (!codeSheet) return { ok: false, message: '系統尚未設定額度碼功能' };

    var data    = codeSheet.getDataRange().getValues();
    var headers = data[0];
    function cIdx(name) { return headers.indexOf(name); }

    var codeRow = null, codeRowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][cIdx('code')] === code) { codeRow = data[i]; codeRowIdx = i + 1; break; }
    }
    if (!codeRow)                  return { ok: false, message: '找不到此方案碼' };
    if (!codeRow[cIdx('enabled')]) return { ok: false, message: '此方案碼已停用' };

    var expiresAt = codeRow[cIdx('expiresAt')];
    if (expiresAt && new Date(expiresAt) < new Date()) return { ok: false, message: '方案碼已過期' };

    var maxR  = Number(codeRow[cIdx('maxRedemptions')]) || 1;
    var usedR = Number(codeRow[cIdx('redeemedCount')])  || 0;
    if (usedR >= maxR) return { ok: false, message: '此方案碼已達兌換上限' };

    // 防止同一 userId 重複兌換
    var ledgerSheet = ss.getSheetByName('23_額度異動紀錄');
    if (ledgerSheet && ledgerSheet.getLastRow() > 1) {
      var ledger = ledgerSheet.getDataRange().getValues();
      var lh = ledger[0];
      for (var j = 1; j < ledger.length; j++) {
        if (String(ledger[j][lh.indexOf('userId')]) === userId &&
            String(ledger[j][lh.indexOf('code')])   === code) {
          var act = String(ledger[j][lh.indexOf('action')]);
          if (act === 'REDEEM_GIFT' || act === 'ACTIVATE_STUDENT') {
            return { ok: false, message: '你已經兌換過此方案碼' };
          }
        }
      }
    }

    var member = getOrCreateMember_(ss, userId);
    var mSheet = member.sheet, mRow = member.rowIndex;
    var mData  = member.data,  mH   = member.headers;
    function mIdx(name) { return mH.indexOf(name); }

    var type = codeRow[cIdx('type')];

    if (type === 'gift') {
      var value       = Number(codeRow[cIdx('value')]) || 0;
      var bonusBefore = Number(mData[mIdx('bonusBalance')]) || 0;
      var bonusAfter  = bonusBefore + value;
      mSheet.getRange(mRow, mIdx('bonusBalance') + 1).setValue(bonusAfter);
      codeSheet.getRange(codeRowIdx, cIdx('redeemedCount') + 1).setValue(usedR + 1);
      writeLedger_(ss, userId, 'REDEEM_GIFT', 'bonus', -value, bonusBefore, bonusAfter, code, '兌換贈送碼');
      return { ok: true, type: 'gift', value: value, bonusBalance: bonusAfter,
               bonus: bonusAfter, message: '成功兌換！獲得 ' + value + ' 次工坊額度' };
    }

    if (type === 'student') {
      var planDays  = Number(codeRow[cIdx('planDays')]) || 30;
      var planEndAt = new Date();
      planEndAt.setDate(planEndAt.getDate() + planDays);
      mSheet.getRange(mRow, mIdx('planType')  + 1).setValue('student');
      mSheet.getRange(mRow, mIdx('planEndAt') + 1).setValue(planEndAt.toISOString());
      codeSheet.getRange(codeRowIdx, cIdx('redeemedCount') + 1).setValue(usedR + 1);
      writeLedger_(ss, userId, 'ACTIVATE_STUDENT', 'plan', 0, 0, 0, code, 'Student ' + planDays + 'd');
      return { ok: true, type: 'student', planType: 'student',
               planEndAt: planEndAt.toISOString(),
               message: '學員方案啟用！有效 ' + planDays + ' 天' };
    }

    return { ok: false, message: '未知的方案碼類型' };
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------
// handleQuotaAction -- doPost 路由接口（Code.gs 呼叫）
// ----------------------------------------------
function handleQuotaAction(action, data) {
  if (action === 'getQuota')     return getQuota(data.userId);
  if (action === 'consumeQuota') return consumeQuota(data.userId, data.quotaType);
  if (action === 'redeemCode')   return redeemCode(data.code, data.userId);
  return null;
}

// ----------------------------------------------
// randomSegment_
// ----------------------------------------------
function randomSegment_(len) {
  var chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var result = '';
  for (var i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ----------------------------------------------
// generateGiftCode
// ----------------------------------------------
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

// ----------------------------------------------
// generateStudentCode
// ----------------------------------------------
function generateStudentCode(opts) {
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet) { setupQuotaSheets(); sheet = ss.getSheetByName('22_贈送額度碼'); }
  var code    = 'LEARN-' + randomSegment_(4) + '-' + randomSegment_(4);
  var now     = new Date();
  var expires = new Date(now);
  expires.setDate(expires.getDate() + (opts.planDays || 30) + 7);
  sheet.appendRow([
    code, 'student', 0, 'student', opts.planDays || 30,
    PLANS.student.quick, PLANS.student.journey, PLANS.student.workshop,
    expires.toISOString(), opts.maxRedemptions || 1, 0, true,
    opts.note || '', now.toISOString()
  ]);
  return { code: code, expiresAt: expires.toISOString() };
}

// ----------------------------------------------
// 後台選單 UI
// ----------------------------------------------
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

function uiGenerateGiftCode() {
  var ui   = SpreadsheetApp.getUi();
  var note = ui.prompt('客戶備註').getResponseText().trim();
  var val  = parseInt(ui.prompt('贈送工坊次數').getResponseText(), 10);
  var days = parseInt(ui.prompt('方案碼有效天數').getResponseText(), 10);
  if (!note || isNaN(val) || val <= 0 || isNaN(days) || days <= 0) { ui.alert('輸入無效'); return; }
  var r = generateGiftCode({ note: note, value: val, expiryDays: days, maxRedemptions: 1 });
  ui.alert('方案碼：' + r.code + '\n贈送：' + val + ' 次\n到期：' + r.expiresAt.slice(0,10));
}

function uiGenerateStudentCode() {
  var ui     = SpreadsheetApp.getUi();
  var name   = ui.prompt('課程名稱').getResponseText().trim();
  var days   = parseInt(ui.prompt('有效天數').getResponseText(), 10);
  var maxPpl = parseInt(ui.prompt('最多啟用人數').getResponseText(), 10);
  if (!name || isNaN(days) || days <= 0 || isNaN(maxPpl) || maxPpl <= 0) { ui.alert('輸入無效'); return; }
  var r = generateStudentCode({ note: name, planDays: days, maxRedemptions: maxPpl });
  ui.alert('方案碼：' + r.code + '\n有效：' + days + ' 天\n人數：' + maxPpl + '\n到期：' + r.expiresAt.slice(0,10));
}

function uiListActiveCodes() {
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet || sheet.getLastRow() < 2) { SpreadsheetApp.getUi().alert('目前沒有方案碼'); return; }
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  function cIdx(n) { return headers.indexOf(n); }
  var now = new Date(), lines = ['有效方案碼：\n'];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[cIdx('enabled')]) continue;
    var exp = row[cIdx('expiresAt')];
    if (exp && new Date(exp) < now) continue;
    lines.push((row[cIdx('type')] === 'gift' ? '[gift]' : '[student]') +
      ' ' + row[cIdx('code')] +
      ' | ' + (row[cIdx('redeemedCount')] || 0) + '/' + (row[cIdx('maxRedemptions')] || 1) +
      ' | ' + (exp ? String(exp).slice(0,10) : '無期限') +
      ' | ' + (row[cIdx('note')] || ''));
  }
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

function uiDisableCode() {
  var ui   = SpreadsheetApp.getUi();
  var code = ui.prompt('輸入要停用的方案碼').getResponseText().trim();
  if (!code) return;
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet) { ui.alert('找不到方案碼分頁'); return; }
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    if (data[i][headers.indexOf('code')] === code) {
      sheet.getRange(i + 1, headers.indexOf('enabled') + 1).setValue(false);
      ui.alert('已停用：' + code);
      return;
    }
  }
  ui.alert('找不到：' + code);
}
