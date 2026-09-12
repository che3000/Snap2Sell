# Snap2Sell

繁體中文蝦皮商品編輯工作台。支援圖片上傳、OpenAI 圖片辨識與文案、BigGo 市場研究、持久化草稿、多範圍風格偏好及保守的修改學習。

## 開發

Node.js >= 22.13。執行 `npm run install:ci`、`npm run dev`。本機網址由終端顯示，首頁會經過本機 Sites 模擬登入。正式環境使用 Sites 身分驗證，資料按使用者隔離。請勿在自行部署時直接信任外部可偽造的 `oai-authenticated-user-id`；需接入可信任驗證代理。

- `npm run typecheck`：TypeScript 檢查。
- `npm test`：偏好、商品事實、比價篩選等領域測試。
- `python3 tests/integration.py`：僅針對 localhost 的整合測試；會建立測試草稿／照片、寫入並移除假的測試金鑰。不得指向正式環境。
- `npm run build`：產生 Worker 與靜態資產。
- `npm run db:generate`：產生資料庫 migration。

初次本機啟動需先 build，再執行：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_glossy_whizzer.sql
```

只套用尚未執行的 migration；正式部署由 Sites 執行 migration。正式已套用的 migration 不得修改。

## 模組界線

| 路徑 | 責任 |
|---|---|
| `app/` | 框架路由、登入入口、全站樣式；不放業務規則 |
| `apps/web/` | React 編輯器、畫面狀態、API client |
| `apps/web/components/` | 圖片與商品資料、偏好、服務設定、市場價格等獨立功能 |
| `apps/api/` | HTTP orchestration、使用者授權、D1/R2、AI adapter、加密 |
| `packages/contracts/` | Zod 資料契約、型別、允許的偏好值 |
| `packages/product/` | 商品事實、缺漏檢查 |
| `packages/listing/` | 根據確認資料產生文案；不得連線或讀取資料庫 |
| `packages/preferences/` | 範圍優先權、修改比較、衰減、保守學習 |
| `packages/market/` | BigGo adapter、可比性判斷、客觀分位數 |
| `packages/shared/` | 有上限的 HTTP 讀取與共用錯誤 |
| `components/ui/` | 已提供的 UI primitive，不混入業務邏輯 |
| `fixtures/products/` | 三件使用者指定範例，未查證規格留空 |
| `db/`, `drizzle/` | schema 與版本化 migration |

領域模組不得引用 `apps/` 或 `app/`。前端不得引用 DB、金鑰模組或後端 adapter。新增 API 先更新共用契約與測試。多人協作請參閱 `docs/CONTRIBUTING.md`。

## 服務設定與部署

正式環境需要 secret `CREDENTIAL_ENCRYPTION_KEY`：32 隨機 bytes 的 64 位 hex 字串。僅透過部署環境設定，絕不提交。更換此 master key 前，須先遷移既有加密金鑰，否則舊金鑰無法解密。開發環境放 `.env.local`；範本在 `.env.example`。

使用者透過畫面「服務設定」填入自己的 OpenAI API Key 與可用模型；以 AES-256-GCM 加密、owner ID 作為 AAD 保存於 D1。讀取 API 僅回傳設定狀態及模型，不回傳明文或密文。移除金鑰即刪除此帳戶 credential。模型預設 `gpt-4.1-mini`，使用 Responses API、`store:false`、JSON Schema 輸出。未提供真實金鑰前，無法完成真實 OpenAI 端對端驗證。

BigGo 依照 https://github.com/Funmula-Corp/BigGo-MCP-Server 的 `product_search` HTTPS API 實作，TW 地區。未在 Worker 執行 Python/stdio MCP；此 adapter 使用同一個搜尋服務，因此不用另架 Python 服務。API 不需要 specification search 的 client credentials。結果含查詢、時間、價格、來源、排除原因；不足 3 筆不估價。來源標題與價格仍須人工核對。

Sites 專案 ID 與邏輯 DB/BUCKET 位於 `.openai/hosting.json`。發布流程：驗證 → build → commit/push 同一份 source → package → save version → private deploy → 查詢部署完成。網站預設私人存取，不自動擴大權限。

## 資料與學習

草稿採樂觀版本檢查，衝突回傳 409；不覆蓋另一視窗的更新。跨商品切換保留尚未儲存的記憶體草稿，離開頁面會提醒；跨裝置持久化需按「儲存草稿」。圖片二進位存 R2，metadata 存 D1，每張最多 5 MB，最多 9 張；AI 一次分析前 3 張。移除商品中的照片參照不立即刪除 blob，避免其他草稿參照失效。

偏好順序：本次設定 > 賣場分類 > 賣場 > 使用者 > 預設。明確設定立即生效。自動學習目前支援描述縮短、Emoji 增減、標題括號移除；需至少 3 件不同商品、80% 一致性、足夠近期權重，30 天半衰期。定價與圖片顺序目前可手動調整；未把單次行為推論為長期偏好。所有文案皆需賣家審核，不保證模型永不產生錯誤。

提供通用 JSON 草稿與文案複製；沒有串接蝦皮賣家授權或自動發布，JSON 不是蝦皮批次上傳範本。運費、規格選項為文字欄位，實際平台物流／多規格 SKU 對接需蝦皮 API 契約。開發協作透過模組與 Git；網站內尚無邀請成員、共同店舖權限或即時多人共同編輯。
