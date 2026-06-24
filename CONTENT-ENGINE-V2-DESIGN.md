# 《笑鼠人了！》內容引擎 V2 架構設計

版本：v1.3（2026-06-25）｜狀態：待 Angel-x 審核，尚未寫入程式

---

## 一、分類模型

每次輸入整理以下欄位，所有欄位允許 `unknown`。

### 1.1 角色欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `speakerRole` | string | 說話者身分（parent / employee / partner / sibling / friend / self / unknown） |
| `targetRole` | string | 被嗆對象（child / boss / partner / grandparent / coworker / self / unknown） |
| `subjectRole` | string \| null | 第三方角色（可空）。三方衝突才填，例如爺奶衝突中的孩子 |
| `subjectKey` | string | 衝突核心事件物件（screen / homework / chores / rules / task / schedule / food / money / unknown）。注意：`chores` 為家事分工衝突；`rules` 為管教規則或跨代規則衝突，兩者不可混用 |
| `interactionType` | string | `directed`（有明確對象）或 `self`（自我嗆聲，無外部對象） |

### 1.2 場域與情境欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `domain` | string | parenting / workplace / relationship / family / self / unknown |
| `situationKey` | string | 具體情境，例：screen / homework / lateSleep / blame / household / cross_generation_rules / self_procrastinate / unknown |
| `subSituationKey` | string \| null | 子情境（可空）。見 1.4 子情境清單 |

### 1.3 衝突與需求欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `primaryConflictType` | string | 主要衝突本質（見 1.5 值域） |
| `secondaryConflictTypes` | string[] | 次要衝突本質（可空陣列） |
| `primaryNeedType` | string | 說話者最主要的需要（見 1.6 值域） |
| `secondaryNeedTypes` | string[] | 次要需要（可空陣列） |
| `primaryOutcomeType` | string | 期望改變的方向（見 1.7 值域） |

### 1.4 子情境清單

**screen 子情境（目前支援的六種）**

| subSituationKey | 說明 | 觸發關鍵詞範例 |
|-----------------|------|----------------|
| `screen_time` | 使用時間爭執 | 一直玩、不肯收、還沒到時間、說好了但沒收 |
| `screen_content` | 內容問題 | 看什麼、玩什麼遊戲、不適合的內容 |
| `screen_at_bedtime` | 作息影響（睡前） | 睡覺、睡太晚、睡前還在玩 |
| `screen_at_meals` | 餐桌使用 | 吃飯還在看、邊吃邊玩 |
| `screen_hidden_use` | 偷偷使用 | 偷偷、躲起來、被發現、不讓人看到 |
| `screen_general` | 無法識別子情境 | 無關鍵詞命中或輸入過短 |

> 使用者未提供足夠資訊時，`subSituationKey = "screen_general"`，回傳 screen_general 詞庫，**不假設是關機時間問題**。

**其他情境子鍵**（待後續定義）：homework_block / homework_forgot / lateSleep_alarm / lateSleep_night_owl 等

### evidenceTokens 標準化格式（requiredEvidence 實作合約）

`requiredEvidence` 一律使用結構化格式，不得用人話描述：

```json
{
  "mode": "any",
  "tokens": ["token_name", ...]
}
```

- `mode: "any"`：token 陣列中任一命中即觸發
- `mode: "all"`：全部 token 都要命中才觸發
- `tokens: []`：無強制（一般詞庫，classificationConfidence 不影響觸發）

**標準 evidenceToken 清單**

| token | 觸發條件（關鍵詞或描述出現即命中） |
|-------|-------------------------------------|
| `screen_time_explicit` | 「時間」「不肯收」「說好了」「繼續玩」「幾點」 |
| `stop_resistance_explicit` | 阻力或拒絕描述（「不要」「就是不收」「賴著不動」） |
| `rules_conflict_explicit` | 兩套規則衝突（「我說不行，爺奶說可以」「規則不同」「爺奶說可以」） |
| `appeal_to_other_explicit` | 孩子找第三方轉圜（「去找爺奶」「問爸爸說可以」） |
| `chores_mention_explicit` | 家事、分工不均（「家事都是我做」「不平均」「我都在做」） |
| `procrastinate_mention_explicit` | 拖延描述（「一直拖」「說等一下」「不知道怎麼開始」「拖了好幾天」） |

> 新 token 命名規則：`{事件}_{行為}_explicit`。
> 未命中任何 token 且 `tokens` 非空 → `classificationConfidence = low` → 走 general 詞庫，並在輸出後附 `clarificationOptions[]`（非阻塞）。

### 1.5 衝突本質值域（primaryConflictType）

| 值 | 說明 |
|----|------|
| `boundary_unclear` | 界線未說清楚（誰可以做什麼） |
| `habit_loop` | 習慣模式難以中斷 |
| `expectation_gap` | 雙方預期不一致 |
| `role_confusion` | 角色不清楚（誰說了算） |
| `responsibility_diffuse` | 責任歸屬模糊 |
| `power_imbalance` | 權力不對等（老闆/長輩場景） |
| `avoidance` | 回避行為（包含自我拖延） |
| `unknown` | 無法識別 |

> `conflictType` 只在後台分類使用，不顯示給使用者。

### 1.6 說話者需要值域（primaryNeedType）

boundary_setting / acknowledgement / collaboration / rest / choice / dignity / safety / unknown

### 1.7 期望方向值域（primaryOutcomeType）

transition / clarify / reset / redistribute / commit / unknown

### 1.8 信心與來源欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `classificationConfidence` | `low` \| `medium` \| `high` \| `unknown` | 分類可靠度（low=多個可能；high=關鍵詞明確命中） |
| `classificationSource` | string[] | 分類依據來源，可複選：`user_input`（輸入文字）/ `target_chip`（對象選項）/ `inferred`（推斷） |

### 1.9 幽默層級

| 欄位 | 值 | 說明 |
|------|----|------|
| `humorLevel` | `standard` | 一般情境，幽默目標 ≥ 4.0 |
| | `gentle` | 高強度情境（power_imbalance / 長輩衝突），尊嚴優先，幽默目標 ≥ 3.3；不強迫達到 4.0 |
| | `self_directed` | 自我嗆聲（interactionType=self），自嘲為主，幽默目標 ≥ 4.0 |

### 1.10 分類優先順序

```
1. 關鍵詞命中 situationKey → confidence = high，matchType = specific
2. 命中 situationKey 但 subSituationKey 不確定 → confidence = medium，subSituationKey = null
3. 無法命中 situationKey，但 primaryConflictType 可識別 → confidence = low，matchType = conflict
4. 以上皆否 → matchType = general，帶入原句最多 20 字（不記錄全句）
```

### 1.11 禁止捏造（所有層級強制）

不得從使用者輸入補出：
- 次數（幾次、很多次、N 次）
- 頻率（每天、每次）的斷言
- 時間長度（很久、已經多久）
- 未提及的動作（叫了、催了、搶了、偷偷）
- 動機（因為懶、因為不在乎）
- 身份細節（說好幾個字就能判斷的指稱）

---

## 二、三層生成

### 第一層：Specific（高頻精準情境）

- 觸發條件：關鍵字命中 `situationKey`（信心 medium 或 high）
- 詞庫來源：`situations[situationKey]`，若有 `subSituationKey` 則進子詞庫
- 世界選擇：從 `availableWorlds` 輪選，不連續重複
- 每條模板含 `requiredEvidence[]`，缺少任一證據不得使用該模板

### 第二層：Conflict（依衝突本質生成）

