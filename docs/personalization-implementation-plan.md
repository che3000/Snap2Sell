# Snap2Sell 個人化迭代：修改方向與工作切分 v4

## 1. 這版的核心取捨

### Global 層

Global 不做所有人的描述語氣，也不把標題個人化。Global 主要學：

- BigGo 結果的來源品質與來源偏好。
- 可比商品 filter/ranking 的調整方向。
- `profit_first`、`momentum_price`、`traffic_first` 三種價格策略的 market percentile、default/order。
- 標題的 factual structure 與同一商品 identity 下的 title variant 收斂。

### Personal 層

Personal 主要學：

- 使用者偏好的價格選項。
- 使用者描述長度、語氣、Emoji、規格細節與行銷強度。

### 觸發方式

使用者按「儲存草稿」後：

1. 寫入既有 `events`。
2. 同一 transaction 寫入兩個 D1 `learning_queue` jobs：`PERSONAL_PROFILE_UPDATE` 與 `GLOBAL_FEEDBACK`。
3. personal job 立即非同步呼叫 `PersonalProfileAgent`；global job 累積到 `GLOBAL_LEARNING_TRIGGER_COUNT` 才啟動一批 global iteration。
4. 所有 agent proposal 都交給自動化 validator gate，通過後由系統自行套用，不等待人工批准。

這樣可以讓個人偏好即時反映，同時避免單一事件直接改變 global 生產策略。

## 2. 建議 PR 切分

### PR 1：Contracts 與純 domain functions

檔案：

- `packages/contracts/index.ts`
- `packages/preferences/index.ts`
- `packages/market/index.ts`
- `packages/product/index.ts`

新增：

- `MarketSnapshot`。
- `PriceRecommendation`。
- `ListingFeedback`。
- `GlobalPolicy`。
- `MarketPriceEvidence`（optional，只有 BigGo contract 確認後才接入）。
- `canonicalProductKey(product)`。
- `quantile(prices, percentile)` 與 `priceDistribution(items)`。
- `rankPriceOptions(summary, policy, preferences)`。
- 已確認原始來源後的 source key normalization 與 filter reason code；未確認時保留 raw URL，不把 affiliate host 當來源。

規則：

- 純函式不讀 DB、不讀 env、不呼叫 BigGo。
- `summary.balanced` 是客觀 p50，不可被 policy 改寫；三種策略以各自 percentile 從同一批有效價格產生推薦價。
- 標題策略只接受 global structure，不接 personal tone/emoji。
- 描述策略沿用現有 `Preferences`。

### PR 2：D1 schema 與 append-only migration

檔案：

- `db/schema.ts`
- `drizzle/0001_personalization_queue.sql`
- Drizzle metadata

新增資料表：

- `market_snapshots`
- `price_recommendations`
- `learning_queue`
- `learning_batches`
- `global_policies`
- `agent_proposals`
- `personal_profile_versions`
- `policy_evaluations`
- `product_identities`
- `title_variants`

調整：

- `events(kind, at, id)` index。
- `learning_queue` 使用 `task_type`、`scope_key`、`dedupe_key`，同一 event 可分別被 personal 與 global consumer 處理。
- 不修改已部署的 `drizzle/0000_glossy_whizzer.sql`。
- 不把全域資料放入 owner-scoped `preferences`。

### PR 3：Market snapshot 與價格 recommendation

檔案：

- `apps/api/handler.ts`
- `apps/web/components/Market.tsx`
- `apps/web/useStudio.ts`

修改：

1. `POST /api/market` 維持目前 API request，但在 market service 內先讀取 active policy 並建立 `MarketRetrievalPlan`。
2. 只把 BigGo connector 已確認支援的 plan 欄位送入目前 `research(product)` adapter；未支援的 policy 在結果回來後套用。
3. 保存實際回傳的完整 response、policy version 與 applied capabilities。
4. 以 IQR 排除後的有效價格分布，依 global policy 的 percentile 建立 `profit_first/momentum_price/traffic_first` recommendation；`summary.balanced` 保留為客觀 p50。
5. 回傳 `marketSnapshotId`、`priceRecommendationId`。
6. 前端保存 context，save 時送回 IDs。
7. 後端從 D1 snapshot 重新驗證選項與 final price。

