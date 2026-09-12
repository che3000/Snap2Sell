# Snap2Sell 個人化與全域迭代 Spec v4

## 1. 目的與設計結論

本文件依目前 Snap2Sell 程式碼重新定義價格、描述、標題與市場結果的學習方式。

目前專案的實際邊界是：

- Next/Vinext + Cloudflare Worker。
- Cloudflare D1 + Drizzle 保存資料。
- R2 保存圖片。
- BigGo 由 `packages/market/biggo.ts` 的 HTTP adapter 呼叫。
- `generate` 產生草稿，`save` 儲存草稿；目前沒有蝦皮 publish API。
- `preferences` 是 owner/scope/data JSON。
- `events` 是 owner/product/scope/kind/data/at 的 append-only 行為紀錄。

本版採用以下責任分工：

| 層級 | 學習內容 | 作用 |
|---|---|---|
| Global | 市場結果 filter policy、來源權重、三種價格策略、標題結構與商品 identity | 讓所有使用者的市場資料、定價選項與標題生成更穩定 |
| Personal | 價格策略、描述長度／語氣／格式等 | 只影響該使用者下一次生成 |
| 明確設定 | 現有 seller/store/category 偏好設定 | 保留現有 UI 與優先權，不等同自動學習層 |

**標題不做個人風格化。描述才做個人偏好風格化。**

## 2. 不猜測外部接口

目前 BigGo adapter 的 `research()` 實際回傳為：

```text
query / at / items / summary / source
```

目前 `summary` 實作包含：

```text
count / low / high / competitive / balanced / premium / outliers
```

目前 `packages/market/index.ts` 的實際計算是：先取 `included` 商品價格，使用 IQR 排除離群值，再用排序後的 index 取固定分位數：

```text
quantile(f) = sorted[Math.floor((count - 1) * f)]
```

- `competitive`：p30
- `balanced`：p50，也就是客觀市場中位數
- `premium`：p70

因此目前 `summary.balanced` 是固定 p50，不是 GlobalPricingAgent 可直接改寫的設定值。GlobalPricingAgent 應調整三種策略各自使用的 percentile，再由同一批有效市場價格重新計算推薦價。

本 spec 不先假設 BigGo 已提供歷史趨勢、商品 ID、來源 ID 或額外 ranking 欄位。若 BigGo adapter 的另一位協作者要新增這些資料，必須先更新 `packages/contracts` 與 adapter contract，再接入本功能。

目前 BigGo response schema 只解析 `title`、`price`、`currency`、`url`、`affurl`、`price_range_min`、`price_range_max`；未確認的其他 raw keys 目前不會進入 normalized result。若需要歷史價格或其他分布資訊，先由 BigGo 協作者確認欄位，再擴充 adapter contract，不直接猜測欄位名稱。

目前一次搜尋的 item price 分布已足夠計算 cross-sectional percentile。若要使用 BigGo MCP 其他已確認的 keys，建議新增 optional `priceEvidence` 到我們自己的 normalized contract，而不是讓 GlobalPricingAgent 直接讀 raw response：

```ts
type MarketPriceEvidence = {
  distribution?: Array<{ percentile: number; price: number }>;
  history?: Array<{ observedAt: string; price: number }>;
  sampleCount?: number;
  basis?: "current_listings" | "historical" | "biggo_aggregate";
};
```

上面是 Snap2Sell 內部的 normalized contract，不是對 BigGo raw key 名稱的猜測。只有在同事確認 BigGo key 的語意、型別與時間範圍後，才由 `biggo.ts` mapping 進來。沒有 `priceEvidence` 時，GlobalPricingAgent 只使用目前已確認的 included item prices。

只有在確認現有 item `url` 代表原始購物來源時，才可以用 URL parser 取得 normalized host 作為暫時的 `source_key`。目前 adapter 可能優先使用 `affurl`，因此不能直接假設 host 就是原始來源；若無法確認，先保存 raw URL，等待 BigGo 端提供穩定來源 ID。

## 3. 迭代事件邊界

目前沒有獨立的「送出／發布」流程，因此本期以使用者按下「儲存草稿」作為有效 feedback 邊界：

- `generate`：建立可編輯生成結果與 `generationId`。
- `market`：取得並保存市場結果與價格推薦快照。
- `save`：保存 draft，並將生成版本到最終內容的差異送入 queue。
- `export`：只產生通用 JSON，不算發布或成交。

不要在每次 input change、每次價格按鈕 click 時直接更新全域策略。價格按鈕可以先存在前端 state，伺服器只在 save 時以 snapshot 驗證最後選擇。

## 4. 使用者送出到全域 Queue

### 4.1 送出流程

```text
使用者按「儲存草稿」
  ↓
API 驗證 owner、draft version、generation、market recommendation
  ↓
同一個 D1 transaction：
  drafts 更新
  PREFERENCE_OBSERVATION 寫入 events
  LISTING_FEEDBACK 寫入 events
  learning_queue 寫入 PERSONAL_PROFILE_UPDATE 與 GLOBAL_FEEDBACK 兩筆 queued jobs
  generations.observed 更新
  ↓
個人 job 立即交給 PersonalProfileAgent；檢查 GLOBAL_FEEDBACK queued 數量
  ↓
達到 GLOBAL_LEARNING_TRIGGER_COUNT，建立待處理 batch
```

Queue item 必須與 `events.id` 關聯，讓事件稽核與 queue 重試可以分開管理。draft 寫入失敗時，不得留下 feedback 或 queue item。

### 4.2 全域觸發筆數