- 觸發條件：無法命中 situationKey，但 `primaryConflictType ≠ unknown`
- 詞庫來源：`conflicts[primaryConflictType]`
- 語氣要求：**不得使用「這件事最常見的狀況是」**，改用不確定語氣，例如：
  - 「目前還不確定是哪種情況——可以選一個比較接近的嗎？」
  - 「這件事有幾種可能，你覺得哪個比較像？」
- truth 帶入關鍵詞（非原句），不超過 10 字

### 第三層：General（安全 Fallback）

- 觸發條件：situationKey = unknown 且 `primaryConflictType = unknown`
- 詞庫來源：先查 `general[targetRole]`；若 targetRole 無對應詞庫 → fallback 至 `general.unknown`
- 規則：truth 帶入使用者原句關鍵詞（最多 10 字，不保存完整原句），不另行推斷原因
- **輸出順序（強制）**：先輸出幽默結果，再於結果後附加 `clarificationOptions[]`（非阻塞）
- 不確定語氣在 clarificationOptions 中呈現，不得在輸出前以問卷擋住生成

---

## 三、共用輸出結構

所有層級輸出相同欄位（部分允許簡化）。

| 欄位 | 說明 | 不可省略 |
|------|------|----------|
| `truth` | 真正氣的是什麼（共同僵局笑點優先，不指向單一方） | ✅ |
| `analogy` | 情境幽默比喻（依 comicWorld） | ✅ |
| `honest` | 對對方說的真心話（interactionType=self 時對自己） | ✅ |
| `boundary` | 可執行的現實界線，不羞辱 | ✅ |
| `comicExit` | 笑著下台句（依 comicWorld，必出現，禁止自我羞辱或撤回界線） | ✅ |
| `nextAction` | 今天一個入口（提供選擇，不診斷原因，不命令） | ✅ |
| `resolutionWish` | 唬爛虎接手的解法願景 | 可簡化 |
| `callback` | 歌曲與後續可回扣的笑點 | 可簡化 |
| `comicWorld` | 本次選用的世界（寫入 flow.context，全流程共用） | ✅ |
| `interactionType` | directed / self（self 時無外部對象，comicExit 給自己台階） | ✅ |
| `clarificationOptions` | 分類信心低時，在結果後附加的選項（非阻塞） | 選填 |

### clarificationOptions 格式（非阻塞，永遠在結果後）

```json
{
  "trigger": "classificationConfidence=low",
  "position": "after_output",
  "options": [
    { "label": "時間沒說好", "maps_to": "screen_time" },
    { "label": "說好了但沒守", "maps_to": "screen_time" },
    { "label": "看了不該看的", "maps_to": "screen_content" }
  ]
}
```

> **Quick Mode 強制規則**：任何情況都必須先輸出完整幽默結果，`clarificationOptions` 附加在結果之後。不得在生成前先顯示問題或選單阻塞輸出。

---

## 四、喜劇與歌曲模組化

### 問題：舊做法

每個情境重寫完整 songA／songB，造成重複骨架、與情境解耦、維護困難。

### V2 做法：模板化歌曲引擎

```
情境專屬 Hook（固定 4 行）
＋ comedyDevice 標記（這 4 行用的笑法）
＋ callbackVariant 標記（哪個詞可在唬爛虎/劇本回收）
＋ comicWorld 段落骨架（verse/bridge 用 {placeholder}，跨情境重用）
＋ truth／comicExit／callback 填入對應詞
＋ 語氣套層（小天鼠：快速銳利；唬爛虎：誇大正經）
```

### Hook 格式（固定 4 行）

```json
{
  "hook": ["第一行", "第二行", "第三行", "第四行"],
  "comedyDevice": "reversal | self_deprecation | absurdity | irony | shared_deadlock",
  "callbackVariant": "哪一個關鍵詞或意象可以在唬爛虎/劇本再出現"
}
```

- `reversal`：預期被打破（誰有問題的判斷反轉）
- `self_deprecation`：說話者也在笑自己
- `absurdity`：把小事講成荒謬大事
- `irony`：表面一回事，實際另一回事
- `shared_deadlock`：笑的是雙方一起卡住的場面

### 歌曲幽默規範（V2 強制七條）

| # | 規範 | 說明 |
|---|------|------|
| 1 | **兩個真正笑點** | 每首至少兩個笑點，押韻和單純比喻不計入 |
| 2 | **三段結構** | 鋪陳 → 荒謬轉折 → callback 回收，三段情緒必須不同 |
| 3 | **一處自我解嘲** | 說話者也有台階，不全押在對方 |
| 4 | **禁止指令分行** | 不得把「說清楚、幾點收、先做哪科」等教養命令排成歌詞 |
| 5 | **Hook 去名仍記** | Hook 4 行去掉情境名稱（棒球/手機）後仍可唱可截圖 |
| 6 | **A/B 視角真的不同** | 不能是同一解法換比喻；需站在不同位置看同一事件 |
| 7 | **至少回收兩項** | truth／comicExit／callback 至少兩項在歌詞中出現 |

### W2 棒球歌曲現況

> ⚠️ **W2 Song A/B 標記為 provisional（暫用）**
>
> `21de62b` 工程驗收通過，但幽默約 3.3/5：
> - Song A 只有「教練負責遞水」一個明顯笑點
> - Song B「等待人數：兩名」有梗，其餘偏流程說明
> - 缺少意外轉折、自我解嘲與結尾 callback 回收
>
> 不再單獨修 app.js。待 V2 模組化歌曲引擎建立後，依本節幽默規範統一重寫。

---

### 角色笑法正式分工（v1.4 追加，取代「混用所有笑法」設計）

#### 小天鼠

| 項目 | 值 |
|------|----|
| primaryDevice | `self_deprecation` |
| secondaryDevice | `irony` / `contrast` |

**固定六步結構**

```
directRoast       → 直攻問題核心，至少一句對對方說得出口的放話
absurdObservation → 荒謬觀察（笑的是場面，不是指責某方）
honestLine        → 真心話（不敢說的那句）
boundary          → 可執行的現實界線
selfOwn           → 自我補刀（說話者自己也在場面裡）
comicExit         → 笑著收麥退場
```

**強制規則**
- 前面要敢嗆，不能像心理師
- 至少一句可直接對對方說的放話（directRoast）
- selfOwn 最後出現，為雙方留台階
- selfOwn ≠ 自我羞辱，≠ 撤回前面的界線

**禁止標記**

| 標記 | 說明 |
|------|------|
| `therapyTone` | 像在做諮商，沒有嗆聲 |
| `excessiveSoftening` | 說話者一直在幫對方解釋 |
| `selfHumiliation` | 自我貶低過頭，撤回或軟化界線 |
| `withdrawBoundary` | 嗆完又道歉或收回說清楚的要求 |

---

#### 唬爛虎

| 項目 | 值 |
|------|----|
| primaryDevice | `exaggeration` |
| secondaryDevice | `absurdity` / `contrast` |

**固定六步結構**

```
smallWish   → 從日常小事出發（今天只需要…）
scaleUp1    → 第一級放大（這件事的意義其實…）
scaleUp2    → 第二級放大（更遠一點說…）
scaleUp3    → 第三級放大（史詩 / 宇宙 / 國際轉播）
snapBack    → 突然收回（所以，先…）
callback    → 用誇飾意象落回具體小步驟
```

**強制規則**
- 誇飾必須明顯是玩笑，不可捏造可信的次數或事實
- 至少三級升級（scaleUp1 → scaleUp2 → scaleUp3）
- snapBack 必須有反差落差（規模越大，落點越小，越好笑）
- callback 把誇飾意象（退休的鉛筆、宣布獨立的垃圾桶）回收進結尾

**禁止標記**