這個 PR 不改 BigGo URL、headers、raw response schema，也不加入未確認的歷史趨勢欄位。

### PR 4：Save feedback 與 Personal learning

檔案：

- `apps/api/handler.ts`
- `packages/preferences/index.ts`
- `apps/web/useStudio.ts`

修改：

- save 成功時寫入 `PREFERENCE_OBSERVATION`。
- 同一 transaction 寫入 `LISTING_FEEDBACK`。
- 同一 transaction 建立 `PERSONAL_PROFILE_UPDATE` 與 `GLOBAL_FEEDBACK` jobs。
- 自動學習 evidence 使用 `scope: "seller"`。
- description 沿用現有 diff 作為 evidence，PersonalProfileAgent 每次 save 後立即分析，不使用個人筆數 threshold。
- proposal 通過 confidence、scope、base version、contradiction 與單次變更幅度 gate 後，自動寫入 `personal_profile_versions` active version。
- price 只在有已保存 recommendation 且 strategy 明確時產生 evidence。
- manual price 不強行分類。

目前的 `generations.observed` 可作為第一版去重機制；如果未來允許同一 generation 多次正式送出，再改成獨立 feedback ID。

### PR 5：Queue、personal immediate trigger 與 global threshold trigger

檔案：

- `apps/api/handler.ts`
- `apps/api/storage.ts` 或新的 learning service
- `cloudflare-env.d.ts`
- `.env.example`
- `db/schema.ts`

設定：

```text
GLOBAL_LEARNING_TRIGGER_COUNT=20
PERSONAL_PROFILE_MIN_CONFIDENCE=0.70
PERSONAL_PROFILE_MAX_DIMENSION_CHANGES=2
```

實作方向：

1. save transaction 將 `LISTING_FEEDBACK` event 與兩種 queue job 一起寫入。
2. 以 `dedupe_key = event_id + task_type + scope_key` 防止重複入列。
3. personal job 每次 save 後立即由 worker 非同步消費，不以筆數 threshold 啟動。
4. global job 達到 threshold 時建立一筆 batch request，只取最早的 global jobs。
5. 不在使用者 save request 內執行完整 Agent，避免延遲與部分失敗。
6. 由 scheduled worker、內部 job 或平台 runner 消費 queue。
7. 用 `processing`、`attempts`、`available_at`、`batch_id` 支援重試；personal job 另以 owner scope 序列化。

Cloudflare Queue binding 目前不在專案既有設定中；第一版可使用 D1 queue table，未來若平台提供 Queue binding，再替換 queue adapter，不改 `LISTING_FEEDBACK` contract。

### PR 6：Global filter、pricing policy 與 policy lifecycle

檔案方向：

- `packages/market/index.ts`
- 新增 global policy／learning domain module
- `apps/api` batch orchestration
- `db/schema.ts`

將目前 `filterComparables(items, p)` 的責任拆成：

```text
readActiveMarketFilterPolicy()
buildMarketRetrievalPlan()
BigGoClient.search()
normalizeBigGoResponse()
immutableComparableFilter(items, product)
learnedMarketRanking(items, marketFilterPolicy)
priceSummary(filteredItems)
```

不可學習的型號、容量、配件、狀況、幣別、價格範圍與重複來源規則要固定保留。Global policy 只能改來源權重、來源排序與 soft filter。

`buildMarketRetrievalPlan()` 是 agent policy 與 BigGo connector 之間的隔離層。它只把 BigGo connector 宣告支援的 source priority、quota 或 query hints 送入 request；不支援的欄位改由結果回來後的 `learnedMarketRanking()` 套用。BigGo raw request、response mapping 與 source identity 仍由同事負責確認。

每個 market snapshot 記錄 policy version；每個 filter result 保留 factual reason 與 learned reason 的區別。若 BigGo contract 提供已確認的歷史／分布資料，先 mapping 成 optional `MarketPriceEvidence`，不可讓 agent 直接讀 raw keys。

