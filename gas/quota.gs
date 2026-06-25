// ==============================================
// Angel-happy-rat quota.gs  v3
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
  'lastUsageDate','dailyQuickUsed','dailyJourneyUsed','dailyWorkshopUsed',
  'customDailyQuick','customDailyJourney','customDailyWorkshop'
];
var CODE_HEADERS = [
  'code','type','value','planType','planDays',
  'dailyQuickLimit','dailyJourneyLimit','dailyWorkshopLimit',
  'expiresAt','maxRedemptions','redeemedCount','enabled','note','createdAt'
];
var LEDGER_HEADERS = [
  'time','userId','action','quotaType','amount',
  'balanceBefore','balanceAfter','code','reason'
];

// ----------------------------------------------
// toTwDateStr_ -- 統一轉換日期值為 yyyy-MM-dd 字串
// ----------------------------------------------
function toTwDateStr_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  var s = String(val).trim();
  if (s.length >= 10) {
    try { return Utilities.formatDate(new Date(s), 'Asia/Taipei', 'yyyy-MM-dd'); } catch (e) {}
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
// ensureMemberColumns_ -- 補齊 21_會員資料 缺少的新欄位（schema 升版自動遷移）
// 回傳最新的 headers 陣列
// ----------------------------------------------
function ensureMemberColumns_(sheet) {
  var data     = sheet.getDataRange().getValues();
  var existing = data[0] || [];
  var toAdd    = MEMBER_HEADERS.filter(function(h) { return existing.indexOf(h) < 0; });
  if (toAdd.length === 0) return existing;
  var nextCol = existing.length + 1;
  toAdd.forEach(function(h, i) {
    sheet.getRange(1, nextCol + i).setValue(h).setFontWeight('bold');
  });
  sheet.setFrozenRows(1);
  return existing.concat(toAdd);
}

// ----------------------------------------------
// getLimitsForMember_ -- 讀取該會員有效的每日額度上限
// planType='custom' 且有自訂值時使用自訂值，否則用 PLANS
// ----------------------------------------------
function getLimitsForMember_(row, headers, planType) {
  if (planType === 'custom') {
    var qi = headers.indexOf('customDailyQuick');
    var ji = headers.indexOf('customDailyJourney');
    var wi = headers.indexOf('customDailyWorkshop');
    var q  = qi >= 0 ? (Number(row[qi]) || 0) : 0;
    var j  = ji >= 0 ? (Number(row[ji]) || 0) : 0;
    var w  = wi >= 0 ? (Number(row[wi]) || 0) : 0;
    if (q > 0 || j > 0 || w > 0) return { quick: q, journey: j, workshop: w };
  }
  return PLANS[planType] || PLANS.free;
}

// ----------------------------------------------
// setupQuotaSheets -- 建立 21/22/23 三張分頁，並補齊會員欄位
// ----------------------------------------------
function setupQuotaSheets() {
  var ss  = SpreadsheetApp.openById(QS_ID);
  var log = [];
  log.push(ensureSheet_(ss, '21_會員資料',    MEMBER_HEADERS));
  log.push(ensureSheet_(ss, '22_贈送額度碼',  CODE_HEADERS));
  log.push(ensureSheet_(ss, '23_額度異動紀錄', LEDGER_HEADERS));
  var mSheet = ss.getSheetByName('21_會員資料');
  if (mSheet) {
    var before = mSheet.getDataRange().getValues()[0] || [];
    ensureMemberColumns_(mSheet);
    var after = mSheet.getDataRange().getValues()[0] || [];
    var added = after.length - before.length;
    log.push(added > 0 ? ('補齊 ' + added + ' 個會員欄位') : '會員欄位已是最新');
  }
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
  var currentHeaders = ensureMemberColumns_(sheet);
  var now = new Date().toISOString();
  var row = currentHeaders.map(function(h) {
    if (h === 'userId')              return userId;
    if (h === 'planType')            return 'free';
    if (h === 'bonusBalance')        return 0;
    if (h === 'createdAt')           return now;
    if (h === 'lastSeenAt')          return now;
    if (h === 'lastUsageDate')       return '';
    if (h === 'dailyQuickUsed')      return 0;
    if (h === 'dailyJourneyUsed')    return 0;
    if (h === 'dailyWorkshopUsed')   return 0;
    if (h === 'customDailyQuick')    return 0;
    if (h === 'customDailyJourney')  return 0;
    if (h === 'customDailyWorkshop') return 0;
    return '';
  });
  sheet.appendRow(row);
  return { sheet: sheet, rowIndex: sheet.getLastRow(), data: row, headers: currentHeaders };
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
// ----------------------------------------------
function getQuota(userId) {
  var ss      = SpreadsheetApp.openById(QS_ID);
  var member  = getOrCreateMember_(ss, userId);
  var today   = getTwDate_();
  var headers = member.headers;
  var row     = member.data;

  function col(name) {
    var i = headers.indexOf(name);
    return i >= 0 ? row[i] : undefined;
  }

  var planType  = col('planType') || 'free';
  var planEndAt = col('planEndAt');
  if (planEndAt && new Date(planEndAt) < new Date()) planType = 'free';

  var limits   = getLimitsForMember_(row, headers, planType);
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
    var row     = member.data.slice();
    var sheet   = member.sheet;
    var rowIdx  = member.rowIndex;

    function getVal(name) {
      var i = headers.indexOf(name);
      return i >= 0 ? row[i] : undefined;
    }
    function setVal(name, val) {
      var i = headers.indexOf(name);
      if (i < 0) return;
      row[i] = val;
      sheet.getRange(rowIdx, i + 1).setValue(val);
    }

    var planType  = getVal('planType') || 'free';
    var planEndAt = getVal('planEndAt');
    if (planEndAt && new Date(planEndAt) < new Date()) planType = 'free';

    var limits   = getLimitsForMember_(row, headers, planType);
    var lastDate = toTwDateStr_(getVal('lastUsageDate'));

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

    if (used < limit) {
      setVal(usedKey, used + 1);
      setVal('lastSeenAt', new Date().toISOString());
      writeLedger_(ss, userId, 'DAILY_' + quotaType.toUpperCase(), quotaType,
                   1, limit - used, limit - used - 1, '', '');
      var rem = calcAllRemaining();
      return {
        ok: true, source: 'daily', planType: planType,
        quick: rem.quick, journey: rem.journey, workshop: rem.workshop,
        bonus: rem.bonus, remaining: rem[quotaType], reason: ''
      };
    }

    if (quotaType === 'workshop' && bonus > 0) {
      setVal('bonusBalance', bonus - 1);
      setVal('lastSeenAt', new Date().toISOString());
      writeLedger_(ss, userId, 'BONUS_USED', 'workshop', 1, bonus, bonus - 1, '', 'daily_exhausted');
      var rem2 = calcAllRemaining();
      return {
        ok: true, source: 'bonus', planType: planType,
        quick: rem2.quick, journey: rem2.journey, workshop: rem2.workshop,
        bonus: rem2.bonus, remaining: rem2.bonus, reason: ''
      };
    }

    var rem3 = calcAllRemaining();
    return {
      ok: false, source: '', planType: planType,
      quick: rem3.quick, journey: rem3.journey, workshop: rem3.workshop,
      bonus: rem3.bonus, remaining: 0, reason: 'quota_exhausted'
    };

  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------
// redeemCode(code, userId)
// 支援 type: 'gift' | 'student' | 'custom'
// ----------------------------------------------
function redeemCode(code, userId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    var ss        = SpreadsheetApp.openById(QS_ID);
    var codeSheet = ss.getSheetByName('22_贈送額度碼');
    if (!codeSheet) return { ok: false, message: '系統尚未設定額度碼功能' };

    var data    = codeSheet.getDataRange().getValues();
    var cH      = data[0];
    function cIdx(name) { return cH.indexOf(name); }

    var codeRow = null, codeRowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][cIdx('code')]) === code) { codeRow = data[i]; codeRowIdx = i + 1; break; }
    }
    if (!codeRow)                  return { ok: false, message: '找不到此方案碼' };
    if (!codeRow[cIdx('enabled')]) return { ok: false, message: '此方案碼已停用' };

    var expiresAt = codeRow[cIdx('expiresAt')];
    if (expiresAt && new Date(expiresAt) < new Date()) return { ok: false, message: '方案碼已過期' };

    var maxR  = Number(codeRow[cIdx('maxRedemptions')]) || 1;
    var usedR = Number(codeRow[cIdx('redeemedCount')])  || 0;
    if (usedR >= maxR) return { ok: false, message: '此方案碼已達兌換上限' };

    var ledgerSheet = ss.getSheetByName('23_額度異動紀錄');
    if (ledgerSheet && ledgerSheet.getLastRow() > 1) {
      var ledger = ledgerSheet.getDataRange().getValues();
      var lh     = ledger[0];
      var REDEEM_ACTIONS = ['REDEEM_GIFT', 'ACTIVATE_STUDENT', 'ACTIVATE_CUSTOM'];
      for (var j = 1; j < ledger.length; j++) {
        if (String(ledger[j][lh.indexOf('userId')]) === userId &&
            String(ledger[j][lh.indexOf('code')])   === code &&
            REDEEM_ACTIONS.indexOf(String(ledger[j][lh.indexOf('action')])) >= 0) {
          return { ok: false, message: '你已經兌換過此方案碼' };
        }
      }
    }

    var member = getOrCreateMember_(ss, userId);
    var mSheet = member.sheet;
    var mRow   = member.rowIndex;
    var freshH = ensureMemberColumns_(mSheet);
    function mIdx(name) { return freshH.indexOf(name); }

    var type = codeRow[cIdx('type')];

    if (type === 'gift') {
      var freshData   = mSheet.getRange(mRow, 1, 1, freshH.length).getValues()[0];
      var giftVal     = Number(codeRow[cIdx('value')]) || 0;
      var bonusBefore = Number(freshData[mIdx('bonusBalance')]) || 0;
      var bonusAfter  = bonusBefore + giftVal;
      mSheet.getRange(mRow, mIdx('bonusBalance') + 1).setValue(bonusAfter);
      codeSheet.getRange(codeRowIdx, cIdx('redeemedCount') + 1).setValue(usedR + 1);
      writeLedger_(ss, userId, 'REDEEM_GIFT', 'bonus', giftVal, bonusBefore, bonusAfter, code, '兌換贈送碼');
      return { ok: true, type: 'gift', value: giftVal, bonusBalance: bonusAfter,
               bonus: bonusAfter, message: '成功兌換！獲得 ' + giftVal + ' 次工坊額度' };
    }

    if (type === 'student') {
      var sPlanDays  = Number(codeRow[cIdx('planDays')]) || 30;
      var sPlanEndAt = new Date();
      sPlanEndAt.setDate(sPlanEndAt.getDate() + sPlanDays);
      mSheet.getRange(mRow, mIdx('planType')  + 1).setValue('student');
      mSheet.getRange(mRow, mIdx('planEndAt') + 1).setValue(sPlanEndAt.toISOString());
      codeSheet.getRange(codeRowIdx, cIdx('redeemedCount') + 1).setValue(usedR + 1);
      writeLedger_(ss, userId, 'ACTIVATE_STUDENT', 'plan', 0, 0, 0, code, 'Student ' + sPlanDays + 'd');
      return { ok: true, type: 'student', planType: 'student',
               planEndAt: sPlanEndAt.toISOString(),
               message: '學員方案啟用！有效 ' + sPlanDays + ' 天' };
    }

    if (type === 'custom') {
      var cPlanDays  = Number(codeRow[cIdx('planDays')]) || 30;
      var cPlanEndAt = new Date();
      cPlanEndAt.setDate(cPlanEndAt.getDate() + cPlanDays);
      var cq = Number(codeRow[cIdx('dailyQuickLimit')])    || PLANS.free.quick;
      var cj = Number(codeRow[cIdx('dailyJourneyLimit')])  || PLANS.free.journey;
      var cw = Number(codeRow[cIdx('dailyWorkshopLimit')]) || PLANS.free.workshop;
      mSheet.getRange(mRow, mIdx('planType')  + 1).setValue('custom');
      mSheet.getRange(mRow, mIdx('planEndAt') + 1).setValue(cPlanEndAt.toISOString());
      if (mIdx('customDailyQuick')    >= 0) mSheet.getRange(mRow, mIdx('customDailyQuick')    + 1).setValue(cq);
      if (mIdx('customDailyJourney')  >= 0) mSheet.getRange(mRow, mIdx('customDailyJourney')  + 1).setValue(cj);
      if (mIdx('customDailyWorkshop') >= 0) mSheet.getRange(mRow, mIdx('customDailyWorkshop') + 1).setValue(cw);
      codeSheet.getRange(codeRowIdx, cIdx('redeemedCount') + 1).setValue(usedR + 1);
      writeLedger_(ss, userId, 'ACTIVATE_CUSTOM', 'plan', 0, 0, 0, code,
                   'Custom ' + cPlanDays + 'd Q' + cq + '/J' + cj + '/W' + cw);
      return {
        ok: true, type: 'custom', planType: 'custom',
        planEndAt:    cPlanEndAt.toISOString(),
        dailyQuick:   cq, dailyJourney: cj, dailyWorkshop: cw,
        message: '自訂方案啟用！有效 ' + cPlanDays + ' 天，每日快速 ' + cq + '、旅程 ' + cj + '、工坊 ' + cw + ' 次'
      };
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
  // 管理員 API（均需 adminKey 驗證）
  if (action === 'adminListCodes')     return adminListCodes_(data.adminKey);
  if (action === 'adminCreateCode')    return adminCreateCode_(data, data.adminKey);
  if (action === 'adminDisableCode')   return adminDisableCode_(data.code, data.adminKey);
  if (action === 'adminGetMember')     return adminGetMember_(data.userId, data.adminKey);
  if (action === 'adminListMembers')   return adminListMembers_(data.limit, data.adminKey);
  if (action === 'adminGrantBonus')           return adminGrantBonus_(data.userId, Number(data.amount), data.note, data.adminKey);
  if (action === 'adminMigrateSchema')        return adminMigrateSchema_(data.adminKey);
  if (action === 'adminListCodeRedemptions')  return adminListCodeRedemptions_(data.code, data.adminKey);
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
// generateCustomCode -- 產生 TEST-* 或 GROUP-* 等自訂方案碼
// ----------------------------------------------
function generateCustomCode(opts) {
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet) { setupQuotaSheets(); sheet = ss.getSheetByName('22_贈送額度碼'); }
  var prefix  = (opts.prefix || 'TEST').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  var code    = prefix + '-' + randomSegment_(4) + '-' + randomSegment_(4);
  var now     = new Date();
  var expires = new Date(now);
  expires.setDate(expires.getDate() + (opts.planDays || 30) + 7);
  var dq = opts.dailyQuick    || PLANS.free.quick;
  var dj = opts.dailyJourney  || PLANS.free.journey;
  var dw = opts.dailyWorkshop || PLANS.free.workshop;
  sheet.appendRow([
    code, 'custom', 0, 'custom', opts.planDays || 30,
    dq, dj, dw,
    expires.toISOString(), opts.maxRedemptions || 1, 0, true,
    opts.note || '', now.toISOString()
  ]);
  return {
    code: code, expiresAt: expires.toISOString(),
    planDays: opts.planDays || 30,
    dailyQuick: dq, dailyJourney: dj, dailyWorkshop: dw
  };
}

