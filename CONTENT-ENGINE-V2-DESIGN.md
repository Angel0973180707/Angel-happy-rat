# 《笑鼠人了！》內容引擎 V2 架構設計

版本：v1.2（2026-06-25）｜狀態：待 Angel-x 審核，尚未寫入程式

---

## 一、分類模型

每次輸入整理以下欄位，所有欄位允許 `unknown`。

### 1.1 角色欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `speakerRole` | string | 說話者身分（parent / employee / partner / sibling / friend / self / unknown） |
| `targetRole` | string | 被嗆對象（child / boss / partner / grandparent / coworker / self / unknown） |
| `subjectRole` | string \| null | 第三方角色（可空）。三方衝突才填，例如爺奶衝突中的孩子 |
| `subjectKey` | string | 衝突核心事件物件（screen / homework / chores / task / schedule / food / money / unknown） |
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

**screen 子情境（目前支援的五種）**

| subSituationKey | 說明 | 觸發關鍵詞範例 |
|-----------------|------|----------------|
| `screen_time` | 使用時間爭執 | 一直玩、不肯收、還沒到時間、說好了但沒收 |
| `screen_content` | 內容問題 | 看什麼、玩什麼遊戲、不適合的內容 |
| `screen_routine` | 作息影響 | 睡覺、睡太晚、作業、吃飯都在玩 |
| `screen_table` | 餐桌使用 | 吃飯還在看、邊吃邊玩 |
| `screen_hidden` | 偷偷使用 | 偷偷、躲起來、被發現、不讓人看到 |

> 使用者未提供足夠資訊時，`subSituationKey = null`，回傳 screen 一般詞庫。

**其他情境子鍵**（待後續定義）：homework_block / homework_forgot / lateSleep_alarm / lateSleep_night_owl 等

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

- 觸發條件：situationKey = unknown 且 conflictType = unknown
- 詞庫來源：`general[targetRole]`
- 規則：truth 帶入使用者原句關鍵詞（最多 10 字，不保存完整原句），不另行推斷原因
- 不確定語氣：「關於這件事，目前還不清楚是哪個環節——可以先說說看哪個比較接近？」

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
> - `screen_table`：需使用者提到「吃飯」「餐桌」才可用餐桌相關 analogy
> - `screen_hidden`：需提到「偷偷」「被發現」才可用隱藏使用相關 analogy
> - 未提供時一律用 screen_time 一般詞庫，不主動假設

#### 5 條嗆聲核心句

1. 孩子和手機之間的默契，目前比任何一科作業都穩定。
2. 螢幕藍光很忠實，沒有人說幾點收，它就幾點留。
3. 手機掌握了最高發言權，使用結束的條件目前還在協商中。
4. 孩子找到了一件做起來最不費力的事——這件事剛好叫做「繼續往下滑」。
5. 這個現場最不急的是手機——它沒有功課、沒有睡覺時間，就在這裡等你們說幾點。

#### 流程 A：W_播報台

**requiredEvidence**：使用者提到「時間」「不肯收」「說好了」或「繼續玩」中至少一項。

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

**requiredEvidence**：無強制（廢話文學可用於一般 screen_time，不需特定細節）。

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
- ✅ `screen_hidden` 等子情境需 requiredEvidence，不自行觸發

---

### 案例 B：跨代教養規則衝突

#### 分類結果

| 欄位 | 值 |
|------|----|
| speakerRole | parent |
| targetRole | grandparent |
| subjectRole | child（第三方角色，三方衝突） |
| subjectKey | chores（廣義：親子規則） |
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

**requiredEvidence**：使用者提到「規則不同」「爺奶說可以」「我說不行」中至少一項。

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

**requiredEvidence**：無強制（廢話文學可用於確認衝突存在但細節不清楚的情況）。

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

**requiredEvidence**：使用者提到「做家事」「不平均」「我都在做」中至少一項。

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

1. 這件事還沒開始，腦子已經把它完成了很多次——可惜只有一個版本會變成真的。
2. 「等一下去做」已經說了幾個「等一下」——計次器目前沒有在走。
3. 卡住不是因為懶，是把某一個步驟想得太大——就那個步驟，把它縮小。
4. 這件事很重要，這件事等一下再說——兩件事同時在腦子裡是可以共存的。
5. 待辦清單上有這件事，它沒有動，但它很有自知之明地待在那裡。