使用部署設定，不寫死在 domain package 或 Agent prompt：

```text
GLOBAL_LEARNING_TRIGGER_COUNT=20
```

在 Cloudflare runtime 由 `env.GLOBAL_LEARNING_TRIGGER_COUNT` 讀取，並在設定不存在或格式錯誤時使用明確的安全預設值。實際預設值由部署環境決定，20 只是 MVP 建議值。

語意定義：

- 全域 threshold 只計算 `task_type = GLOBAL_FEEDBACK` 且 `status = queued` 的有效 queue job。
- 數量小於 threshold：只累積，不啟動全域迭代。
- 數量大於等於 threshold：取最早的 threshold 筆建立 batch。
- 剩餘 queue item 留給下一個 batch。
- batch 失敗時 item 回到 queued 或 failed-retryable，不前進成功 cursor。
- 同時間只能有一個 active batch，避免同一批資料重複更新 policy。

本專案目前沒有既有 scheduler 或 Queue binding，因此第一版可用 D1 `learning_queue` 作為 durable queue，再由 Cloudflare scheduled trigger、受保護的內部 job 或平台提供的 worker runner 消費。不得新增公開 API 讓登入使用者任意執行全域迭代。

### 4.3 個人 profile 即時迭代

個人偏好不使用 `PERSONAL_AGENT_TRIGGER_COUNT`，也不等待累積多筆 feedback。每次 `save` transaction 成功後，建立一筆 `PERSONAL_PROFILE_UPDATE` job，由 worker 立即非同步呼叫 `PersonalProfileAgent`。

這裡的「立即」是立即進入個人工作流，不讓 OpenAI 呼叫阻塞使用者的 save response。每一個 owner 的 job 需要依序執行，並用 `base_version` 防止舊 proposal 覆蓋新 profile。

個人 agent 每次都可以提出 profile patch，但不是每次都可以直接套用。由 `PolicyValidatorPublisher` 自動檢查：

- strict schema、owner scope 與 base version。
- `PERSONAL_PROFILE_MIN_CONFIDENCE`。
- contradiction 是否為空。
- 單次最多修改的 preference dimensions：`PERSONAL_PROFILE_MAX_DIMENSION_CHANGES`。
- 不得修改商品事實、global policy 或標題個人化設定。

門檻通過就自動建立新的 active personal profile version；不通過就自動保留上一版並記錄 rejected proposal，不需要人工批准。這是套用門檻，不是啟動門檻。

## 5. 資料庫欄位

### 5.1 現有表格：保留與擴充方式

#### `drafts`

維持目前 schema：

```text
owner, id, store, data, version, updated
```

商品目前內容留在 draft；學習狀態與市場證據不塞回 `drafts.data`。

#### `preferences`

維持目前 schema：

```text
owner, scope, data, updated
```

自動學習只推導個人 `seller` 層。既有 `store:*` 與 `category:*` 可繼續作為明確設定並保留目前 `scopeChain()` 優先權；本版不新增 category 自動學習。

為了讓 personal profile 不受現有 evidence 筆數門檻阻擋，`resolvePreferences()` 需要新增 active profile 合併層，建議優先順序為：

```text
explicit user setting
  > active personal profile version
  > legacy inferred seller evidence
  > store/default preferences
```

`personal_profile_versions` 只保存 agent 通過 gate 的 seller profile；現有 `inferEdits()` 與衰減／一致性邏輯仍保留作 legacy fallback，不再是 PersonalProfileAgent 的啟動條件。

目前個人偏好中的價格 enum 先維持：

```text
competitive / balanced / premium
```

Global 價格策略另外使用三個明確目標：

```text
profit_first / momentum_price / traffic_first
```

舊的 `competitive / balanced / premium` 只作為相容層，實際對應關係由 active global policy 設定，不在程式碼中硬編碼。

#### `generations`

表格欄位維持目前 schema。`data` JSON 擴充為：

```json
{
  "title": "...",
  "description": "...",
  "warnings": [],
  "source": "openai",
  "preferences": {},
  "globalPolicyVersion": null
}
```

`observed` 繼續做同一 `generationId` 的 feedback 去重。

#### `events`

維持：

```text
id, owner, product, scope, kind, data, at
```

新增建議 index：

```text
events(kind, at, id)
```

既有 `PREFERENCE_OBSERVATION` 保持 `Evidence[]` 格式。新增 `LISTING_FEEDBACK` 作為全域 batch 的輸入。

### 5.2 `market_snapshots`

保存目前 `POST /api/market` 成功取得的完整研究結果。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | text PK | UUID，回傳 `marketSnapshotId` |
| `owner` | text | 使用者 ID，所有查詢必須隔離 |
| `product` | text | draft 的 `product.id` |
| `query` | text | 目前 `research()` 的 query |
| `source` | text | 目前 `research()` 的 source |
| `global_policy_version` | text nullable | 撈取與 ranking 時套用的 global policy |
| `retrieval_plan` | text(JSON) nullable | planner 產生的 connector-safe plan |
| `applied_capabilities` | text(JSON) nullable | 實際由 BigGo connector 套用的能力清單 |
| `request_data` | text(JSON) | 已確認的 brand/model/category/condition/attributes |
| `response_data` | text(JSON) | 現有 `research()` 完整 response |
| `fetched_at` | integer | epoch milliseconds |

建議 index：`(owner, product, fetched_at)`。

這張表保存的是當次研究證據，不是另一套市場歷史資料庫。

### 5.3 `price_recommendations`