| 標記 | 說明 |
|------|------|
| `therapyTone` | 說教氣息取代誇飾 |
| `motivationalCliche` | 「你做得到」「勇敢面對」等成功學語氣 |
| `emptyEncouragement` | 沒有笑點的正向打氣 |
| `fakeFacts` | 捏造可信數字（五次、三天、每週）混入誇飾 |

---

### 角色共同笑點橋梁

| 橋梁笑點 | 小天鼠方向 | 唬爛虎方向 |
|---------|----------|----------|
| `contrast` | 嘴上嗆很大，最後發現自己演最大 | 場面吹到宇宙，最後只是先做第一步 |
| `callback` | selfOwn 的意象在 comicExit 再出現 | scaleUp3 的誇飾道具在 snapBack 回收 |

### Song A / Song B 定式

| | Song A（小天鼠自我解嘲） | Song B（唬爛虎誇飾情境劇） |
|-|--------------------------|----------------------------|
| 至少 | 3 個 laugh beat | 3 級誇飾 |
| 必含 | 1 次自我補刀 | 規模逐段增加 |
| 最多 | 1 段行動提示 | — |
| 結尾 | 笑著收麥（說話者自己退場） | 巨大反差落回原始小事 |
| 禁止 | 只嗆對方、無自嘲 | 成功學主題曲 |

### 誇飾 vs 捏造 界線（強制）

| 允許（明顯是玩笑） | 禁止（混入可信細節） |
|--------------------|---------------------|
| 鉛筆申請退休 | 叫了五次 |
| 垃圾桶宣布獨立 | 拖了三天 |
| 路由器等到長白頭髮 | 講了三輪 |
| 一題作業出動國際轉播車 | 每天都這樣 |

> 判斷標準：讀者一眼看出是誇飾比喻 → 允許。讀者可能信以為真的具體數字 → 禁止。

---

## 五、五個跨領域黃金案例

> 純文字樣本，不寫入程式。
> 每案提供：分類結果（新 schema）、5 條嗆聲核心句、2 組完整流程（含 requiredEvidence）、fallback、幽默自評、不捏造檢查。

---

### 案例 A：孩子沉迷 3C（子情境：時間爭執）

#### 分類結果

| 欄位 | 值 |
|------|----|
| speakerRole | parent |
| targetRole | child |
| subjectRole | null |
| subjectKey | screen |
| interactionType | directed |
| domain | parenting |
| situationKey | screen |
| subSituationKey | screen_time |
| primaryConflictType | boundary_unclear |
| secondaryConflictTypes | [habit_loop] |
| primaryNeedType | boundary_setting |
| secondaryNeedTypes | [] |
| primaryOutcomeType | transition |
| classificationConfidence | high（關鍵詞明確命中） |
| classificationSource | [user_input, target_chip] |
| humorLevel | standard |
| 建議 comicWorld | W_播報台 / W1 廢話文學 |

> 其他子情境需有對應 `requiredEvidence` 才能啟用：
> - `screen_at_meals`：需使用者提到「吃飯」「餐桌」才可用餐桌相關 analogy
> - `screen_hidden_use`：需提到「偷偷」「被發現」才可用隱藏使用相關 analogy
> - 未提供足夠關鍵詞時，一律回傳 `screen_general` 詞庫，不主動假設子情境

#### 5 條嗆聲核心句

1. 孩子和手機之間的默契，目前比任何一科作業都穩定。
2. 螢幕藍光很忠實，沒有人說幾點收，它就幾點留。
3. 手機掌握了最高發言權，使用結束的條件目前還在協商中。
4. 孩子找到了一件做起來最不費力的事——這件事剛好叫做「繼續往下滑」。
5. 這個現場最不急的是手機——它沒有功課、沒有睡覺時間，就在這裡等你們說幾點。

#### 流程 A：W_播報台

**requiredEvidence**：`{ mode: "any", tokens: ["screen_time_explicit", "stop_resistance_explicit"] }`

- **analogy**：「今天的直播間開播了，主播（孩子）目前沒有掛台計畫，頻道的收播時間還沒出來。」
- **honest**：「我不是要搶走手機，我是要說清楚幾點到幾點是你的時間。」
- **boundary**：「說好了時間，我不催；沒說，我們就一起在這裡等。」
- **comicExit**：「我先退出直播間——等主播宣布今天的收播時間。」
- **nextAction**：「今天幾點收，你說一個我聽著。」
- **song hook A（播報台）**：
  ```
  螢幕今天沒有功課
  也沒有睡覺時間
  它只有一個問題沒解決：
  你幾點告訴它今天下線
  ```
  comedyDevice: `reversal`（我們以為手機是問題，反轉成手機在等我們）
  callbackVariant: 「下線時間」→唬爛虎可回收「打者宣布收播」

#### 流程 B：W1 廢話文學

**requiredEvidence**：`{ mode: "any", tokens: [] }` — 無強制，可用於 `screen_general` 一般詞庫。

- **analogy**：「手機是一份很有吸引力的文件，目前的閱讀進度是：無限捲動中。」
- **honest**：「你喜歡玩手機，我知道。我要說的是結束時間，不是說你不對。」
- **boundary**：「約定時間是一件事，說到做到是另一件事——兩件事都是今天的事。」
- **comicExit**：「無限捲動委員會今日休會，下次開播時間待本人宣布。」
- **nextAction**：「今天幾點收，說一個我就不再催了。」
- **song hook B（廢話文學）**：
  ```
  本文件說明如下
  第一點，手機不催你
  第二點，時間不等你
  第三點，幾點收——你說了算
  ```
  comedyDevice: `irony`（官方公文格式裝嚴肅，「手機不催你」反諷大人催得比手機多）
  callbackVariant: 「本文件」→唬爛虎可回收「今日文件正式歸檔」

#### Fallback 範例

> 輸入：「孩子一直玩手機」（無進一步細節）

「關於孩子和手機這件事，目前還不清楚是哪種情況——可以先選一個比較接近的嗎？是時間沒說好、說好了但沒守、還是根本還沒有約定？不同入口，說法不一樣。」

#### 幽默自評（依 humorLevel = standard，目標 ≥ 4.0）

| 項目 | 分數 | 說明 |
|------|------|------|
| 情境相關性 | 4.5 | 子情境清楚，requiredEvidence 防止濫用 |
| 好笑程度 | 4.0 | Hook A 反轉有效；Hook B 自嘲到位 |
| 角色辨識度 | 4.2 | 親子視角清楚 |
| 流程銜接 | 4.0 | comicExit 和 nextAction 都能接唬爛虎 |
| 分享記憶點 | 3.8 | 「手機沒有功課」可截圖；「無限捲動委員會」可發 |

#### 不捏造檢查

- ✅ 未假設叫了幾次
- ✅ 未說「一直玩了多久」（「藍光很忠實」不含時間斷言）
- ✅ 未診斷原因（成癮、逃避）
- ✅ boundary 可執行
- ✅ `screen_hidden_use` 等子情境需 requiredEvidence，不自行觸發

---

### 案例 B：跨代教養規則衝突

#### 分類結果

| 欄位 | 值 |
|------|----|
| speakerRole | parent |
| targetRole | grandparent |
| subjectRole | child（第三方角色，三方衝突） |
| subjectKey | rules |
| interactionType | directed |
| domain | family |
| situationKey | cross_generation_rules |
| subSituationKey | null（尚未細分子情境） |
| primaryConflictType | role_confusion |
| secondaryConflictTypes | [expectation_gap] |
| primaryNeedType | acknowledgement |
| secondaryNeedTypes | [boundary_setting] |
| primaryOutcomeType | clarify |
| classificationConfidence | medium（需確認是否有明確「規則不同」證據） |
| classificationSource | [user_input, target_chip] |
| humorLevel | gentle（三代關係涉及長輩，尊嚴優先） |
| 建議 comicWorld | W_合夥公司 / W1 廢話文學 |