> ⚠️ 嗆聲核心句 2 含「已經說了幾個等一下」——需使用者提到「一直拖」「一直說等一下」才可用，fallback 不可直接套。

#### 流程 A：W1 廢話文學

**requiredEvidence**：無強制（自我拖延情境 general 程度較高）。

- **analogy**：「這份任務進入了準備狀態——就像辦好的健身卡，充滿希望，目前沒有進場。」
- **honest**：「不想做，或是不知道從哪裡開始——這兩件事都可以，先弄清楚是哪個。」
- **boundary**：「今天只需要開始——不需要做完，只需要開始。」
- **comicExit**：「拖延委員會今日宣布：休會時間為接下來的五分鐘，五分鐘後開始第一步。」
- **nextAction**：「第一步是什麼——就說這一步，不是說整件事。」
- **song hook A（廢話文學）**：
  ```
  任務說明讀完了
  策略分析做了三輪
  第一步還在草稿
  但準備工作非常完整
  ```
  comedyDevice: `self_deprecation`（三輪分析了什麼都沒動，說話者自己就是那個人）
  callbackVariant: 「準備工作非常完整」→唬爛虎可回收「正式執行階段，現在開始」

#### 流程 B：W_氣象播報

**requiredEvidence**：使用者提到「一直拖」「不知道怎麼開始」「拖了幾天」。

- **analogy**：「今天的個人天氣：拖延指數偏高，能見度低，預計在說出第一步後轉晴。」
- **honest**：「我知道這件事重要，不知道的是為什麼還沒開始——是累？卡在哪裡？還是不知道怎麼切入？」
- **boundary**：「今天不要求做完，只要求說出第一步——說了就算成立。」
- **comicExit**：「氣象播報員宣布：說出第一步之後，後面的預報自動更新。」
- **nextAction**：「第一步說出來——就這一步，後面再說。」
- **song hook B（氣象播報）**：
  ```
  今天拖延指數持續偏高
  已連續觀測三天了
  預計在說出第一步後轉晴
  氣象局建議不用等晴天才出發
  ```
  comedyDevice: `self_deprecation`（觀測三天、說話者自己就是那個三天的數據）
  callbackVariant: 「氣象局建議」→唬爛虎可回收「科學數據支持：出發就是轉晴的開始」

#### Fallback 範例

> 輸入：「我一直在拖」（無任務細節）

「關於拖延——還不確定是哪種情況，可以先選一個比較接近的嗎？是任務太大不知道從哪裡切、累了需要先休息、還是說好要開始但沒說第一步是什麼？」

#### 幽默自評（依 humorLevel = self_directed，目標 ≥ 4.0）

| 項目 | 分數 | 說明 |
|------|------|------|
| 情境相關性 | 4.5 | interactionType=self，自嘲框架清楚 |
| 好笑程度 | 4.2 | 「準備工作非常完整」「氣象局已觀測三天」自嘲精準 |
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
- 不傳送 `fallback_trigger`，不保存任何使用者輸入原句片段
- 不傳送 `subSituationKey` 的具體內容（僅傳是否命中 specific）
- `primaryConflictType` 只傳正規化分類值，不傳推斷過程

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

## 七、待確認事項

1. **subSituationKey 觸發邏輯**：screen 的五個子情境，前端是否需要額外 UI 選項？或純靠關鍵詞推斷？
2. **cross_generation_rules 詞庫位置**：是放 Batch 2（親子與長輩）還是保留在 Batch 1 孩子情境下？
3. **self_procrastinate 輸出 schema**：已確認與 directed 相同，interactionType=self 是唯一差異——是否需要在 UI 上有對應提示（例如：不顯示「對方」相關字樣）？
4. **歌曲模板引擎實作時程**：是否列入 R3，還是等五個 Batch 的情境內容完成後再統一實作？
5. **humorLevel = gentle 的 hook 審核**：案例 C 幽默分 3.4，Angel-x 是否確認 gentle 層級 3.3–3.6 可接受，不需另外設計高強度幽默策略？

---

*v1.2：分類 schema 升版（主/次衝突、需求、子情境、信心度、來源）；歌曲規範加 comedyDevice + callbackVariant；五案依新 schema 修訂並重新評分；GA4/GAS 移除 fallback 原句記錄；conflictType 明確標示為後台專用。核准後才進行程式實作。*