保存根據現有 `summary` 顯示給使用者的三個價格選項。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | text PK | UUID，回傳 `priceRecommendationId` |
| `owner` | text | 使用者 ID |
| `product` | text | draft product ID |
| `market_snapshot_id` | text | 關聯市場快照 |
| `global_policy_version` | text nullable | 產生排序時使用的版本 |
| `personal_preferences` | text(JSON) | 產生當下的有效 `Preferences` snapshot |
| `options_data` | text(JSON) | key、price、percentile、排序、default、reference market median |
| `default_strategy` | text nullable | `profit_first`／`momentum_price`／`traffic_first` |
| `selected_strategy` | text nullable | save 時寫回；手動定價為 `manual` |
| `selected_price` | integer nullable | save 時寫回的 final price |
| `selected_at` | integer nullable | save 時間 |
| `created_at` | integer | 建立時間 |

`summary.balanced` 是當次客觀市場中位位置，必須以 `referenceMarketMedian` 保存在 `options_data`。個人／全域策略可以調整 strategy order、default 與各策略的 percentile，但不得覆寫市場快照的客觀 p50。

### 5.4 Global 價格策略

目前三種 legacy summary 欄位使用固定分位數：

```text
competitive = quantile(0.30)
balanced = quantile(0.50)
premium = quantile(0.70)
```

GlobalPricingAgent 改為調整三種策略的 percentile：

| 策略 | 定義 | 初始 percentile |
|---|---|---:|
| `profit_first` | 利潤優先，取較高市場價格位置 | p70 |
| `momentum_price` | 成交動能價，接近市場中位 | p50 |
| `traffic_first` | 流量優先，取較低市場價格位置 | p30 |

正式值由 global policy 的可配置欄位決定。Agent 只能在設定的 percentile 上下限、策略間最小間距與單次變更幅度內提出調整。

推薦價格計算方式：

```text
referenceMarketMedian = quantile(0.50)
recommendedPrice = quantile(strategy.percentile)
```

市場快照永遠保留原始 `summary.balanced` p50。若策略改成 p45 或 p75，這代表推薦取價位置改變，不代表市場中位數被改寫。

`price_recommendations.options_data` 應保存：

```json
{
  "referenceMarketMedian": 1000,
  "strategies": [
    {"key": "profit_first", "percentile": 0.7, "price": 1100},
    {"key": "momentum_price", "percentile": 0.5, "price": 1000},
    {"key": "traffic_first", "percentile": 0.3, "price": 900}
  ],
  "defaultStrategy": "momentum_price"
}
```

### 5.5 `learning_queue`

D1 durable queue。同一筆 `LISTING_FEEDBACK` 會建立 personal 與 global 兩個獨立 consumer job，兩者各自重試與完成，不互相消耗。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | text PK | queue item UUID |
| `event_id` | text | 關聯 `events.id` |
| `owner` | text | 來源使用者 |
| `product` | text | draft product ID |
| `task_type` | text | `PERSONAL_PROFILE_UPDATE` 或 `GLOBAL_FEEDBACK` |
| `scope_key` | text | 個人 job 為 owner；global job 固定為 `global` |
| `dedupe_key` | text UNIQUE | 例如 `${event_id}:${task_type}:${scope_key}` |
| `payload` | text(JSON) | batch 所需的 feedback 摘要或 event reference |
| `status` | text | `queued`、`processing`、`completed`、`failed` |
| `attempts` | integer | 重試次數 |
| `available_at` | integer | 可被 worker 取出的時間 |
| `batch_id` | text nullable | 被哪一批取用 |
| `created_at` | integer | 入列時間 |
| `processed_at` | integer nullable | 完成時間 |
| `last_error` | text nullable | 最後錯誤，不放 secret |

建議 unique：`dedupe_key`；index：`(task_type, status, available_at, created_at)` 與 `(scope_key, task_type, status, created_at)`。

### 5.6 `learning_batches`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | text PK | batch UUID |
| `status` | text | `running`、`completed`、`failed`、`skipped` |
| `trigger_count` | integer | 觸發時 threshold |
| `queue_count` | integer | 本批取用筆數 |
| `trigger_type` | text | `GLOBAL_QUEUE_THRESHOLD` |
| `started_at` | integer | 開始時間 |
| `finished_at` | integer nullable | 完成時間 |
| `summary_data` | text(JSON) nullable | 聚合統計或 Agent Summary |
| `candidate_policy_data` | text(JSON) nullable | 候選 global policy diff |
| `error` | text nullable | 失敗原因 |

### 5.7 `global_policies`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `version` | text PK | 例如 `global-v12` |
| `status` | text | `candidate`、`shadow`、`active`、`retired`、`rolled_back` |
| `based_on_version` | text nullable | 上一版 |
| `batch_id` | text nullable | 產生來源 batch |
| `data` | text(JSON) | 白名單策略設定 |
| `created_at` | integer | 建立時間 |
| `activated_at` | integer nullable | 啟用時間 |
| `rolled_back_at` | integer nullable | 回滾時間 |

初期 policy 結構：

```json
{
  "marketFilter": {
    "retrieval": {
      "sourcePriority": [],
      "sourceQuota": {},
      "queryHints": []
    },
    "sourceWeights": {},
    "sourceAllowList": [],
    "sourceBlockList": [],
    "maxSourceShare": null
  },
  "pricing": {
    "defaultStrategy": "momentum_price",
    "order": ["momentum_price", "traffic_first", "profit_first"],
    "strategies": {
      "profit_first": {"percentile": 0.70},
      "momentum_price": {"percentile": 0.50},
      "traffic_first": {"percentile": 0.30}
    },
    "legacyMapping": {
      "competitive": "traffic_first",
      "balanced": "momentum_price",
      "premium": "profit_first"
    }
  },
  "title": {
    "enabled": false,
    "structure": {}
  }
}
```