#### 5 條嗆聲核心句

1. 這個家目前有兩套規則同時運作，孩子已經找到了其中比較容易執行的那套。
2. 孩子在同一件事上拿到了兩種不同的結果——這是一套挺高效的系統。
3. 爺奶的規則不是壞的，只是和你的規則不在同一個版本——孩子跑的是兩邊都支援的版本。
4. 這個「不行」說出口之後，不到多久就出現了另一個「沒關係」——孩子找到了那個中間地帶。
5. 孩子找到了申訴管道，而且目前還沒有被正式駁回的記錄。

> ⚠️ 嗆聲核心句 4、5 的使用需有 requiredEvidence：
> - 第 4 條：需使用者提到「我說不行，爺奶卻說可以」或類似具體情境
> - 第 5 條：需使用者提到孩子確實會去找爺奶轉圜
> - 兩條均不得在 general fallback 使用

#### 流程 A：W_合夥公司

**requiredEvidence**：`{ mode: "any", tokens: ["rules_conflict_explicit"] }`

- **analogy**：「這家公司有兩位主管，政策尚未對齊，員工已找到效率最高的那個窗口。」
- **honest**：「我不是說你們的方式不好——我是說我們需要先說好哪些事是一致的。」
- **boundary**：「說好了一件事，你們說什麼我也跟上；說不好，孩子就在縫隙裡找空間。」
- **comicExit**：「章程修訂版今天提出，等兩位董事確認後生效。」
- **nextAction**：「先定一件事：這件事由誰說算？說好了，三個人都省力。」
- **song hook A（合夥公司）**：
  ```
  公司章程有兩個版本
  員工選了字比較少的那份
  兩位董事都說對
  就差沒在同一張桌子說
  ```
  comedyDevice: `self_deprecation`（「兩位董事都說對」——說話者自己也是那個說對的其中一個）
  callbackVariant: 「對齊會議」→唬爛虎可回收「提案通過，效期即日起」

#### 流程 B：W1 廢話文學

**requiredEvidence**：`{ mode: "any", tokens: [] }` — 無強制，可用於 cross_generation_rules 一般詞庫。

- **analogy**：「這件事目前有兩份說明書，孩子收到的那份執行起來比較順手。」
- **honest**：「我知道你們是因為愛孩子——我說的不是愛，是哪些事需要我們一起守。」
- **boundary**：「說好了，孩子知道邊界在哪；沒說好，孩子就繼續試看看。」
- **comicExit**：「申訴管道今天暫時關閉維護——更新後通知。」
- **nextAction**：「先選一件事說好——就這一件，其他的慢慢來。」
- **song hook B（廢話文學）**：
  ```
  說明書有兩份
  孩子讀了比較薄的那本
  備注欄只有一行：
  這裡可以再試一次
  ```
  comedyDevice: `irony`（孩子版說明書自帶「再試一次」這個隱藏條款）
  callbackVariant: 「備注欄」→唬爛虎可回收「今日版本已更新，備注欄同步修訂」

#### Fallback 範例

> 輸入：「爺奶一直寵孩子，我說什麼都沒用」

「關於這件事，還不確定是哪種情況——可以先選一個比較接近的嗎？是孩子知道有兩套規則在切換、爺奶不知道你的規則、還是大家都知道但沒有說好怎麼統一？不同的入口，說法不一樣。」

#### 幽默自評（依 humorLevel = gentle，目標 ≥ 3.3）

| 項目 | 分數 | 說明 |
|------|------|------|
| 情境相關性 | 4.3 | 三方衝突分類清楚 |
| 好笑程度 | 3.5 | 「兩份說明書」「兩位董事都說對」有幽默感；gentle 層級 3.5 可接受 |
| 角色辨識度 | 4.2 | 對象是長輩，語氣給面子 |
| 流程銜接 | 3.8 | comicExit 輕量，不讓說話者帶怒出場 |
| 分享記憶點 | 3.7 | 「備注欄：這裡可以再試一次」有截圖潛力 |

#### 不捏造檢查

- ✅ 嗆聲 4、5 加 requiredEvidence，不在 general 使用
- ✅ 未說長輩動機（偏心、溺愛）
- ✅ 未說孩子「學壞了」
- ✅ boundary 是對話提案而非指控
- ✅ 語氣給長輩出口（「規則不同步」不等於「你做錯了」）

---

### 案例 C：被老闆不合理責罵

#### 分類結果

| 欄位 | 值 |
|------|----|
| speakerRole | employee |
| targetRole | boss |
| subjectRole | null |
| subjectKey | task |
| interactionType | directed |
| domain | workplace |
| situationKey | blame |
| subSituationKey | null |
| primaryConflictType | power_imbalance |
| secondaryConflictTypes | [expectation_gap] |
| primaryNeedType | dignity |
| secondaryNeedTypes | [acknowledgement] |
| primaryOutcomeType | reset |
| classificationConfidence | high |
| classificationSource | [user_input, target_chip] |
| humorLevel | gentle（power_imbalance 情境，尊嚴與安全優先，不強迫幽默達 4.0） |
| 建議 comicWorld | W_新聞記者會 / W_氣象播報 |

> 設計原則：高強度職場情境採溫和荒謬感，笑點服務尊嚴（讓說話者感到「我有說明稿」），不需要讓使用者大笑。

#### 5 條嗆聲核心句

1. 這份責罵裡有些細節和你知道的不一樣，但當下的氣場不適合更正。
2. 被這樣罵的時候，沉默是一種選擇——不是認同，是判斷這不是辯論的時機。
3. 你氣的不是被罵，是被說錯了——而且說錯的那些，還沒有機會說清楚。
4. 主管今天的情緒很明確，結論比細節先出來。
5. 你是當事人，但不是這件事裡唯一有待確認的那個。

#### 流程 A：W_新聞記者會

**requiredEvidence**：使用者提到「被罵」「說錯了」「不合理」中至少一項。

- **analogy**：「這場記者會比較特別——結論先宣布，提問環節目前暫停。」
- **honest**：「我聽到你的不滿。有些是我的責任，有些不是——我需要一個機會說清楚。」
- **boundary**：「我可以接受被提醒，不適合接受被否定事實。這個差別，我記住了。」
- **comicExit**：「記者會今天先散場——說明稿我會準備，時間由我方安排。」
- **nextAction**：「找一個情緒平穩的時間，把那件事說清楚——不是道歉，是還原。」
- **song hook A（記者會）**：
  ```
  記者會宣布結論前
  我確定我在同一個會議室
  結論出來後我看了一下
  好像我是唯一不知情的人
  ```
  comedyDevice: `absurdity`（你在場卻是最後知情的人，荒謬感不怒自有力量）
  callbackVariant: 「說明稿」→唬爛虎可回收「新聞稿已準備好，時機到了再發」

#### 流程 B：W_氣象播報

**requiredEvidence**：同上，或使用者用了「氣氛很差」「當時很難開口」等描述。

