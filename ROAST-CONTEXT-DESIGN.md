# 嗆聲模式三層架構設計文件

版本：v3（2026-06-24）

---

## 架構總覽

```
對象（targetKey）
  └─ 情境（situationKey）
       └─ 四類內容
            ├─ truth      真正氣的是什麼
            ├─ analogy    幽默比喻
            ├─ honest     不敢講的真心話
            └─ boundary   現實界線句
```

**fallback 規則**
- 情境命中 → 使用 `situations[sk]` 池
- 未命中 → 使用同對象 `general` 池，general.truth 帶入 `{input}`（使用者原句最多 20 字）
- 嚴禁跨對象借詞庫

**禁止捏造**
- 次數：五次、很多次、不知道幾次
- 頻率：對使用者行為的每天、每次斷言
- 時間：很久、這麼久
- 未提及的動作（叫了、催了）若使用者未提即不可假設

---

## 對象清單

| 中文標籤 | targetKey | 情境數 |
|---------|-----------|------|
| 老闆/主管 | boss | 2（overtime, blame） |
| 客戶 | client | 2（revision, rush） |
| 同事 | coworker | 2（credit, push_blame） |
| 孩子 | child | 7（lateSleep, homework, procrastinate, picky, talkBack, screen, messyRoom） |
| 爸媽/長輩 | parents | 3（marriage, compare, interfere） |
| 兄弟姊妹 | sibling | 2（care, money） |
| 另一半 | partner | 2（misunderstand, household） |
| 朋友 | friend | 2（cancel, gossip） |
| 其他 | other | 0（pure general） |

---

## GA4 / GAS 追蹤欄位

每次嗆聲 GENERATE 事件傳送：
```json
{
  "mode": "roast",
  "targetCategory": "child",
  "situationCategory": "lateSleep",
  "matchType": "specific"
}
```

matchType 值：
- `"specific"` — 關鍵字命中情境
- `"general"` — 未命中，使用同對象 general

不得傳入 GA4 的欄位：
- 使用者原句（input）不進 GA4
- 不建立完整原句排行榜

---

## 測試案例（30 次生成驗收）

### 測試協議

1. 開啟 PWA，選擇嗆聲模式
2. 選擇對象 chip
3. 輸入測試句
4. 點生成，確認四個 block 內容
5. 連續再生成 30 次，確認輪換（不重複相鄰）

pass 條件：
- zero 跨對象詞（孩子的 block 不出現職場詞，老闆的 block 不出現家人詞）
- specific matchType 時四個 block 全來自該情境池
- general matchType 時 truth 含使用者輸入關鍵字（{input} 已替換）
- boundary 無捏造次數或時間

---

### 案例 1：孩子 × 賴床

| 欄位 | 值 |
|------|----|
| 對象 chip | 孩子 |
| 輸入 | 孩子賴床 |
| 預期 targetKey | child |
| 預期 situationKey | lateSleep |
| 預期 matchType | specific |

關鍵詞觸發：`賴床`

驗收重點：
- truth 不含「每天」「不知道幾次」「叫了這麼久」
- truth 應為：「這個早上像在和被窩拔河。」等三選一
- boundary 不含「叫你有個次數」
- 不出現職場語境詞（加班、改稿、老闆等）

---

### 案例 2：孩子 × 不寫作業

| 欄位 | 值 |
|------|----|
| 對象 chip | 孩子 |
| 輸入 | 孩子不寫作業 |
| 預期 situationKey | homework |
| 預期 matchType | specific |

驗收重點：
- analogy 為親子幽默比喻（澆樹等），不出現職場比喻

---

### 案例 3：爸媽 × 催婚

| 欄位 | 值 |
|------|----|
| 對象 chip | 爸媽/長輩 |
| 輸入 | 爸媽一直催我結婚 |
| 預期 situationKey | marriage |
| 預期 matchType | specific |

驗收重點：
- truth 不含「五次」「每次催」
- analogy 應為比賽/限時特賣/循環歌曲 三選一
- 不出現職場語境或孩子教養語境

---

### 案例 4：兄弟姊妹 × 照顧