描述的個人風格不要放進 global policy；global policy 只可放市場 filter 與標題的通用結構規則。

### 5.8 `agent_proposals`

保存每次 agent 的輸出與自動 gate 結果，讓系統可以自行決定套用、拒絕、shadow 或 rollback，而不是依賴人工判斷。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | text PK | proposal UUID |
| `agent_type` | text | `PersonalProfileAgent`、`GlobalMarketFilterAgent` 等 |
| `scope` | text | `seller` 或 `global` |
| `scope_key` | text | owner 或 `global` |
| `event_id` | text nullable | 個人即時 feedback 的來源 event |
| `batch_id` | text nullable | global batch 的來源 |
| `base_version` | text nullable | proposal 建立時的 profile／policy version |
| `proposal_data` | text(JSON) | strict schema 驗證後的 patch |
| `confidence` | real nullable | agent 回傳的信心值 |
| `gate_data` | text(JSON) | 自動 gate 各項結果與 threshold snapshot |
| `status` | text | `proposed`、`applied`、`rejected`、`shadow`、`rolled_back`、`failed` |
| `applied_version` | text nullable | 套用後的新 profile／policy version |
| `created_at` | integer | 建立時間 |
| `evaluated_at` | integer nullable | gate 完成時間 |
| `error` | text nullable | 失敗原因，不放 secret |

建議 index：`(scope_key, agent_type, created_at)`、`(status, created_at)`。

### 5.9 `personal_profile_versions`

個人 profile 使用版本化資料，不直接覆蓋現有 `preferences`。`preferences` 保留明確使用者設定與舊版相容資料；generate 時再合併 active personal profile。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `version` | text PK | 例如 `seller-user-v8` |
| `owner` | text | 使用者 ID |
| `based_on_version` | text nullable | 上一版 profile |
| `proposal_id` | text nullable | 產生此版本的 agent proposal |
| `status` | text | `active`、`retired`、`rolled_back` |
| `data` | text(JSON) | description style、pricing goal 等允許欄位 |
| `created_at` | integer | 建立時間 |
| `activated_at` | integer nullable | 啟用時間 |
| `rolled_back_at` | integer nullable | 回滾時間 |

同一 owner 同時間只能有一個 active version。整個版本寫入由 validator 自動完成。

### 5.10 `policy_evaluations`

保存 active／shadow policy 在後續使用期間的自動評估結果，讓 agent 與 validator 可以自行決定 promote、維持 shadow 或 rollback。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | text PK | evaluation UUID |
| `policy_version` | text | 被評估的 global policy version |
| `based_on_version` | text nullable | 比較基準版本 |
| `scope` | text | 初期固定 `global` |
| `window_start` | integer | 評估期間開始 |
| `window_end` | integer | 評估期間結束 |
| `sample_count` | integer | 可用 feedback／market snapshot 數量 |
| `metric_data` | text(JSON) | filter 通過率、source coverage、選擇／修改方向等可追溯統計 |
| `decision` | text | `promote`、`keep_shadow`、`rollback`、`insufficient_data` |
| `created_at` | integer | 建立時間 |

評估只使用目前系統實際有的訊號，不假設成交或售出天數。這些結果會在下一次 global batch 送給對應 agent，作為下一個 proposal 的 feedback。

## 6. `LISTING_FEEDBACK` 事件格式

在 `save` transaction 內寫入 event，並建立兩個可獨立重試的 queue job：

- `PERSONAL_PROFILE_UPDATE`：scope 為目前 owner，save 成功後立即處理。
- `GLOBAL_FEEDBACK`：scope 為 `global`，累積到 `GLOBAL_LEARNING_TRIGGER_COUNT` 後交給 global batch。

兩個 job 可以共用同一個 `event_id`，但必須使用不同的 `dedupe_key`。

事件內容：

```json
{
  "generationId": "...",
  "marketSnapshotId": "...",
  "priceRecommendationId": "...",
  "productIdentityId": "...",
  "generated": {
    "title": "...",
    "description": "..."
  },
  "final": {
    "title": "...",
    "description": "...",
    "price": 920
  },
  "price": {
    "strategy": "momentum_price",
    "percentile": 0.5,
    "recommended": 920,
    "referenceBalanced": 1000
  },
  "marketSources": [
    {"sourceKey": "example.com", "includedCount": 4, "excludedCount": 1}
  ],
  "source": "openai"
}
```

如果沒有對應生成結果，仍可保存 final draft，但不能假裝有 generated/final diff。如果是手動輸入價格，`strategy` 為 `manual`，不能直接形成價格策略 evidence。

## 7. Global filter optimization

### 7.1 filter 分成兩種

目前 `filterComparables()` 把型號、容量、配件、狀況、幣別、價格範圍與重複來源等條件放在一起。後續改動應分成：

**不可被學習覆寫的 factual safety filter**

- 型號不符。
- 版本／容量不符。
- 配件、零件或組合商品。
- 商品狀況不符。
- 幣別或價格無效。
- 多規格價格範圍。
- 重複 URL。

**可由 global policy 調整的 ranking/filter layer**

- 來源權重。
- 來源在可比結果中的最大占比。
- 同品質來源的排序。
- 哪些來源優先進入摘要。

