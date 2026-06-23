# Gate 3：欄位確認與新增設計

盤點日期：2026-06-23（gate3Inspect 執行結果）

---

## 一、現有分頁可沿用狀況

| 分頁 | 資料筆數 | 結論 |
|------|--------:|------|
| 01_生成紀錄 | 37 | ✅ 沿用，不改欄位 |
| 16_流量事件 | 326 | ✅ 沿用，新增 eventType 值即可，不改欄位 |
| 17_每日統計 | 0 | ✅ 沿用，補寫入邏輯即可 |
| 02–15、18–20 | 0 | ✅ 保留，目前不寫入 |

### 01_生成紀錄 實際欄位（19 欄，全中文）

```
時間 | 使用者代碼 | 模式 | 子模式 | 情緒 | 對象/主題 | 風格 | 長度模式
使用者輸入 | 系統理解摘要 | 小天鼠輸出 | 唬爛虎輸出 | 迷航輸出
亮點輸出 | 自導自演輸出 | 歌曲輸出 | 繪圖提示 | 影片提示 | 分享文案
```

→ `使用者代碼` = userId（匿名識別碼）
→ `時間` = timestamp
→ **不需要新增欄位**，GAS 寫入時用中文欄名對應即可

### 16_流量事件 實際欄位（8 欄）

```
時間 | userId | eventType | mode | subMode | source | device | sessionId
```

→ 只需新增 eventType 值（GIFT_CODE_ATTEMPT 等），**不需要改欄位**

---

## 二、需要新增的分頁（3 張）

現有 20 張中無任何會員、方案碼或異動紀錄分頁，全部需要新增。

### 21_會員資料

| 欄位 | 說明 |
|------|------|
| userId | 匿名識別碼（localStorage 產生） |
| planType | free / student / basic / pro |
| planEndAt | 方案到期日（ISO 8601） |
| bonusBalance | 贈送工坊剩餘次數（整數） |
| lastSeenAt | 最後活躍時間 |
| createdAt | 首次建立時間 |
| lastUsageDate | 上次使用日期（台灣時間 YYYY-MM-DD），用於判斷是否需要歸零每日用量 |
| dailyQuickUsed | 當日快速模式已用次數 |
| dailyJourneyUsed | 當日完整旅程已用次數 |
| dailyWorkshopUsed | 當日工坊已用次數 |

### 22_贈送額度碼

| 欄位 | 說明 |
|------|------|
| code | 方案碼（高熵，如 HAPPY-X7K9-P2QA） |
| type | gift（單次加值）/ student（學員方案） |
| value | 贈送工坊次數（type=gift 用） |
| planType | student（type=student 用） |
| planDays | 有效天數（type=student 用） |
| dailyQuickLimit | 每日快速模式上限 |
| dailyJourneyLimit | 每日完整旅程上限 |
| dailyWorkshopLimit | 每日工坊上限 |
| expiresAt | 方案碼本身到期日 |
| maxRedemptions | 最多兌換人數 |
| redeemedCount | 已兌換人數 |
| enabled | TRUE / FALSE |
| note | 備註（班級名稱、客戶名等） |
| createdAt | 建立時間 |

### 23_額度異動紀錄

| 欄位 | 說明 |
|------|------|
| 時間 | 異動時間（ISO 8601） |
| userId | 異動對象 |
| action | DAILY_QUICK / DAILY_JOURNEY / DAILY_WORKSHOP / BONUS_USED / REDEEM_GIFT / ACTIVATE_STUDENT / ADMIN_ADJUST |
| quotaType | quick / journey / workshop / bonus |
| amount | 扣除量（正數扣、負數補） |
| balanceBefore | 異動前餘額 |
| balanceAfter | 異動後餘額 |
| code | 來源方案碼（若有） |
| reason | 說明 |

---

## 三、16_流量事件 新增 eventType 值

以下 eventType 新值寫入現有 16_流量事件，不需要改欄位：

```
GIFT_CODE_ATTEMPT     — 使用者嘗試兌換方案碼
GIFT_CODE_SUCCESS     — 兌換成功
GIFT_CODE_FAILED      — 兌換失敗（過期/已用/不存在）
BONUS_QUOTA_USED      — 使用贈送額度生成
STUDENT_PLAN_ACTIVATED — 學員方案啟用
QUOTA_EXHAUSTED       — 當日額度用完
```

---

## 四、每日額度追蹤方式

不新增每日額度分頁，改用以下機制：

- **前端 localStorage**：即時顯示剩餘次數，台灣時間 00:00 重置
- **GAS `23_額度異動紀錄`**：每次生成扣除時寫一筆，可重建每日使用量
- **`17_每日統計`**：維持現有聚合統計欄位，不做用戶級別追蹤

---

## 五、既有欄位不相容修正

Gate 3A markup 失敗的原因已確認：

| 欄位 | 本地 Code.gs 名稱 | 線上 v2 實際名稱 |
|------|------|------|
| 時間戳記 | timestamp | 時間 |
| 使用者代碼 | userId | 使用者代碼（01_生成紀錄）/ userId（16_流量事件） |

→ GAS 函式日後寫入 `01_生成紀錄` 時必須用中文欄名
→ `16_流量事件` 的 timestamp 欄實際叫「時間」

---

## 六、Gate 3 結論

- 現有 20 張分頁**全部保留**，不改現有欄位
- 新增 3 張分頁：21_會員資料、22_贈送額度碼、23_額度異動紀錄
- 額度事件寫入現有 16_流量事件（新增 eventType 值）
- 本文件通過 x 審核後才進入 Gate 4（GAS 函式設計）