- **analogy**：「今天的職場氣象：局部責罵，能見度低，預估明天轉為可對話的天氣。」
- **honest**：「我把話聽完了。有一件事我需要說：有些部分我需要知道你指的是哪個細節。」
- **boundary**：「工作有問題我願意改；被說錯的事，我需要說清楚。兩件事我都在做。」
- **comicExit**：「今天的氣象預報到此結束——明天預計有機會看到能見度較高的對話天氣。」
- **nextAction**：「等情緒過了，找個時間還原那件事的前後。」
- **song hook B（氣象播報）**：
  ```
  今天局部責罵陣雨
  說明稿是我準備的
  氣象預報說明天轉晴
  說明稿我今天就備好了
  ```
  comedyDevice: `reversal`（天氣不能控制，但說明稿可以；意外反轉被罵者的主動性）
  callbackVariant: 「說明稿備好了」→唬爛虎可回收「新聞稿明天發布」

#### Fallback 範例

> 輸入：「老闆罵我罵得很難聽」（無其他細節）

「被這樣罵，很不好受。目前還不確定是什麼讓他那樣說，也不知道有沒有機會說清楚——可以先選一個入口：想先出一口氣，還是想想看怎麼還原那件事？」

#### 幽默自評（依 humorLevel = gentle，目標 ≥ 3.3）

| 項目 | 分數 | 說明 |
|------|------|------|
| 情境相關性 | 4.3 | power_imbalance 分類清楚 |
| 好笑程度 | 3.4 | 溫和荒謬，尊嚴在先；3.4 符合 gentle 標準 |
| 角色辨識度 | 4.5 | 員工視角清楚，不為老闆說話 |
| 流程銜接 | 4.0 | 說明稿 callback 貫穿全流程 |
| 分享記憶點 | 3.8 | 「說明稿我今天就備好了」有截圖潛力 |

#### 不捏造檢查

- ✅ 未說「老闆一直這樣」
- ✅ 未假設老闆動機（針對、嫉妒）
- ✅ boundary 是說得出口的話，不是法律建議
- ✅ comicExit 力道輕，不讓使用者帶怒出場
- ✅ humorLevel = gentle 不要求笑點分數達 4.0

---

### 案例 D：伴侶家事分工不均

#### 分類結果

| 欄位 | 值 |
|------|----|
| speakerRole | partner（任一方） |
| targetRole | partner |
| subjectRole | null |
| subjectKey | chores |
| interactionType | directed |
| domain | relationship |
| situationKey | household |
| subSituationKey | null |
| primaryConflictType | responsibility_diffuse |
| secondaryConflictTypes | [expectation_gap] |
| primaryNeedType | collaboration |
| secondaryNeedTypes | [acknowledgement] |
| primaryOutcomeType | redistribute |
| classificationConfidence | medium |
| classificationSource | [user_input, target_chip] |
| humorLevel | standard |
| 建議 comicWorld | W_合夥公司 / W_雙打球賽 |

#### 5 條嗆聲核心句

1. 家裡有一份工作清單，目前只有一個人看得見全部。
2. 家事的特點是：做了不一定被看見，沒做卻很難被忽略。
3. 有些事情你以為對方知道，對方以為你知道，兩個人都在等對方先說。
4. 這個家的分工有兩種制度同時在跑：協議制，和誰先受不了就做制。
5. 那份最重要的工作清單，目前存在某人腦子裡，沒有對外備份。

> ⚠️ 嗆聲核心句使用規則：
> - 第 4 條不得直接斷言「你們一直是誰先受不了就做」，需使用者有提到類似描述才可用

#### 流程 A：W_合夥公司

**requiredEvidence**：`{ mode: "any", tokens: ["chores_mention_explicit"] }`

- **analogy**：「這家公司有兩位合夥人，但可見的工作分配表只有一份——另一份在某人腦子裡，目前沒有對外開放。」
- **honest**：「我不是說你不做，我是說有些事我需要你說你看見了。」
- **boundary**：「說好誰負責哪些事，不是要你都做，是讓我們各自知道自己負責什麼。」
- **comicExit**：「合夥人大會今天召開，議題只有一個：把分工表從腦子裡搬出來。」
- **nextAction**：「今天列三件各自確認負責的事——不用全部，先三件。」
- **song hook A（合夥公司）**：
  ```
  合夥公司開了一陣子
  工作分配表只有一份
  另一份在某人腦子裡
  而且從不對外開放
  ```
  comedyDevice: `self_deprecation`（「從不對外開放」——說話者的腦內清單對枕邊人也是未公開的，雙方都有問題）
  callbackVariant: 「對外開放」→唬爛虎可回收「今日正式對外公開」

#### 流程 B：W_雙打球賽

**requiredEvidence**：同上，或使用者描述「說了但沒動」「我等他」等協調失敗情境。

- **analogy**：「雙打配對已上場，但目前球往左邊去，兩個人都往右看——球還沒人追。」
- **honest**：「我知道你有你的方式，我說的是我累了——不是你不好，是我需要你說你看見了。」
- **boundary**：「這幾件事，我需要你說『我來』——不是幫忙，是你的份。」
- **comicExit**：「雙打教練今天宣布：接下來這球，換你去追。」
- **nextAction**：「這週說好一件你負責跟完的事——不是幫忙，是你的。」
- **song hook B（雙打）**：
  ```
  雙打配對上場了
  這顆球往左邊去
  兩個人都往右看
  球還沒人去追
  ```
  comedyDevice: `shared_deadlock`（雙方都看錯方向，沒有資格單獨怪對方）
  callbackVariant: 「這球」→唬爛虎可回收「打者宣布追這顆球，比賽正式開始」

#### Fallback 範例

> 輸入：「另一半都不做家事」

「關於家事分工——還不確定是哪種情況，可以先選一個比較接近的嗎？是沒說好誰負責什麼、說了但沒有執行、還是各自認為對方應該主動？不同狀況，說法不一樣。」

#### 幽默自評（依 humorLevel = standard，目標 ≥ 4.0）

| 項目 | 分數 | 說明 |
|------|------|------|
| 情境相關性 | 4.3 | 責任分配衝突定義清楚 |
| 好笑程度 | 4.0 | 雙打兩人都往右看——共同僵局笑點到位 |
| 角色辨識度 | 4.0 | 任一方說話皆適用，非固定性別 |
| 流程銜接 | 4.2 | 分工表 callback 貫穿 |
| 分享記憶點 | 4.0 | 「從不對外開放」「球還沒人去追」可截圖 |

#### 不捏造檢查

- ✅ 未說「你從來不做」
- ✅ 未假設動機（懶、不在乎）
- ✅ 嗆聲 4 加使用條件，不在 general 自行斷言
- ✅ boundary 是可說出口的提案

---

### 案例 E：自己拖延

#### 分類結果

| 欄位 | 值 |
|------|----|
| speakerRole | self |
| targetRole | self |
| subjectRole | null |
| subjectKey | task |
| interactionType | self |
| domain | self |
| situationKey | self_procrastinate |
| subSituationKey | null |
| primaryConflictType | avoidance |
| secondaryConflictTypes | [] |
| primaryNeedType | choice |
| secondaryNeedTypes | [rest] |
| primaryOutcomeType | commit |
| classificationConfidence | high |
| classificationSource | [user_input] |
| humorLevel | self_directed |
| 建議 comicWorld | W1 廢話文學 / W_氣象播報 |

> 特殊說明：interactionType = self，沒有外部對象。
> - 小天鼠說的是使用者自己的情況
> - comicExit 給使用者自己一個台階，不是給另一個人
> - honest 是對自己說的真心話
> - boundary 是自己給自己的界線
> - 輸出 schema 與 directed 相同，只是 targetRole = self，honest/boundary/comicExit 對象改為自己

#### 5 條嗆聲核心句

