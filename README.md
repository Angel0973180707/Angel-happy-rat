# 笑鼠人了！PWA

副標：笑掉煩惱，吹大夢想，把人生活成作品。

這是一個歡樂版人生導航系統、AI 人生創作工廠、情緒轉化遊樂場。MVP 支援手機開啟、PWA 安裝、離線首頁、八大模式生成、再來一版、複製、分享、本機紀錄、Google Sheets 紀錄、GA4/Clarity 預留與智慧之門合作接口預留。

## 專案檔案

- `index.html`：PWA 主頁、GA4 與 Clarity 預留碼位。
- `style.css`：手機優先響應式介面。
- `app.js`：八大模式生成、匿名 userId/sessionId、事件追蹤、Sheets 儲存、合作接口。
- `manifest.json`：PWA 安裝設定。
- `service-worker.js`：App shell 快取，支援離線首頁。
- `gas/Code.gs`：Google Apps Script 完整覆蓋版。
- `icons/`：SVG 原圖與 192/512px PNG 安裝圖示。
- `tests/validate-project.mjs`：不連外的靜態驗收腳本。

## Google Sheets 建立步驟

1. 建立一份新的 Google Sheet。
2. 開啟「擴充功能」→「Apps Script」。
3. 將 `gas/Code.gs` 全部貼上，儲存。
4. 在 Apps Script 執行 `setupSheets()` 並授權。
5. 確認已建立 20 個分頁：
   `01_生成紀錄` 到 `20_內容排行榜`。
6. 部署為 Web App：
   - 執行身分：我
   - 存取權：任何人
7. 複製 Web App URL，填入 `app.js` 的 `CONFIG.gasEndpoint`。

## PWA 部署步驟

1. 將整個資料夾部署到 HTTPS 靜態網站，例如 GitHub Pages、Firebase Hosting、Cloudflare Pages、Netlify。
2. 確認 `index.html`、`manifest.json`、`service-worker.js` 位於同一路徑層級。
3. 用手機 Chrome 或 Safari 開啟網址。
4. Chrome Android 可從選單選「新增至主畫面」。
5. iOS Safari 可用分享按鈕選「加入主畫面」。
6. 首次載入後關閉網路，重新開啟應可看到首頁。

## GA4 設定步驟

1. 在 Google Analytics 建立 GA4 資源與 Web 串流。
2. 複製 Measurement ID，例如 `G-ABC1234567`。
3. 將 `app.js` 的 `CONFIG.gaMeasurementId` 填入正式 ID。留空時不會載入 GA，方便本機測試。
4. 在 GA4 DebugView 檢查事件：
   `APP_OPEN`, `MODE_SELECT`, `GENERATE`, `REGENERATE`, `COPY`, `SHARE`, `ENTER_WORKSHOP`, `GENERATE_SONG`, `GENERATE_IMAGE`, `GENERATE_VIDEO`, `JOIN_WAITLIST`, `PARTNER_CLICK`。

## Clarity 設定步驟

1. 到 Microsoft Clarity 建立專案。
2. 複製 Project ID。
3. 將 `app.js` 的 `CONFIG.clarityProjectId` 填入正式 ID。留空時不會載入 Clarity。
4. 發佈後到 Clarity 檢查熱區、點擊與 Session Recording。

## 測試案例

1. 開啟 `index.html`，畫面正常顯示品牌、輸入框與八大模式。
2. 輸入「我今天焦慮到想原地關機」，點「產生笑果」。
3. 切換八大模式，各模式都能產生不同內容。
4. 點「再來一版」，內容更新且不報錯。
5. 點「複製」，剪貼簿取得結果。
6. 點「分享」，支援 Web Share 的手機會跳出分享面板，桌機則複製文字與網址。
7. 點「進入創作工坊」，頁面捲到工坊並送出 `ENTER_WORKSHOP`。
8. 分別點歌曲、繪圖、MV 分鏡，送出對應事件。
9. 清除網路後重新整理，首頁仍可由 service worker 快取開啟。
10. GAS 端執行 `setupSheets()`，確認所有分頁存在。
11. 設定 `CONFIG.gasEndpoint` 後產生內容，確認 `01_生成紀錄` 和 `13_近期使用紀錄` 有新增資料。

可先執行靜態驗收：

```powershell
node tests/validate-project.mjs
```

## 已修正與補齊

- 補齊完整 PWA 檔案與安裝 manifest。
- 補齊 service worker app shell 快取與離線首頁 fallback。
- 補齊八大模式與兩條路線：輕鬆玩、完整創作。
- 補齊匿名 `userId` 與每次進站 `sessionId`，儲存在 localStorage。
- 補齊 GA4 事件追蹤與 Clarity 預留碼位。
- 補齊 Google Sheets 20 分頁 `setupSheets()`。
- 補齊 GAS 指定函式、生成函式、創作函式與合作接口函式。
- 補齊智慧之門 Coming Soon，僅做合作方連結、推薦碼、API、導流紀錄與等待名單預留。
- 補強複製與分享的非安全環境降級處理、localStorage 損壞保護與事件寫入 Sheets。
- 修正合作導流欄位遺失、內容排行榜未更新與 Sheets 公式注入風險。
- 追蹤碼改成設定 ID 後才載入，避免 placeholder 造成無效請求。
- 「再來一版」加入可輪替變體，避免固定模式立即產生相同內容。

## 智慧之門接口說明

目前狀態只做 Coming Soon，不做易經、不算命、不解卦。可在 `14_合作夥伴設定` 管理：

- `partnerId`：合作方識別碼。
- `name`：合作方名稱。
- `url`：導流連結。
- `apiEndpoint`：合作方 API endpoint。
- `referralCode`：推薦碼。
- `revenueShare`：分潤備註。
- `whiteLabelUrl`：白標頁網址。
- `enabled`：是否啟用。

前端 `CONFIG.partner` 可先設定合作方 URL 與 referral code。使用者點擊合作接口時會送出 `PARTNER_CLICK`，GAS 會寫入 `15_合作導流紀錄`。