global policy 不得把 factual safety filter 關掉。

### 7.2 哪些來源受到賣家歡迎

目前結果 item 沒有明確 source ID。只有確認 URL host 是原始來源時，第一版才由既有 `url` 正規化產生 `sourceKey`；若 URL 是 affiliate wrapper，先不做來源偏好聚合。但「被爬回來」不等於「被賣家喜歡」，因此訊號分級如下：

| 訊號 | 強度 | 用途 |
|---|---:|---|
| 來源出現在可比結果 | 弱 | 只做資料覆蓋率 |
| 來源 item 通過 safety filter | 中 | 估計資料品質與可比性 |
| 使用者採用由該來源集合產生的價格並儲存 | 中 | 來源偏好弱監督訊號 |
| 使用者明確標記來源有用／不相關 | 強 | 未來可加入 source feedback UI |

在沒有明確來源選擇 UI 前，不要把單一 source 的出現次數當成強烈喜好；global policy 先以大量樣本平滑更新 source weight。

### 7.3 BigGo 改動方向

目前 BigGo 由另一位協作者修改，因此本功能先不直接改 `packages/market/biggo.ts`。需要先對齊的接口方向是：

1. **維持 raw search adapter 邊界**：BigGo response normalization 與現有 `research()` 呼叫方式先保持相容。
2. **穩定 source identity**：優先請 BigGo adapter 提供確認過的 `sourceKey`；若暫時沒有，外層由 URL host 推導，並記錄 key version。
3. **分離 retrieval 與 learned filter**：active global policy 先經 `MarketRetrievalPlanner` 轉成 connector 可理解的 retrieval plan，再呼叫 BigGo；結果回來後才執行 immutable filter、learned ranking 與 summary。
4. **保留 filter reason**：每個被排除的 item 仍要有現有 reason；新增 learned policy 的 reason 時使用獨立 code，不覆蓋 factual reason。
5. **記錄 policy version**：每個 market snapshot 與 price recommendation 都保存套用的 global policy version。
6. **不要把個人偏好送進 BigGo query**：個人價格／描述偏好只影響結果排序與輸出，不改寫外部搜尋的客觀結果。

若 BigGo MCP 還有歷史價格、價格分布或 sample count 等已確認欄位，需先在這裡登記其語意、型別與時間範圍，再 mapping 到 optional `MarketPriceEvidence`；GlobalPricingAgent 不直接讀 raw response。

`MarketRetrievalPlanner` 是 agent policy 與 BigGo adapter 的中間層，不是另一個 LLM。它的責任是：

- 讀取 active `MarketFilterPolicy`。
- 產生 `MarketRetrievalPlan`，標記要送給 connector 的 query／source hints／quota。
- 只傳遞 BigGo connector 已宣告支援的欄位。
- 對未支援的 retrieval 欄位降級為結果回來後的 `learnedMarketRanking()`，並在 snapshot 記錄 `appliedCapabilities`。

因此 agent 不直接呼叫 BigGo，也不直接改寫 raw request。若目前 BigGo 仍只接受既有的 `query/site/region`，第一次串接仍維持原 request contract；agent 產生的 source preference 先影響回傳結果排序與 soft quota，待同事確認接口後再啟用前置 retrieval 能力。

如果 BigGo 協作者要把 source filtering 移進 adapter，需先共同確認 `MarketItem`、filter policy 與 response schema，再建立 migration 與 domain tests。

## 8. 標題：Global identity 與結構收斂

### 8.1 不做個人標題風格化

標題由 global policy 與已確認商品事實生成，不套用個人 `tone`、`emoji` 或描述風格。現有 `titleFormat` 可保留作明確設定，但不進入新的個人描述 profile。

### 8.2 商品 identity 與 title variant

不要建立「一個商品只有一個 global title」，而是：

```text
canonical_product_id → 多個 title_variant_id
```

新增表格：

#### `product_identities`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | text PK | `canonical_product_id` |
| `identity_key` | text UNIQUE | 正規化事實 key |
| `key_version` | text | identity 組法版本 |
| `identity_data` | text(JSON) | brand、model、已確認 identity attributes |
| `first_seen_at` | integer | 首次出現 |
| `last_seen_at` | integer | 最近出現 |

identity key 只使用 confirmed 的 brand、model 與必要規格；不使用 title，不使用 LLM 模糊判斷。`condition` 不放入 identity，因為全新與二手仍可能是同一商品。

#### `title_variants`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | text PK | `title_variant_id` |
| `product_identity_id` | text | 關聯商品 identity |
| `owner` | text | 來源使用者，保留 owner isolation |
| `title_text` | text | 最終保存標題 |
| `normalized_title` | text | 同 identity 內去重 |
| `source` | text | `generated`、`manual`、`explicit` |
| `generation_id` | text nullable | 來源 generation |
| `shown_count` | integer | 顯示次數 |
| `accepted_count` | integer | 生成後未修改即保存 |
| `edited_count` | integer | 生成後修改再保存 |
| `last_seen_at` | integer | 最近使用時間 |
| `status` | text | `active`、`blocked`、`retired` |

第一期只收集與統計，不把其他使用者的完整 title 直接展示給使用者。先收斂品牌、型號、容量、長度、分隔符號與 factual token 保留等結構，再考慮 title variant seed。

## 9. Description：個人風格化

描述延續現有 `packages/preferences` 與 `inferEdits()`：

- 描述長度。
- 語氣。
- Emoji。
- 規格細節。
- 行銷語氣。
- 條列或段落等可解釋結構。