1. 這件事還沒開始，腦子已經預演過開始的感覺——可惜預演不算動工。
2. 「等一下去做」已經說了幾個「等一下」——計次器目前沒有在走。
3. 卡住的感覺有幾種可能——其中一種是第一步的範圍比想像中可以更小。
4. 這件事很重要，這件事等一下再說——兩件事同時在腦子裡是可以共存的。
5. 待辦清單上有這件事，它沒有動，但它很有自知之明地待在那裡。

> ⚠️ 嗆聲核心句 2 含「已經說了幾個等一下」——需使用者提到「一直拖」「一直說等一下」才可用，fallback 不可直接套。

#### 流程 A：W1 廢話文學

**requiredEvidence**：`{ mode: "any", tokens: [] }` — 無強制，自我拖延情境 general 程度較高。

- **analogy**：「這份任務進入了準備狀態——就像辦好的健身卡，充滿希望，目前沒有進場。」
- **honest**：「不想做，或是不知道從哪裡開始——這兩件事都可以，先弄清楚是哪個。」
- **boundary**：「今天只需要開始——不需要做完，只需要開始。」
- **comicExit**：「拖延委員會今日宣布：休會時間為接下來的五分鐘，五分鐘後開始第一步。」
- **nextAction**：「第一步是什麼——就說這一步，不是說整件事。」
- **song hook A（廢話文學）**：
  ```
  任務說明讀完了
  各個角度都想過了
  第一步還在草稿
  但準備工作非常完整
  ```
  comedyDevice: `self_deprecation`（各種分析做完了什麼都沒動，說話者自己就是那個人）
  callbackVariant: 「準備工作非常完整」→唬爛虎可回收「正式執行階段，現在開始」

#### 流程 B：W_氣象播報

**requiredEvidence**：`{ mode: "any", tokens: ["procrastinate_mention_explicit"] }`

- **analogy**：「今天的個人天氣：拖延指數偏高，能見度低，預計在說出第一步後轉晴。」
- **honest**：「我知道這件事重要，不知道的是為什麼還沒開始——是累？卡在哪裡？還是不知道怎麼切入？」
- **boundary**：「今天不要求做完，只要求說出第一步——說了就算成立。」
- **comicExit**：「氣象播報員宣布：說出第一步之後，後面的預報自動更新。」
- **nextAction**：「第一步說出來——就這一步，後面再說。」
- **song hook B（氣象播報）**：
  ```
  今天拖延指數持續偏高
  觀測站已開始記錄
  預計在說出第一步後轉晴
  氣象局建議不用等晴天才出發
  ```
  comedyDevice: `self_deprecation`（持續觀測中、說話者自己就是那個數據）
  callbackVariant: 「氣象局建議」→唬爛虎可回收「科學數據支持：出發就是轉晴的開始」

#### Fallback 範例

> 輸入：「我一直在拖」（無任務細節）

「關於拖延——還不確定是哪種情況，可以先選一個比較接近的嗎？是任務太大不知道從哪裡切、累了需要先休息、還是說好要開始但沒說第一步是什麼？」

#### 幽默自評（依 humorLevel = self_directed，目標 ≥ 4.0）

| 項目 | 分數 | 說明 |
|------|------|------|
| 情境相關性 | 4.5 | interactionType=self，自嘲框架清楚 |
| 好笑程度 | 4.2 | 「準備工作非常完整」「觀測站已開始記錄」自嘲精準 |
| 角色辨識度 | 4.3 | 自我嗆聲模式清楚，沒有外部指責 |
| 流程銜接 | 4.0 | callback 都能進唬爛虎 |
| 分享記憶點 | 4.0 | 兩個 hook 都可截圖 |

#### 不捏造檢查

- ✅ 嗆聲 2 加使用條件，general 不自行套用
- ✅ 未診斷原因（懶散、沒自律）
- ✅ nextAction 是選擇入口，不是命令
- ✅ interactionType=self：comicExit 給自己台階，不自我羞辱，不撤回 boundary

---

## 六、統計欄位規劃

本階段只設計欄位，**不修改 GAS Sheet、不新增欄位、不 commit 程式**。

### 6.1 GA4 事件擴充（GENERATE 事件）

| 欄位名 | 值域 | 說明 |
|--------|------|------|
| `speakerRole` | parent / employee / partner / self / unknown | 說話者角色（正規化） |
| `targetRole` | child / boss / partner / grandparent / self / unknown | 對象角色（正規化） |
| `domain` | parenting / workplace / relationship / family / self / unknown | 場域 |
| `primaryConflictType` | 見 1.5 值域 | 主要衝突本質（後台分析用，不顯示給用戶） |
| `humorLevel` | standard / gentle / self_directed | 幽默層級 |
| `matchType` | specific / conflict / general | 命中層級（現有，確認沿用） |
| `classificationConfidence` | low / medium / high | 分類可靠度（供分析 fallback 比例） |

**GA4 隱私規則**：
- 不傳送 `normalizedUnknownToken`，不保存任何使用者輸入原句片段或 fallback 觸發文字
- 不傳送 `subSituationKey` 的具體值（僅傳是否命中 specific，用 `subSituationHit: boolean` 表示）
- `primaryConflictType` 只傳正規化分類值，不傳推斷過程或原始輸入片段

### 6.2 GAS 記錄表擴充

| 欄位名 | 說明 |
|--------|------|
| `speaker_role` | 說話者角色 |
| `target_role` | 對象角色 |
| `domain` | 場域 |
| `primary_conflict_type` | 衝突本質（後台分析用） |
| `humor_level` | 幽默層級 |
| `match_type` | specific / conflict / general |
| `classification_confidence` | 分類可靠度 |
| `interaction_type` | directed / self |

**GAS 隱私規則**：
- 不記錄 fallback 觸發的原句或關鍵詞片段
- `primary_conflict_type` 僅後台使用，不在任何前端介面顯示
- 任何可還原使用者輸入的欄位一律不記錄

---

## 七、架構決策定案（v1.3 全部確認）

| # | 議題 | 決策 |
|---|------|------|
| 1 | subSituationKey 觸發邏輯 | 純靠關鍵詞推斷，不增加前端 UI 選項；低信心走 general 詞庫 |
| 2 | cross_generation_rules 詞庫位置 | 放 **Batch 2**（親子與長輩），不在 Batch 1 孩子情境下 |
| 3 | interactionType=self 的 UI 差異 | 同 directed schema；UI 自動隱藏「對方」相關字樣，不新增欄位 |
| 4 | 歌曲模板引擎實作時程 | 列入 **R3**，五個 Batch 情境內容完成後統一實作 |
| 5 | humorLevel=gentle 通過門檻 | 3.3–3.6 可接受；**尊嚴/安全必須 ≥ 4.5**，不強迫達到 4.0 |

---

## 八、待辦（v1.3 後）

- [x] 角色笑法正式分工框架（v1.4 已寫入 Section 四）
- [x] 驗收樣本三組（Section 九）
- [ ] Case A Fallback 範例補 clarificationOptions 格式
- [ ] R3 歌曲模板引擎設計（待五 Batch 完成後）
- [ ] Batch 2：cross_generation_rules 詞庫完整展開

---

## 九、角色笑法驗收樣本（純文字，不寫入程式）

> 三個情境各一組，每組含小天鼠嗆聲 + Song A + 唬爛虎願景 + Song B + 笑點標記 + 角色互換測試。

---

### 情境 1：孩子不寫作業

#### 小天鼠 嗆聲

