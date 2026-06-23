/**
 * Gate 3A 後台清表工具
 *
 * 使用方式：
 *   1. 開啟 Apps Script 編輯器
 *   2. 新增檔案，貼入此檔全部內容
 *   3. 選取函式 gate3aCleanup，按「執行」
 *   4. 授權後等候完成提示
 *
 * 不執行 setupSheets()，不新增分頁，不修改正式資料列。
 */

var SPREADSHEET_ID = '1e6A5DXw_rGkSNi-Kk7LrsVje0KJkLrwO07aeLVuH_cI';

function gate3aCleanup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var log = [];

  // 1. 分頁改名：移除三個含尾端換行的分頁名稱
  var renames = [
    { from: '11_分享文案庫\n',   to: '11_分享文案庫'   },
    { from: '13_近期使用紀錄\n', to: '13_近期使用紀錄' },
    { from: '20_創作排行榜\n',   to: '20_創作排行榜'   }
  ];
  renames.forEach(function(r) {
    var sheet = ss.getSheetByName(r.from);
    if (sheet) {
      sheet.setName(r.to);
      log.push('[改名 ✓] ' + r.from.trim());
    } else {
      log.push('[已跳過] 找不到含換行的「' + r.from.trim() + '」（可能已改名）');
    }
  });

  // 2. 刪除重複的 12_禁用詞（含尾端換行版本）
  var dupSheet = ss.getSheetByName('12_禁用詞\n');
  if (dupSheet) {
    ss.deleteSheet(dupSheet);
    log.push('[刪除 ✓] 12_禁用詞（含換行重複分頁）');
  } else {
    log.push('[已跳過] 找不到重複的 12_禁用詞（含換行）');
  }

  // 3. 補 08_歌曲模板庫 表頭（只在完全空白時寫入）
  var songSheet = ss.getSheetByName('08_歌曲模板庫');
  if (songSheet) {
    if (songSheet.getLastRow() === 0) {
      songSheet.appendRow(['type', 'content', 'enabled']);
      songSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
      log.push('[補表頭 ✓] 08_歌曲模板庫');
    } else {
      log.push('[已跳過] 08_歌曲模板庫 已有內容，未修改');
    }
  } else {
    log.push('[錯誤] 找不到 08_歌曲模板庫');
  }

  // 4. 所有分頁凍結第一列（表頭）
  var frozenCount = 0;
  ss.getSheets().forEach(function(sheet) {
    if (sheet.getFrozenRows() === 0) {
      sheet.setFrozenRows(1);
      frozenCount++;
    }
  });
  log.push('[凍結 ✓] ' + frozenCount + ' 個分頁補設凍結列');

  // 5. 標記測試污染資料（橘色背景，不刪除）
  markTestData_(ss, log);

  // 輸出結果
  var result = '=== Gate 3A 清表結果 ===\n' + log.join('\n');
  Logger.log(result);
  try {
    SpreadsheetApp.getUi().alert(result);
  } catch (e) {
    // 無 UI 環境（如排程觸發），只寫 Logger
  }
}

function markTestData_(ss, log) {
  var ORANGE = '#FFE0B2';

  // 已知測試資料識別條件（Gate 2 盤點紀錄）
  var rules = [
    // 16_流量事件：userId=audit-001 的那筆
    { sheetName: '16_流量事件', matchCol: 'userId',    matchVal: 'audit-001' },
    // 16_流量事件：只有 timestamp 的空探測列
    { sheetName: '16_流量事件', matchCol: 'timestamp', matchVal: '2026-06-23T12:22:39.414Z' },
    // 01_生成紀錄：userId=audit-001 的那筆
    { sheetName: '01_生成紀錄', matchCol: 'userId',    matchVal: 'audit-001' },
    // 01_生成紀錄：只有 timestamp 的空探測列
    { sheetName: '01_生成紀錄', matchCol: 'timestamp', matchVal: '2026-06-23T12:22:41.490Z' }
  ];

  rules.forEach(function(rule) {
    var sheet = ss.getSheetByName(rule.sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;
    var data   = sheet.getDataRange().getValues();
    var header = data[0];
    var col    = header.indexOf(rule.matchCol);
    if (col === -1) {
      log.push('[標記跳過] ' + rule.sheetName + ' 找不到欄位 ' + rule.matchCol);
      return;
    }
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][col]).trim() === rule.matchVal) {
        sheet.getRange(i + 1, 1, 1, header.length).setBackground(ORANGE);
        log.push('[標記 ✓] ' + rule.sheetName + ' 第 ' + (i + 1) + ' 列（' + rule.matchCol + '=' + rule.matchVal + '）');
      }
    }
  });
}
