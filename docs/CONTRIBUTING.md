# 團隊協作規則

1. 一個 PR 聚焦一個功能模組；跨模組先確定 contracts，再由使用端接入。
2. 前端、API、商品／文案、偏好學習、市場研究、資料庫可由不同人分工。
3. 共用 UI 使用既有 primitive，外觀在呼叫端組合；不要修改 vendored UI 來加入業務行為。
4. 不把 API Key、資料庫備份、上傳圖片、使用者資料放進 Git 或測試 fixture。
5. DB schema 變更須附 migration；已套用的 migration 只能向後新增。
6. 變更必須通過 typecheck 與相關 domain tests。涉及權限、儲存、版本衝突與設定須跑本機 integration tests。
7. PR 請說明問題、可見行為、模組契約變化與測試。不要重排其他模組的檔案。
8. `.github/CODEOWNERS` 是待團隊填入實際 GitHub 帳號的責任範本。尚未取得成員帳號，所以不捏造 owner，也不宣稱已啟用 reviewer enforcement。

建議負責範圍：frontend→apps/web、app/globals.css；backend→apps/api、app/api；domain→packages/product、packages/listing；personalization→packages/preferences；market→packages/market；platform→db、drizzle、build；contracts 的變更由受影響模組共同審查。