價格另外由 `GlobalPricingAgent` 處理，不放進 `GlobalMarketFilterAgent`：

```text
referenceMarketMedian = quantile(0.50)
recommendedPrice = quantile(strategy.percentile)
```

三個 strategy 各自保存 percentile：

```json
{
  "profit_first": {"percentile": 0.70},
  "momentum_price": {"percentile": 0.50},
  "traffic_first": {"percentile": 0.30}
}
```

上面是初始範例，不是寫死值。Agent 只提出 percentile patch，validator 檢查 percentile 上下限、策略間最小間距、單次最大變更幅度與樣本數。

### PR 7：BigGo adapter 協作接口

由目前負責 BigGo 的協作者先確認以下事項，再由 market owner 接入：

- 是否能提供穩定 `sourceKey`。
- `MarketItem` 是否需要新增 item/source identifier。
- raw response normalization 的版本。
- 是否能提供歷史價格、價格分布或 sample count 等已確認 keys；若可以，mapping 到 `MarketPriceEvidence`。
- filter policy 應在 adapter 內還是 adapter 外套用。
- historical trend 若要加入，欄位與來源定義是什麼。

在 contract 未確認前，Snap2Sell 只使用既有 `url`、`title`、`price`、`currency`、`min`、`max` 等欄位，不自行假設額外資料。確認後新增欄位也要先進 normalized contract，再交給 pricing agent。

### PR 8：Global title identity 與 variants

檔案：

- `packages/product/index.ts`
- `packages/contracts/index.ts`
- `apps/api/handler.ts`
- `db/schema.ts`

第一期只做：

- confirmed product 的 `canonical_product_id`。
- 保存 generated/final title variant。
- 同 identity 的 shown/accepted/edited 聚合。
- global title structure 統計。

第一期不做：

- 不把其他使用者的 title 直接展示。
- 不用 title 反推 product identity。
- 不套用個人 description style 到 title。
- 不立即用 global variant 替換正式標題。

### PR 9：Agent orchestration 與 policy contracts

新增建議檔案：

```text
apps/api/learning-agent.ts
apps/api/learning-orchestrator.ts
packages/contracts/learning.ts
packages/learning/index.ts
```

Agent 角色：

1. `FeedbackIngestor`：系統服務，寫入事件與 queue。
2. `PersonalProfileAgent`：OpenAI，分析個人價格與 description profile。
3. `GlobalMarketFilterAgent`：OpenAI，分析 source/filter 統計。
4. `GlobalPricingAgent`：OpenAI，分析三種價格策略的 market percentile。
5. `GlobalTitleStructureAgent`：OpenAI，分析 global title structure。
6. `PolicyValidatorPublisher`：deterministic，驗證並發布版本。
7. `BatchOrchestrator`：系統服務，消費 queue 並協調 Agent。

目前不需要導入獨立 Agent SDK。先沿用 `apps/api/openai.ts` 的 Responses API 呼叫方式，在 `learning-agent.ts` 建立 server-side structured-output adapter。

每個 Agent 都必須：

- 使用 strict JSON Schema。
- 只收到自己責任範圍的資料。
- 輸出 proposal，不直接寫 D1。
- 由 validator 自動決定是否進入 rejected、shadow 或 active，不需要人工批准。
- 在 proposal 中回傳 confidence、reason codes 與可追溯的 base version。
- 下一次 batch 讀取已套用 policy 的 evaluation，作為 promote、維持 shadow 或 rollback 的依據。

### PR 10：BigGo adapter 解構與串接

目前 `packages/market/biggo.ts` 的 `research()` 建議拆成：

```text
readActiveMarketFilterPolicy()
buildMarketRetrievalPlan()
BigGoClient.search()
normalizeBigGoResponse()
resolveSourceIdentity()
immutableComparableFilter()
learnedMarketRanking()
priceSummary()
```

同事負責 raw client、response normalization 與 source identity；個人化功能負責 retrieval plan、learned ranking、policy 與 batch feedback。兩邊透過 `NormalizedMarketItem`、`MarketRetrievalPlan`、`MarketFilterPolicy`、`MarketResearchResult` 串接。