個人 evidence 在每次 save 時產生，交給 `PersonalProfileAgent` 即時分析。現有 `inferEdits()` 可以作為 evidence 初始訊號，但不再用跨商品筆數作為 agent 啟動條件。profile 是否套用由 confidence、contradiction、scope、base version 與單次變更幅度的自動 gate 決定。個人 profile 影響下一次 `generate`；global batch 不把某人的描述口吻套給全部使用者。

## 10. Global batch 與 policy lifecycle

```text
save transaction 寫入 event + personal/global jobs
  ↓
global job 數量 >= GLOBAL_LEARNING_TRIGGER_COUNT
  ↓
取最早 threshold 筆 `GLOBAL_FEEDBACK` queue job
  ↓
聚合 source/filter、價格 option、標題結構訊號
  ↓
Agent 產生 global policy proposal
  ↓
自動 gate：樣本數／信心／幅度／安全／connector capability
  ↓
candidate → shadow → active，或 rejected／rollback
```

batch 的 global 輸出包含：

- market filter source weights。
- source allow/block 的候選變更。
- 價格選項的 global default/order。
- title 的 factual structure policy。

batch 不輸出：

- 個人描述語氣。
- 個人 emoji 偏好。
- 未經事實驗證的商品資料。
- 任意 prompt 或程式碼。

`PolicyValidatorPublisher` 自動執行 gate 並發布版本，不等待人工批准。每個 policy 必須保存 based-on version、batch ID、diff、啟用時間與 rollback 時間。同一時間只能有一個 active policy。

## 11. API 修改方向

### `POST /api/market`

維持 request `{ product }` 與現有 `research(product)` 呼叫方式。成功後：

1. 讀取 active global market policy。
2. 由 `MarketRetrievalPlanner` 建立 retrieval plan；未確認支援的 BigGo 欄位不得送出。
3. 維持目前 `research(product)` 的 raw adapter contract，依 plan 呼叫 BigGo，回來後套用 immutable filter、learned ranking 與 summary。
4. 保存 `market_snapshots`，包含 `global_policy_version`、`retrieval_plan` 與 `applied_capabilities`。
5. 使用目前 `summary` 建立 `price_recommendations`。
6. 回傳既有 `query / at / items / summary`，加上 `marketSnapshotId`、`priceRecommendationId`、`defaultStrategy`。

### `POST /api/generate`

1. 讀取 active global policy。
2. 讀取個人 profile。
3. 標題只套用 global title structure。
4. 描述套用個人 preferences。
5. 在 `generations.data` 保存 source、effective preferences 與 global policy version。

目前 `apps/api/openai.ts` 的 `ai()` 仍可接收 `Preferences`；global title structure 若需要新欄位，先擴充 `packages/contracts`，不要讓 OpenAI adapter 自己讀 DB。

### `POST /api/save`

增加可選欄位：

```json
{
  "product": {},
  "generationId": "...",
  "marketSnapshotId": "...",
  "priceRecommendationId": "..."
}
```

API 必須以 owner/product 驗證 IDs，從 D1 snapshot/recommendation 重新判斷 option 與 market source，不信任前端傳入的中位數或 policy result。

`POST /api/save` 成功後，系統自動建立 personal 與 global jobs；personal job 立即送入 `PersonalProfileAgent`，global job 僅供 threshold batch 使用。

## 12. 驗收條件

- 使用者 save 後，draft、event、queue item、generation observed 狀態一致。
- global queue 未達 `GLOBAL_LEARNING_TRIGGER_COUNT` 時不產生 global policy，但不影響每次 save 的 personal job。
- 達到 threshold 後只取最早 threshold 筆，剩餘資料保留。
- batch 失敗時可重試且不遺失 queue item。
- PersonalProfileAgent 不需筆數 threshold；每次 save 都會提出可被 gate 拒絕或自動套用的 proposal。
- global filter 不能關閉 factual safety filter。
- BigGo raw response 與現有 adapter contract 不被未確認欄位污染。
- `summary.balanced` 可追溯，不能被個人或 global policy 覆寫。
- 標題不套用個人 tone／emoji／描述風格。
- 描述可以套用個人 preference，但不被 global style 污染。
- owner A 不能讀取 owner B 的 snapshot、recommendation、title raw text 或 feedback。
- policy 可 candidate、shadow、active、rollback。
- agent proposal 通過自動 gate 後才可影響 active 結果，不等待人工批准。
- migration append-only，通過 typecheck、domain tests 與 localhost integration tests。

## 13. Agent 清單與責任

本功能不使用一個全能 Agent，而是由 queue worker 協調多個受限角色。每個 Agent 都有固定輸入、允許分析的 dimensions 與 JSON Schema 輸出。

### 13.1 `FeedbackIngestor`

| 項目 | 定義 |
|---|---|
| 類型 | 系統服務，不使用 OpenAI |
| 觸發 | `POST /api/save` |
| 工作 | 將 draft、generation、market recommendation 組成 `LISTING_FEEDBACK`，寫入 events 與 learning_queue |
| 不負責 | 不判斷風格、不改 policy、不呼叫 BigGo |

這是 queue 的入口，不應稱為 AI Agent；它負責確保每筆資料完整且可重播。

### 13.2 `PersonalProfileAgent`

| 項目 | 定義 |
|---|---|
| 類型 | OpenAI structured-output Agent |
| 觸發 | 每次 `POST /api/save` 成功後立即建立 personal job；不使用筆數 threshold |
| 輸入 | 該使用者最近的 generated/final title、description、price selection 與上一版 profile |
| 分析 | description length、tone、emoji、technical、marketing、structure；pricing goal consistency |
| 輸出 | `profilePatch`、evidence、confidence、contradictions |
| 限制 | 不修改商品事實、不修改全域 policy、不把 title tone 寫入個人 profile |