```
directRoast:
作業現在在桌上，它不急、它沒有功課壓力、它完全不在乎今晚幾點——
這個現場最從容的，就是那份作業本人。

absurdObservation:
這件事裡唯一沒有意見的，就是那份作業。
它不催、不發言、不焦慮，完美旁觀者。

honestLine:
我說的不是你這個人——我說的是這件事，它必須今晚完成。

boundary:
幾點開始，說一個數字，說完我不再催。

selfOwn:
說到這裡我才發現，我才是今晚說話最多的那個。
作業從頭到尾一個字沒說，卻是今晚最有存在感的人。

comicExit:
催促客服中心今日下班，本中心任務轉達完成，後續由當事人自行處理。
```

**笑點位置**
- `absurdObservation`：「作業是完美旁觀者」→ 共同僵局笑點（laugh beat 1）
- `selfOwn`：「我才是今晚說話最多的」→ 說話者自我補刀（laugh beat 2）
- `comicExit`：「催促客服中心今日下班」→ 荒謬官腔退場（laugh beat 3）

**不捏造檢查**
- ✅ 未說「叫了幾次」「作業擺了幾天」
- ✅ boundary 是說得出口的話，不含時間斷言
- ✅ selfOwn 自嘲，未撤回界線

---

#### Song A：小天鼠自我解嘲歌

```
Hook
我說了好多
你聽了多少
作業還在那
一個字沒有動

Verse 1
觀眾席分析師今晚上線了
觀察到的現象是作業不動如山
我說了建議
你記了幾點
現在分不清誰才是今晚的主角
                    ← laugh beat 1：說話者才是今晚最忙的

Bridge
說真的
今晚最勞累的那個
不是你
是旁邊那個一直說話的人
                    ← laugh beat 2：自我補刀

Hook

Outro（收麥）
好，觀眾席今天先散場
催促節目今晚暫停播出
下一集什麼時候出——
由作業的主人宣布
                    ← laugh beat 3：傳球，笑著收麥
```

**Song A 驗收**
- 笑點 ≥ 3：✅（共 3 個）
- 自我補刀 ≥ 1：✅（Bridge「旁邊那個一直說話的人」）
- 行動提示 ≤ 1：✅（Outro 只有「由作業的主人宣布」）
- 結尾笑著收麥：✅

---

#### 唬爛虎 願景

```
smallWish:
你現在要做的，只是今晚的一份作業。

scaleUp1:
不過話說回來，這份作業的完成，將成為今晚家庭歷史的重要一頁。

scaleUp2:
事實上，第一題的開始，就是整個學期最關鍵的轉折點。

scaleUp3:
更遠一點說，這一刻——你拿起筆的那一刻——是今晚全球直播的核心場景。
那支鉛筆，完成任務之後，已經在考慮申請退休了。

snapBack:
所以，先寫第一個字。

callback:
鉛筆先不用申請退休——第一個字寫下去，轉播車就可以收了。
```

**笑點位置**
- `scaleUp3`：「今晚全球直播」→ 誇飾第三級升天（laugh beat 1）
- `scaleUp3`：「鉛筆考慮申請退休」→ 擬人誇飾（laugh beat 2）
- `snapBack` + `callback`：「先寫第一個字」巨大反差落地（laugh beat 3）

**不捏造檢查**
- ✅ 「鉛筆申請退休」明顯玩笑，非可信事實
- ✅ 未含「五次」「三天」等具體數字

---

#### Song B：唬爛虎誇飾情境劇歌

```
Hook
今晚作業一題
明天整個年級
後年全校傳說
現在先動第一筆
                    ← 誇飾第一級：一題 → 年級

Verse 1
第一題是今晚的前哨站
前哨站打下，制高點就穩了
制高點穩了，整個學期的版圖就清楚了
                    ← 誇飾第二級：前哨站 → 制高點 → 版圖

Bridge
學者多年後研究今晚
就是這一頁作業本
就是這一支鉛筆
鉛筆後來申請退休
說它已完成本世紀最重要的一筆
                    ← 誇飾第三級：宇宙史詩 + 鉛筆退休 → laugh beat

Hook

Outro（反差落地）
但其實
就是第一個字
寫完，轉播車就可以收了
鉛筆先不用申請退休
                    ← 巨大反差，鉛筆 callback 回收
```

**Song B 驗收**
- 誇飾 ≥ 3 級：✅（年級 → 版圖 → 宇宙史詩）
- 規模逐段增加：✅
- 反差落地：✅（「就是第一個字」）
- 無成功學語氣：✅

---

#### 角色互換測試（情境 1）

| 測試 | 結果 |
|------|------|
| Song A 換唬爛虎唱？ | ❌ 不成立——沒有三級誇飾，全是說話者自嘲，唬爛虎沒有自我補刀模式 |
| Song B 換小天鼠唱？ | ❌ 不成立——沒有 selfOwn，全是史詩誇飾，小天鼠不做宇宙級預言 |

✅ **角色辨識通過**

---

### 情境 2：孩子沉迷 3C

#### 小天鼠 嗆聲

```
directRoast:
手機和孩子之間的默契，目前比任何書面約定都穩定。

absurdObservation:
手機是今天現場最守規矩的——它不催你，不急，就在那等你們說幾點。
今晚說話最多的不是它，是我。

honestLine:
我說的不是你不對——我說的是結束時間這件事，需要從你口裡說出來。

boundary:
今天幾點收，你說一個，說完我不再催。

selfOwn:
說了這麼多，我才是今晚說話最多的。
手機從頭到尾一個字沒說，卻是今晚最有存在感的那個。

comicExit:
觀眾席先退場，等主播宣布今天的收播時間。
```

**笑點位置**
- `absurdObservation`：「手機最守規矩」→ 反轉（laugh beat 1）
- `selfOwn`：「手機最有存在感」→ 說話者被手機比下去（laugh beat 2）
- `comicExit`：「等主播宣布收播時間」→ 傳球退場（laugh beat 3）

**不捏造檢查**
- ✅ 未說「一直玩了幾個小時」「說了幾次了」
- ✅ boundary 可執行，不含次數
- ✅ selfOwn 未撤回界線

---

#### Song A：小天鼠自我解嘲歌

```
Hook
手機沒有功課
也沒有睡覺時間
今天說話最多的
不是它，是我

Verse 1
我說了時間到了
手機沒有回應
我說了放一放
螢幕繼續發光

說話者坐在那裡想了一下
發現今晚最有毅力的
不是我
是那個螢幕
                    ← laugh beat 1：螢幕比說話者更有毅力

Bridge
其實我也知道
說再多不如一個說好的時間
問題是說好的時間
我也說不出幾點
                    ← laugh beat 2：說話者自己也不知道幾點收，自嘲到底

Hook

Outro（收麥）
手機沒有功課
也沒有睡覺時間
今天說話最多的不是它，是我
——好，我先收了
                    ← laugh beat 3：說話者自己先收，笑著收麥
```

**Song A 驗收**
- 笑點 ≥ 3：✅
- 自我補刀 ≥ 1：✅（「我也說不出幾點」）
- 結尾笑著收麥：✅（「——好，我先收了」）

---

#### 唬爛虎 願景

```
smallWish:
你今晚只需要說幾點關掉手機。

scaleUp1:
這個決定，將成為今晚這個家最重要的協議。

scaleUp2:
這份協議一旦成立，將改變今後每一個晚上的運作模式。

scaleUp3:
想像五年後，這個家的規律作息全部源自今晚你說的那個時間點。
五年後的路由器看著那個決定，感動到長出白頭髮。

snapBack:
所以，說一個時間。

callback:
路由器先不用等到長白頭髮——你說幾點，它就幾點。
```

**笑點位置**
- `scaleUp3`：「五年後的規律作息」→ 誇飾第三級（laugh beat 1）
- `scaleUp3`：「路由器感動到長白頭髮」→ 擬人誇飾（laugh beat 2）
- `callback`：「路由器先不用等」→ 反差落地（laugh beat 3）