// ==============================================
// 管理員 API（均需 checkAdminKey_ 驗證）
// Script Properties 中設定 ADMIN_KEY 啟用
// ==============================================

function checkAdminKey_(key) {
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!(stored && key && key === stored);
}

function adminListCodes_(adminKey) {
  if (!checkAdminKey_(adminKey)) return { ok: false, message: '管理員金鑰錯誤' };
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, codes: [] };
  var data = sheet.getDataRange().getValues();
  var h    = data[0];
  function ci(n) { return h.indexOf(n); }
  var now = new Date();
  var codes = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var exp = row[ci('expiresAt')];
    codes.push({
      code:           row[ci('code')],
      type:           row[ci('type')],
      value:          row[ci('value')],
      planDays:       row[ci('planDays')],
      dailyQuick:     row[ci('dailyQuickLimit')],
      dailyJourney:   row[ci('dailyJourneyLimit')],
      dailyWorkshop:  row[ci('dailyWorkshopLimit')],
      expiresAt:      exp ? String(exp).slice(0, 10) : '',
      maxRedemptions: row[ci('maxRedemptions')],
      redeemedCount:  row[ci('redeemedCount')],
      enabled:        row[ci('enabled')],
      note:           row[ci('note')],
      expired:        !!(exp && new Date(exp) < now)
    });
  }
  return { ok: true, codes: codes };
}