PersonalProfileAgent 的 proposal 由 `PolicyValidatorPublisher` 自動判斷是否套用，不等待人工批准。自動 gate 至少包含 strict schema、owner scope、base version、`PERSONAL_PROFILE_MIN_CONFIDENCE`、無 contradiction、單次變更維度上限與 personal-only 權限。通過即建立新的 active personal profile version；不通過則保留上一版並記錄 proposal。

描述風格的個人化主要由這個 Agent 負責。價格仍只接受既有 `competitive / balanced / premium` enum，Agent 不能建立新價格策略名稱。

### 13.3 `GlobalMarketFilterAgent`

| 項目 | 定義 |
|---|---|
| 類型 | OpenAI structured-output Agent |
| 觸發 | queue 累積到 `GLOBAL_LEARNING_TRIGGER_COUNT`，global batch 取樣後 |
| 輸入 | 聚合後的 source stats、filter reason stats、採用價格 option、上一版 market policy、上一版 `policy_evaluations` |
| 分析 | 哪些來源的結果較常通過 factual filter、被納入摘要、伴隨推薦完成保存 |
| 輸出 | retrieval hints、source weights、soft ranking、confidence、reason codes |
| 限制 | 不能關閉型號、容量、狀況、幣別、價格範圍等 immutable safety filter；retrieval hints 只能使用 connector 已宣告的能力 |

這個 Agent 不直接讀取或修改 BigGo；它只提出 `MarketFilterPolicy`。實際由 `MarketRetrievalPlanner` 在 BigGo 呼叫前與結果 ranking 階段套用。

### 13.4 `GlobalPricingAgent`

| 項目 | 定義 |
|---|---|
| 類型 | OpenAI structured-output Agent |
| 觸發 | Global batch 中，有足夠的價格策略選擇與 final price feedback 時 |
| 輸入 | 有效 item price distribution、optional `priceEvidence`、各策略選擇率、使用者最後選定價格相對各 percentile 的位置、手動修改方向、上一版 pricing policy、上一版 `policy_evaluations` |
| 分析 | `profit_first`、`momentum_price`、`traffic_first` 各自應使用哪個市場 percentile |
| 輸出 | 每個策略的 `percentile` patch、confidence、reason codes |
| 限制 | 不改寫客觀 `summary.balanced` p50；不建立第四種策略；不超過 percentile 上下限、策略間最小間距與單次變更幅度 |

輸出範例：

```json
{
  "pricingPatch": {
    "profit_first": {"percentile": 0.75},
    "momentum_price": {"percentile": 0.50},
    "traffic_first": {"percentile": 0.25}
  },
  "confidence": 0.81,
  "reasonCodes": [
    "profit_first_final_prices_below_recommendation",
    "traffic_first_selected_without_manual_lowering"
  ]
}
```

`GlobalPricingAgent` 調整的是「策略如何使用市場價格分布」，不是重新定義市場中位數。若資料只顯示使用者偏好某一策略，沒有足夠證據支持 percentile 改變，Agent 應只調整 default/order，不調整 percentile。

### 13.5 `GlobalTitleStructureAgent`

| 項目 | 定義 |
|---|---|
| 類型 | OpenAI structured-output Agent |
| 觸發 | Global batch 中，在 product identity 有足夠 title feedback 時 |
| 輸入 | 同一 `canonical_product_id` 的 title variants、accepted/edited 統計、已確認商品事實 |
| 分析 | 品牌、型號、容量／版本保留率、標題長度、分隔符號、factual token 完整度 |
| 輸出 | global title structure policy 與 title variant ranking proposal |
| 限制 | 不套用個人 tone、Emoji 或 description style；不直接複製其他賣家的 title |

標題第一期可先保持 `enabled: false`，只產生 shadow proposal。

### 13.6 `PolicyValidatorPublisher`

| 項目 | 定義 |
|---|---|
| 類型 | deterministic system service，不使用 OpenAI |
| 觸發 | 任一 Agent 產生 proposal 後 |
| 工作 | 自動驗證 schema、允許欄位、樣本／事件門檻、confidence、變更幅度、safety filter、connector capability、版本與 rollback |
| 輸出 | `candidate`、`shadow`、`active` 或 `rejected` policy |

Agent 永遠只能產生 proposal。這個服務自動決定 `rejected`、`shadow` 或 `active`，不需要人工決策；只有它可以寫入 `global_policies` 或 `personal_profile_versions` 的 active version。

### 13.7 `BatchOrchestrator`

| 項目 | 定義 |
|---|---|
| 類型 | queue worker／系統服務，不是 LLM Agent |
| 工作 | 從 learning_queue 取 batch、建立 summary、依序呼叫各 Agent、交給 validator、更新 queue 狀態 |
| 依賴 | D1、`GLOBAL_LEARNING_TRIGGER_COUNT`、personal/global queue job、OpenAI agent adapter |

這個角色負責流程控制，不負責自行解讀文字。

## 14. Agent 輸入與輸出契約

### 14.1 Personal profile proposal

```json
{
  "scope": "seller",
  "baseProfile": {
    "length": "medium",
    "tone": "professional",
    "emoji": "low",
    "pricingGoal": "momentum_price"
  },
  "profilePatch": {
    "length": "concise",
    "marketing": "low"
  },
  "evidence": [
    {
      "dimension": "length",
      "value": "concise",
      "reasonCode": "final_description_shorter",
      "weight": 1
    }
  ],
  "confidence": 0.84,
  "contradictions": []
}
```