| 欄位 | 值 |
|------|----|
| 對象 chip | 兄弟姊妹 |
| 輸入 | 照顧爸媽都是我在做，弟弟完全不管 |
| 預期 situationKey | care |
| 預期 matchType | specific |

驗收重點：
- truth 談手足責任分配，不談職場
- boundary 具體可執行（坐下來分工等）

---

### 案例 5：客戶 × 改稿

| 欄位 | 值 |
|------|----|
| 對象 chip | 客戶 |
| 輸入 | 客戶一直叫我改稿 |
| 預期 situationKey | revision |
| 預期 matchType | specific |

驗收重點：
- honest 不含「改了很多次」→ 應為「一直在改」
- 不出現親子語境詞

---

### 案例 6：朋友 × 放鳥

| 欄位 | 值 |
|------|----|
| 對象 chip | 朋友 |
| 輸入 | 朋友說好要來又臨時取消 |
| 預期 situationKey | cancel |
| 預期 matchType | specific |

驗收重點：
- truth 談友誼期待落差，不談職場或親子
- boundary 具體（「早點說」等）

---

### 案例 7：孩子 × 沉迷3C

| 欄位 | 值 |
|------|----|
| 對象 chip | 孩子 |
| 輸入 | 孩子一直玩手機 |
| 預期 situationKey | screen |
| 預期 matchType | specific |

驗收重點：
- analogy 不含「五分鐘」→ 應為「一下子」

---

### 案例 8：孩子 × 拖延

| 欄位 | 值 |
|------|----|
| 對象 chip | 孩子 |
| 輸入 | 孩子做什麼事都拖拖拉拉 |
| 預期 situationKey | procrastinate |
| 預期 matchType | specific |

---

### 案例 9：孩子 × 挑食

| 欄位 | 值 |
|------|----|
| 對象 chip | 孩子 |
| 輸入 | 孩子很挑食 |
| 預期 situationKey | picky |
| 預期 matchType | specific |

驗收重點：
- analogy 不含「每次都不一樣」→ 應為「一直不固定」

---

### 案例 10：老闆 × general（未命中情境）

| 欄位 | 值 |
|------|----|
| 對象 chip | 老闆/主管 |
| 輸入 | 老闆態度很差 |
| 預期 situationKey | null |
| 預期 matchType | general |

驗收重點：
- truth 含 {input} 替換後的原句（「老闆態度很差」最多 20 字）
- 不出現「很久沒被看見」等斷言（已改為「不記得上次...是什麼時候」）

---

### 案例 11：孩子 × 頂嘴

| 欄位 | 值 |
|------|----|
| 對象 chip | 孩子 |
| 輸入 | 孩子回嘴 |
| 預期 situationKey | talkBack |
| 預期 matchType | specific |

---

### 案例 12：孩子 × 不收玩具

| 欄位 | 值 |
|------|----|
| 對象 chip | 孩子 |
| 輸入 | 孩子玩具不收 |
| 預期 situationKey | messyRoom |
| 預期 matchType | specific |

---

## 零汙染驗收標準

| 詞語類型 | 出現位置 | 狀態 |
|---------|---------|------|
| 次數：五次/很多次/N次 | 所有 specific/general | 已清除 |
| 頻率：每天（對使用者行為斷言） | truth/honest | 已清除 |
| 頻率：每次（對使用者行為斷言） | truth/honest | 已清除 |
| 時間：很久/這麼久 | truth/honest | 已清除 |
| 叫了/催了（未提及動作） | truth/analogy | 已清除 |
| {input} 未替換殘留 | 輸出文字 | 由 fill() 處理 |
| {target} 未替換殘留 | 輸出文字 | 由 fill() 處理 |

---

## 修改檔案記錄

| 檔案 | 變更內容 |
|------|---------|
| `app.js` | TARGET_ROAST_DB 三層架構、genRoast() 新欄位、logGenerateEvent() helper |
| `gas/Code.gs` | RECORD_HEADERS 加 3 欄；saveLogEvent 加 3 欄；16_流量事件 header 更新 |