function adminCreateCode_(opts, adminKey) {
  if (!checkAdminKey_(adminKey)) return { ok: false, message: '管理員金鑰錯誤' };
  var type = opts.type || 'custom';
  if (type === 'gift')    return Object.assign({ ok: true }, generateGiftCode(opts));
  if (type === 'student') return Object.assign({ ok: true }, generateStudentCode(opts));
  return Object.assign({ ok: true }, generateCustomCode(opts));
}

function adminDisableCode_(code, adminKey) {
  if (!checkAdminKey_(adminKey)) return { ok: false, message: '管理員金鑰錯誤' };
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('22_贈送額度碼');
  if (!sheet) return { ok: false, message: '找不到方案碼分頁' };
  var data = sheet.getDataRange().getValues();
  var h    = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][h.indexOf('code')]) === code) {
      sheet.getRange(i + 1, h.indexOf('enabled') + 1).setValue(false);
      return { ok: true, message: '已停用：' + code };
    }
  }
  return { ok: false, message: '找不到此方案碼：' + code };
}

function adminGetMember_(userId, adminKey) {
  if (!checkAdminKey_(adminKey)) return { ok: false, message: '管理員金鑰錯誤' };
  var ss     = SpreadsheetApp.openById(QS_ID);
  var member = getMemberRow_(ss, userId);
  if (!member) return { ok: false, message: '找不到此使用者：' + userId };
  var result = {};
  member.headers.forEach(function(key, i) { result[key] = member.data[i]; });
  return { ok: true, member: result };
}