`Preferences.pricing` 目前仍保留作舊 UI／資料相容欄位；新的學習 contract 使用 `pricingGoal`。由 adapter 依 active policy 的 `legacyMapping` 轉換，避免 Agent 同時混用兩套價格策略命名。

### 14.2 Global policy proposal

```json
{
  "basedOnVersion": "global-v12",
  "marketFilterPatch": {
    "sourceWeights": {
      "verified-source-a": 0.12
    },
    "softRanking": ["verified-source-a", "verified-source-b"]
  },
  "pricingPatch": {
    "profit_first": {"percentile": 0.75},
    "momentum_price": {"percentile": 0.50},
    "traffic_first": {"percentile": 0.25}
  },
  "titleStructurePatch": {
    "keepBrand": true,
    "keepModel": true,
    "includeConfirmedVariant": true
  },
  "confidence": 0.78,
  "reasonCodes": ["higher_acceptance_rate"]
}
```

Agent 的 schema 應該使用 strict JSON Schema；未知欄位、任意 prompt、程式碼或 SQL 都拒絕。

## 15. BigGo 解構與同事串接邊界

### 15.1 目標分層

目前 `packages/market/biggo.ts` 把呼叫、response mapping、filter 與 summary 串在同一個 `research()` 中。建議先解構成以下責任：

```text
readActiveMarketFilterPolicy()
  ↓
buildMarketRetrievalPlan()
  ↓
BigGoClient.search()
  ↓
normalizeBigGoResponse()
  ↓
resolveSourceIdentity()
  ↓
immutableComparableFilter()
  ↓
learnedMarketRanking()
  ↓
priceSummary()
  ↓
MarketResearchResult
```

### 15.2 建議模組

```text
packages/market/
  types.ts
  biggo-client.ts
  biggo-normalize.ts
  source-identity.ts
  comparable-filter.ts
  learned-ranking.ts
  summary.ts
  research.ts
```

同事主要負責：

```text
biggo-client.ts
biggo-normalize.ts
source-identity.ts
```

個人化迭代這邊負責：

```text
learned-ranking.ts
global policy contract
batch feedback aggregation
```

### 15.3 Contract 方向

```ts
export type BigGoSearchRequest = {
  query: string;
  site: "biggo.com.tw";
  region: "tw";
};

export type MarketRetrievalPlan = {
  policyVersion: string | null;
  request: BigGoSearchRequest;
  sourcePriority?: string[];
  sourceQuota?: Record<string, number>;
  queryHints?: string[];
  appliedCapabilities: string[];
};

export type NormalizedMarketItem = {
  title: string;
  price: number;
  currency: string;
  url: string;
  min: number | null;
  max: number | null;
  sourceKey?: string;
  priceEvidence?: MarketPriceEvidence;
};

export type MarketPriceEvidence = {
  distribution?: Array<{ percentile: number; price: number }>;
  history?: Array<{ observedAt: string; price: number }>;
  sampleCount?: number;
  basis?: "current_listings" | "historical" | "biggo_aggregate";
};

export type MarketFilterPolicy = {
  version: string | null;
  retrieval?: {
    sourcePriority?: string[];
    sourceQuota?: Record<string, number>;
    queryHints?: string[];
  };
  sourceWeights: Record<string, number>;
  sourceAllowList: string[];
  sourceBlockList: string[];
  maxSourceShare: number | null;
};
```

`sourceKey` 先設為 optional，直到 BigGo 協作者確認它的語意。若 item 是 `affurl` wrapper，不能把 wrapper host 當成原始來源；在未確認前保留 raw URL 並不參與 source preference 聚合。

### 15.4 Filter 分層規則

整體流程分成兩個 policy 套用點：

1. `buildMarketRetrievalPlan()` 在 BigGo 呼叫前，使用 connector capabilities 決定哪些 source priority、quota 或 query hint 可以送出。
2. `learnedMarketRanking()` 在結果回來後，對所有已 normalize 的 item 套用剩餘 source weight、排序與 soft exclusion。

`immutableComparableFilter()` 保留目前的 factual safety 規則：

- 型號與版本。
- 容量或已確認規格。
- 配件／零件／組合商品。
- 商品狀況。
- 幣別與有效價格。
- 多規格價格範圍。
- 重複來源。

`learnedMarketRanking()` 只處理：

- source weight。
- source order。
- soft source exclusion。
- source share limit。

它不能因為 agent policy 而跳過 immutable filter。`priceSummary()` 仍從最終 included items 產生客觀市場摘要。

`priceSummary()` 仍負責從最後的 included items 產生目前的 `low/high/competitive/balanced/premium`，不接 OpenAI，也不把個人偏好混進市場中位數計算。

### 15.5 同事串接完成的定義

BigGo 協作者只要完成以下事項，個人化功能即可接入：

1. `BigGoClient.search()` 回傳可驗證的 raw response。
2. `normalizeBigGoResponse()` 產生穩定的 `NormalizedMarketItem`。
3. 確認 `sourceKey` 是否可靠，或明確標記不可用。
4. 保留目前 `MarketItem` 欄位的相容映射。
5. raw response 失敗與 schema 不符時回傳既有 `AppError` 行為。

個人化程式不需要再理解 BigGo URL、headers、affiliate URL 或 response mapping，只接 normalized market result。