注意：目前 adapter 可能優先使用 `affurl`，不能未確認就把 URL host 當成原始購物來源。`sourceKey` 先設 optional，直到 BigGo contract 確認。

在 BigGo 目前接口未確認前，`MarketRetrievalPlan` 必須保留既有 `query/site/region` request 相容性，agent 不得自行假設新的 MCP／HTTP 欄位。

## 3. Global filter 的資料與學習方向

### 3.1 建議訊號

初期 source preference 只能算弱監督，因為目前 UI 沒有明確的「這個來源有用」按鈕。建議先收集：

- source 出現數。
- source 通過 factual filter 的數量。
- source 被納入 summary 的數量。
- 使用該次 recommendation 並成功 save 的次數。
- source 的排除原因分布。

未來若要更準確，再加明確 source feedback event，而不是把 URL 被顯示當成喜歡。

### 3.2 Global policy 更新

batch 先做 deterministic aggregation，再讓 Agent Summary 產生 candidate diff。Agent 只能輸出白名單欄位，例如：

```json
{
  "marketFilter": {
    "sourceWeights": {
      "example.com": 0.12
    },
    "maxSourceShare": 0.5
  },
  "title": {
    "structure": {
      "keepBrand": true,
      "keepModel": true,
      "includeConfirmedVariant": true
    }
  }
}
```

候選策略需經樣本數、信心、單次最大變更幅度與 shadow 檢查後才可 active。

## 4. 標題建議

標題不做個人風格化，建議收斂結構而不是收斂成唯一句子：

```text
canonical_product_id → title_variant_id[]
```

可先統計：

- 品牌是否保留。
- 型號是否保留。
- 容量／版本是否保留。
- 字數長度。
- 分隔符號與括號。
- factual token 是否完整。
- 使用者保存時是否修改。

`canonical_product_id` 使用已確認的 brand、model、identity attributes；`product.id` 仍然只是使用者 draft ID。缺少確認的 brand/model 時不建立 global identity。

## 5. 測試與完成條件

### Domain tests

- 現有 BigGo summary 的 `balanced` 轉成三個價格 strategies。
- 現有 summary 的 `competitive/balanced/premium` 分別維持 p30/p50/p70。
- custom percentile 能從同一批 IQR 排除後的有效價格計算推薦價。
- `reference_balanced` 永遠等於當次 `summary.balanced`。
- 已確認來源的 host normalization 穩定，且 affiliate／無效 URL 不會被誤學成來源。
- factual safety filter 不受 global source policy 關閉。
- global policy 只影響 title structure，不帶入個人 description style。
- legacy inferred description preference 仍符合現有衰減與一致性門檻；active personal profile 不以筆數 threshold 啟動，但仍受自動 gate 控制。
- identity key 對 attribute 順序穩定。
- PersonalProfileAgent 每次 save 都會被建立 job，不受個人筆數 threshold 阻擋。
- personal proposal 通過自動 gate 後更新 active profile；不通過時保留上一版。

### Integration tests

- save 的 draft、events、queue、observed 更新一致。
- owner A 不能讀取 owner B 的 snapshot/recommendation/feedback。
- 同一 event 的同一 task type 不會重複入 queue，但 personal/global jobs 可以各自存在。
- threshold 未達成時不建立 active policy。
- threshold 達成時只取最早的一批，剩餘 queue 保留。
- BigGo retrieval planner 只使用 connector 宣告支援的能力，未支援 policy 會降級到結果 ranking。
- agent proposal 不需人工批准，通過自動 gate 才能影響 active 結果。
- batch 失敗可重試且不遺失資料。
- policy rollback 後下一次 market/generate 使用正確版本。
- optimistic concurrency 409 時不寫入 learning event。

## 6. 建議順序

1. Contracts 與 domain pure functions。
2. D1 tables 與 append-only migration。
3. Market snapshot／price recommendation。
4. Save feedback／personal price and description learning。
5. D1 queue／threshold trigger。
6. Global filter policy／batch lifecycle。
7. BigGo contract 對齊後接入 source policy。
8. Product identity／global title structure／title shadow。