function adminListMembers_(limit, adminKey) {
  if (!checkAdminKey_(adminKey)) return { ok: false, message: '管理員金鑰錯誤' };
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('21_會員資料');
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, total: 0, members: [] };
  var data = sheet.getDataRange().getValues();
  var h    = data[0];
  var n    = Math.min(data.length - 1, Number(limit) || 50);
  return {
    ok:      true,
    total:   data.length - 1,
    members: data.slice(1, n + 1).map(function(row) {
      var m = {};
      h.forEach(function(k, i) { m[k] = row[i]; });
      return m;
    })
  };
}

function adminGrantBonus_(userId, amount, note, adminKey) {
  if (!checkAdminKey_(adminKey)) return { ok: false, message: '管理員金鑰錯誤' };
  if (!amount || amount <= 0)    return { ok: false, message: '金額必須大於 0' };
  var ss     = SpreadsheetApp.openById(QS_ID);
  var member = getOrCreateMember_(ss, userId);
  var bi     = member.headers.indexOf('bonusBalance');
  var before = bi >= 0 ? (Number(member.data[bi]) || 0) : 0;
  var after  = before + amount;
  if (bi >= 0) member.sheet.getRange(member.rowIndex, bi + 1).setValue(after);
  writeLedger_(ss, userId, 'ADMIN_GRANT', 'bonus', amount, before, after, '', note || 'admin grant');
  return { ok: true, userId: userId, bonusBalance: after, message: '已贈 ' + amount + ' 次，餘額：' + after };
}

