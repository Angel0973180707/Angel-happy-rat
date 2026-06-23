/**
 * Gate 3 欄位盤點工具
 *
 * 使用方式：
 *   1. Apps Script 編輯器 → 新增檔案，命名 gate3-inspect
 *   2. 貼入此檔全部內容
 *   3. 選取函式 gate3Inspect，按「執行」
 *   4. 執行完成後到「執行記錄」複製結果回報給 Angel-c
 *
 * 只讀取，不修改任何資料。
 */

var SPREADSHEET_ID = '1e6A5DXw_rGkSNi-Kk7LrsVje0KJkLrwO07aeLVuH_cI';

function gate3Inspect() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var lines = ['=== Gate 3 欄位盤點 ===', '分頁數：' + sheets.length, ''];

  sheets.forEach(function(sheet) {
    var name = sheet.getName();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    if (lastRow === 0 || lastCol === 0) {
      lines.push('[' + name + '] 空白（無資料）');
      return;
    }

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var dataRows = lastRow > 1 ? lastRow - 1 : 0;
    lines.push('[' + name + '] 資料 ' + dataRows + ' 筆');
    lines.push('  欄位：' + headers.map(function(h, i) {
      return (i + 1) + '.' + (h || '(空)');
    }).join(' | '));
    lines.push('');
  });

  var result = lines.join('\n');
  Logger.log(result);
  try {
    SpreadsheetApp.getUi().alert(result);
  } catch (e) {
    // 無 UI 環境只寫 Logger
  }
}