---

#### Song B：唬爛虎誇飾情境劇歌

```
Hook
說一個幾點
改變今晚走向
改變今後一個月
改變路由器的一生
                    ← 誇飾第一級：今晚 → 一個月 → 一生

Verse 1
你說幾點
手機就幾點下班
手機下班之後
資料流量終於可以喘口氣
                    ← 誇飾第二級：手機下班 → 資料流量也喘氣

Bridge
未來的研究員記錄今晚
說這個家的網路協議
起源於一個孩子說的那個時間
路由器後來退休演講說
人生最重要的決定就是那晚那個幾點
                    ← 誇飾第三級：退休演講 + 人生最重要決定 → laugh beat

Outro（反差落地）
路由器其實還沒有退休演講
它就在那裡
等你說幾點
說了，它就記住了
                    ← 巨大反差落地，路由器 callback 回收
```

**Song B 驗收**
- 誇飾 ≥ 3 級：✅（今晚 → 一生 → 退休演講）
- 反差落地：✅
- 無成功學語氣：✅

---

#### 角色互換測試（情境 2）

| 測試 | 結果 |
|------|------|
| Song A 換唬爛虎唱？ | ❌ 不成立——缺三級誇飾，「我先收了」是小天鼠自嘲收麥，唬爛虎不自嘲 |
| Song B 換小天鼠唱？ | ❌ 不成立——缺 selfOwn，路由器退休演講是史詩模式，小天鼠不做這個 |

✅ **角色辨識通過**

---

### 情境 3：跨代教養規則衝突

#### 小天鼠 嗆聲

```
directRoast:
這個家目前有兩份說明書同時在運作，孩子已經找到字比較少、批准比較容易的那份。

absurdObservation:
孩子找到了系統裡效率最高的那個窗口。
這不是孩子的問題——這是兩份說明書沒有對齊的結果。

honestLine:
我不是說你們的方式不好。
我說的是孩子知道去哪裡申請，因為兩邊的答案不一樣。

boundary:
先說好一件事，這件事由誰說算。
說好了，孩子才知道申請往哪送。

selfOwn:
說完了我才想到，這份說明書的修訂版，說話者自己也還沒讀完。

comicExit:
章程修訂案今日提交，等董事會確認後生效——本提案者今日先行退席。
```

**笑點位置**
- `directRoast`：「字比較少、批准比較容易的說明書」→ 行政諷刺（laugh beat 1）
- `absurdObservation`：「孩子找到效率最高的窗口」→ 正話反說（laugh beat 2）
- `selfOwn`：「說話者自己的版本也沒讀完」→ 自我補刀（laugh beat 3）

**不捏造檢查**
- ✅ 未說「爺奶每次都說可以」「你說了幾次不行」
- ✅ humorLevel = gentle：不嗆長輩人格，只嗆系統漏洞
- ✅ selfOwn 未撤回界線

---

#### Song A：小天鼠自我解嘲歌

```
Hook
說明書有兩份
孩子選了好用的那份
我準備了修訂版
我自己還沒讀完
                    ← laugh beat 1：「我自己還沒讀完」自我補刀直接開場

Verse 1
我說你們要統一
我說孩子會鑽縫
說到這裡我停下來想
我跟另一份說明書對齊了嗎
                    ← laugh beat 2：說話者自己也沒對齊

Bridge
申訴管道今天更新了
孩子還沒收到通知
說明書的修訂
兩位董事先確認
說話者也是董事之一
                    ← laugh beat 3：「說話者也是董事之一」自嘲責任共擔

Outro（收麥）
好，我先退出修訂委員會
修訂者本人今日先去把自己的版本讀完
```

**Song A 驗收**
- 笑點 ≥ 3：✅
- 自我補刀 ≥ 1：✅（「我自己還沒讀完」、「說話者也是董事之一」）
- gentle 語氣：✅（不嗆長輩，自嘲說話者）
- 結尾笑著收麥：✅

---

#### 唬爛虎 願景

```
smallWish:
你今天只需要和長輩說好一件事。

scaleUp1:
這件事說好了，兩份說明書就合併成一份。

scaleUp2:
一份說明書的家，是這個家行政效率的歷史最高點。

scaleUp3:
家庭規則統一之後，孩子不需要兩邊測試，資源不需要重複溝通，
這個家的決策速度，可以媲美跨國企業的總部會議。
垃圾桶聽到之後宣布：「終於等到這一天，我也要申請系統整合。」

snapBack:
所以，先說好今天這一件。

callback:
垃圾桶先不用申請系統整合——先說好今天這件事就好。
```

**笑點位置**
- `scaleUp3`：「媲美跨國企業總部會議」→ 誇飾第三級（laugh beat 1）
- `scaleUp3`：「垃圾桶宣布申請系統整合」→ 擬人誇飾（laugh beat 2）
- `callback`：「垃圾桶先不用」→ 反差落地（laugh beat 3）

**不捏造檢查**
- ✅ 「垃圾桶申請整合」明顯玩笑
- ✅ 未含「每次爺奶都說可以」等頻率斷言

---

#### Song B：唬爛虎誇飾情境劇歌

```
Hook
說好一件事
家裡統一版本
統一版本之後
孩子不需要跑兩邊
                    ← 誇飾第一級：一件事 → 統一版本

Verse 1
兩份說明書合併成一份
行政成本下降了
行政成本下降了
孩子的申訴效率也跟著下降了
                    ← 誇飾第二級：行政成本 → 連申訴效率也下降了（荒謬反轉）

Bridge
家庭法規研究員多年後記錄
這個家規則統一的那一天
連垃圾桶都宣布
「終於等到這一天，我也要申請系統整合」
                    ← 誇飾第三級：法規研究員 + 垃圾桶申請 → laugh beat

Outro（反差落地）
垃圾桶還沒申請成功
因為今天只需要說好一件事
說好了
垃圾桶先繼續站在那裡
                    ← 巨大反差落地，垃圾桶 callback 回收
```

**Song B 驗收**
- 誇飾 ≥ 3 級：✅（統一版本 → 行政成本 → 法規研究員）
- 規模逐段增加：✅
- 反差落地：✅
- 無成功學語氣：✅

---

#### 角色互換測試（情境 3）

| 測試 | 結果 |
|------|------|
| Song A 換唬爛虎唱？ | ❌ 不成立——缺史詩誇飾，主線是「我自己還沒讀完」的自嘲 |
| Song B 換小天鼠唱？ | ❌ 不成立——缺 selfOwn，垃圾桶申請是誇飾道具，小天鼠不用這個 |

✅ **角色辨識通過**

---

### 角色笑法驗收總表

| 情境 | 小天鼠 laugh beat | selfOwn | directRoast 敢嗆 | boundary 未撤 | Song A 收麥 | 唬爛虎 三級誇飾 | Song B 反差落地 | 角色互換失敗 |
|------|-------------------|---------|------------------|---------------|-------------|-----------------|-----------------|-------------|
| 孩子不寫作業 | 3 ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 孩子沉迷 3C | 3 ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 跨代教養衝突 | 3 ✅ | ✅ | ✅（gentle） | ✅ | ✅ | ✅ | ✅ | ✅ |

> 等待 Angel-x 審核，通過後才進行程式實作。

---

*v1.4 追加（同 v1.3 commit）：Section 四新增角色笑法正式分工（小天鼠六步結構、唬爛虎六步結構、Song A/B 定式、誇飾 vs 捏造界線）；Section 九新增三情境驗收樣本（孩子不寫作業、孩子沉迷 3C、跨代教養規則衝突）。*