function adminMigrateSchema_(adminKey) {
  if (!checkAdminKey_(adminKey)) return { ok: false, message: '管理員金鑰錯誤' };
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('21_會員資料');
  if (!sheet) return { ok: false, message: '21_會員資料 分頁不存在' };
  var before  = (sheet.getDataRange().getValues()[0] || []).length;
  var current = ensureMemberColumns_(sheet);
  var added   = current.length - before;
  return { ok: true, message: '遷移完成，新增 ' + added + ' 個欄位', headers: current };
}

// ----------------------------------------------
// adminListCodeRedemptions_ -- 查某個兌換碼的使用紀錄（從 23_額度異動紀錄 撈）
// ----------------------------------------------
function adminListCodeRedemptions_(code, adminKey) {
  if (!checkAdminKey_(adminKey)) return { ok: false, message: '管理員金鑰錯誤' };
  if (!code) return { ok: false, message: '請提供方案碼' };
  var ss    = SpreadsheetApp.openById(QS_ID);
  var sheet = ss.getSheetByName('23_額度異動紀錄');
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, code: code, count: 0, redemptions: [] };
  var data = sheet.getDataRange().getValues();
  var h    = data[0];
  var REDEEM_ACTIONS = ['REDEEM_GIFT', 'ACTIVATE_STUDENT', 'ACTIVATE_CUSTOM'];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[h.indexOf('code')])   === code &&
        REDEEM_ACTIONS.indexOf(String(row[h.indexOf('action')])) >= 0) {
      results.push({
        userId:       String(row[h.indexOf('userId')]),
        time:         String(row[h.indexOf('time')]).slice(0, 19),
        action:       String(row[h.indexOf('action')]),
        amount:       Number(row[h.indexOf('amount')]) || 0,
        balanceAfter: Number(row[h.indexOf('balanceAfter')]) || 0,
        reason:       String(row[h.indexOf('reason')])
      });
    }
  }
  return { ok: true, code: code, count: results.length, redemptions: results };
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
    .addItem('產生自訂方案碼', 'uiGenerateCustomCode')
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
  ui.alert('方案碼：' + r.code + '\n贈送：' + val + ' 次\n到期：' + r.expiresAt.slice(0, 10));
}

function uiGenerateStudentCode() {
  var ui     = SpreadsheetApp.getUi();
  var name   = ui.prompt('課程名稱').getResponseText().trim();
  var days   = parseInt(ui.prompt('有效天數').getResponseText(), 10);
  var maxPpl = parseInt(ui.prompt('最多啟用人數').getResponseText(), 10);
  if (!name || isNaN(days) || days <= 0 || isNaN(maxPpl) || maxPpl <= 0) { ui.alert('輸入無效'); return; }
  var r = generateStudentCode({ note: name, planDays: days, maxRedemptions: maxPpl });
  ui.alert('方案碼：' + r.code + '\n有效：' + days + ' 天\n人數：' + maxPpl + '\n到期：' + r.expiresAt.slice(0, 10));
}

function uiGenerateCustomCode() {
  var ui     = SpreadsheetApp.getUi();
  var prefix = ui.prompt('前綴（TEST 或 GROUP）').getResponseText().trim() || 'TEST';
  var days   = parseInt(ui.prompt('有效天數').getResponseText(), 10);
  var maxPpl = parseInt(ui.prompt('最多啟用人數').getResponseText(), 10);
  var dq     = parseInt(ui.prompt('每日快速模式次數').getResponseText(), 10);
  var dj     = parseInt(ui.prompt('每日旅程次數').getResponseText(), 10);
  var dw     = parseInt(ui.prompt('每日工坊次數').getResponseText(), 10);
  var note   = ui.prompt('備註').getResponseText().trim();
  if (isNaN(days) || days <= 0 || isNaN(maxPpl) || maxPpl <= 0 ||
      isNaN(dq) || dq <= 0 || isNaN(dj) || dj <= 0 || isNaN(dw) || dw <= 0) {
    ui.alert('輸入無效'); return;
  }
  var r = generateCustomCode({
    prefix: prefix, planDays: days, maxRedemptions: maxPpl,
    dailyQuick: dq, dailyJourney: dj, dailyWorkshop: dw, note: note
  });
  ui.alert('方案碼：' + r.code +
    '\n前綴：' + prefix + '  有效：' + days + ' 天  人數：' + maxPpl +
    '\n每日快速：' + dq + '  旅程：' + dj + '  工坊：' + dw +
    '\n到期：' + r.expiresAt.slice(0, 10));
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
    lines.push('[' + row[cIdx('type')] + '] ' + row[cIdx('code')] +
      ' | ' + (row[cIdx('redeemedCount')] || 0) + '/' + (row[cIdx('maxRedemptions')] || 1) +
      ' | ' + (exp ? String(exp).slice(0, 10) : '無期限') +
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
