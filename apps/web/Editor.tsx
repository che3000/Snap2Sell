"use client";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronRight,
  Sparkles,
  Check,
  Plus,
  Package,
  Save,
  Download,
  SlidersHorizontal,
  CircleHelp,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { missingInformation, emptyProduct } from "@/packages/product";
import { useStudio } from "./useStudio";
import { ProductQuestions } from "./components/ProductQuestions";
import { Settings } from "./components/Settings";
import { PreferencePanel } from "./components/Preferences";
import { ProductInfo } from "./components/ProductInfo";
import { Market } from "./components/Market";
import { Choice } from "./components/Choice";
export default function Editor() {
  const s = useStudio();
  const { p } = s;
  const [tab, setTab] = useState("basic");
  const [review, setReview] = useState(false);
  const missing = missingInformation(p);
  const progress = Math.max(0, Math.round(((11 - missing.length) / 11) * 100));
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: "read_listing_draft",
          description:
            "Read the current unsaved listing and missing fields. Does not save or publish.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw new Error("Expected an empty object");
            return {
              product: latest.current.p,
              missing: missingInformation(latest.current.p),
            };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {}
    return () => lifecycle.abort();
  }, []);
  return (
    <div className="studio">
      <ProductQuestions key={p.id + JSON.stringify(p.analysis?.questions)} s={s}/>
      {p.pendingQuestions && <div className="notice">AI 正等待你補充商品資訊。<button className="secondary" disabled={!!s.busy} onClick={()=>s.setQuestionsOpen(true)}>繼續回答</button></div>}
      <header className="topbar">
        <a className="brand" href="/">
          <span className="logo">
            <Camera size={22} />
          </span>
          Snap2Sell<span className="edition">STUDIO</span>
        </a>
        <span className="store-label">
          我的賣場 <ChevronRight size={14} /> 商品工作台
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Settings s={s} />
        </div>
        <span className="avatar" style={{ marginLeft: 0 }}>
          S
        </span>
      </header>
      <div className="workspace-title">
        <div>
          <div className="eyebrow">商品工作台</div>
          <h1>好商品，值得好好介紹。</h1>
          <p>上傳圖片 → 自動填入資訊 → 核對商品 → 產生文案與匯出。</p>
        </div>
        <button
          className="primary"
          disabled={!!s.busy}
          onClick={() => {
            s.select(emptyProduct(crypto.randomUUID(), p.store));
            setTab("basic");
          }}
        >
          <Plus size={17} />
          新增商品
        </button>
      </div>
      {s.saved.length > 0 && (
        <div className="saved-list">
          <span className="field-help">已儲存草稿</span>
          {s.saved.map((d) => (
            <button
              key={d.id}
              disabled={!!s.busy}
              onClick={() => {
                s.select(d);
                setReview(false);
              }}
            >
              {d.name || "未命名商品"} · v{d.version}
            </button>
          ))}
        </div>
      )}
      {s.message && (
        <div role="status" className={`toast-status ${s.error ? "error" : ""}`}>
          {s.message}
        </div>
      )}
      <div className="workspace">
        <aside className="optimization">
          <div className="panel-title">
            <Sparkles size={18} />
            <h2>商品優化</h2>
            <span className="badge">AI 助手</span>
          </div>
          <div className="readiness">
            <span>資料完整度</span>
            <strong>
              {progress}
              <small>%</small>
            </strong>
            <div className="meter">
              <i style={{ width: `${progress}%` }} />
            </div>
            <p>補齊關鍵資訊，讓買家更放心。</p>
          </div>
          <div className="check-list">
            {[
              ["商品辨識", p.confirmed],
              ["商品圖片", p.images.length > 0],
              ["商品標題", !!p.title],
              ["商品描述", !!p.description],
              ["銷售資訊", p.price !== null && p.stock !== null],
            ].map(([label, ok]) => (
              <div key={String(label)}>
                <span className={ok ? "check" : "pending"}>
                  {ok ? <Check size={13} /> : <CircleHelp size={13} />}
                </span>
                {label}
                <small>{ok ? "已填寫" : "待補充"}</small>
              </div>
            ))}
          </div>
          <div className="tip">
            <span className="eyebrow">下一步</span>
            <h3>
              {missing.length ? `補上${missing[0]}` : "核對內容，準備匯出"}
            </h3>
            <p>
              {missing.length
                ? "未知資訊不用猜，先完成你知道的部分。"
                : "資料已填齊，請再確認文案與商品事實一致。"}
            </p>
          </div>
          <div className="style-card">
            <SlidersHorizontal size={18} />
            <h3>AI 撰寫風格</h3>
            <p>
              {
                { concise: "精簡", medium: "適中", detailed: "詳細" }[
                  s.override.length || s.prefs.length
                ]
              }{" "}
              ·{" "}
              {
                {
                  professional: "專業",
                  friendly: "親切",
                  y2k: "Y2K",
                  minimalist: "極簡",
                }[s.override.tone || s.prefs.tone]
              }{" "}
              ·{" "}
              {
                { none: "無 Emoji", low: "少 Emoji", medium: "適量 Emoji" }[
                  s.override.emoji || s.prefs.emoji
                ]
              }
            </p>
            <PreferencePanel s={s} />
            <small>重複且一致的修改，才會成為偏好。</small>
          </div>
        </aside>
        <main className="editor">
          <div className="editor-heading">
            <h2>編輯商品</h2>
            <span className="draft">
              草稿{p.version ? ` · v${p.version}` : ""}
            </span>
            <div className="mobile-prefs">
              <PreferencePanel s={s} />
            </div>
          </div>
          <fieldset disabled={!!s.busy} className="editor-fields">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList variant="line" className="editor-tabs">
                {[
                  ["basic", "基本資訊"],
                  ["description", "商品描述"],
                  ["sales", "銷售資訊"],
                  ["shipping", "運費"],
                  ["other", "其他"],
                ].map(([v, t]) => (
                  <TabsTrigger key={v} value={v}>
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="basic">
                <ProductInfo key={p.id} s={s} />
              </TabsContent>
              <TabsContent value="description">
                <section>
                  <h3>商品標題與描述</h3>
                  <p className="field-help">
                    生成後仍是待審核草稿；儲存你的修改，有助調整後續風格。
                  </p>
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={
                        !!s.busy || !p.confirmed || !s.settings.configured
                      }
                      onClick={() => s.generate(true)}
                    >
                      <Sparkles size={16} />
                      {s.busy === "generate" ? "正在產生…" : "AI 產生文案"}
                    </button>
                    <button
                      className="secondary"
                      disabled={!!s.busy || !p.confirmed}
                      onClick={() => s.generate(false)}
                    >
                      依資料整理
                    </button>
                    <PreferencePanel s={s} />
                  </div>
                  {!p.confirmed && (
                    <div className="notice">
                      請先在基本資訊確認商品身分與規格。
                    </div>
                  )}
                  <label>
                    商品標題
                    <input
                      value={p.title}
                      maxLength={300}
                      onChange={(e) => s.update({ title: e.target.value })}
                    />
                    <span className="field-help">
                      {Array.from(p.title).length} 字 ·
                      上架前請依所在地蝦皮規則確認字數限制。
                    </span>
                  </label>
                  <label>
                    商品描述
                    <textarea
                      rows={16}
                      maxLength={10000}
                      value={p.description}
                      onChange={(e) =>
                        s.update({ description: e.target.value })
                      }
                    />
                  </label>
                  <button
                    className="secondary"
                    onClick={() =>
                      s.run("copy", async () => {
                        await navigator.clipboard.writeText(
                          `${p.title}\n\n${p.description}`,
                        );
                        s.notify("已複製標題與描述。");
                      })
                    }
                  >
                    複製文案
                  </button>
                </section>
              </TabsContent>
              <TabsContent value="sales">
                <section>
                  <h3>銷售資訊</h3>
                  <div className="two-col">
                    {p.priceIsSuggested && <p className="field-help">建議售價已自動填入{p.market?.provisional ? "（暫以全新品行情參考）" : ""}，可直接修改。</p>}
                    <label>
                      售價（NT$）
                      <input
                        type="number"
                        min="0"
                        value={p.price ?? ""}
                        onChange={(e) =>
                          s.update({
                            price: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                    <label>
                      庫存
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={p.stock ?? ""}
                        onChange={(e) =>
                          s.update({
                            stock: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    規格選項與配件
                    <textarea
                      placeholder="例如：黑色／白色；包裝配件請依實際內容填寫"
                      value={p.variants}
                      onChange={(e) => s.update({ variants: e.target.value })}
                    />
                  </label>
                  <hr />
                  <Market
                    key={`${p.id}:${p.model}:${p.condition}:${p.attributes["容量"] || ""}`}
                    s={s}
                  />
                </section>
              </TabsContent>
              <TabsContent value="shipping">
                <section>
                  <h3>出貨與運費</h3>
                  <p className="field-help">
                    請依實際物流方式填寫，不自動承諾現貨、出貨地或到貨時間。
                  </p>
                  <label>
                    出貨與運費說明
                    <textarea
                      rows={6}
                      placeholder="例如：物流方式、運費、處理天數"
                      value={p.shipping}
                      onChange={(e) => s.update({ shipping: e.target.value })}
                    />
                  </label>
                </section>
              </TabsContent>
              <TabsContent value="other">
                <section>
                  <label>
                    賣場
                    <Choice
                      label="賣場"
                      value={p.store}
                      onChange={(v) => s.update({ store: v })}
                      options={[
                        ["main", "主要賣場"],
                        ["second", "第二賣場"],
                      ]}
                    />
                  </label>
                  <label>
                    保固資訊
                    <textarea
                      value={p.warranty}
                      placeholder="沒有確認的保固承諾請留空"
                      onChange={(e) => s.update({ warranty: e.target.value })}
                    />
                  </label>
                  <h3>上架前檢查</h3>
                  <p className="field-help">
                    檢查資料完整度；不會自動發布至蝦皮。
                  </p>
                  <div className="actions">
                    <button
                      className="secondary"
                      onClick={() => setReview(true)}
                    >
                      檢查商品
                    </button>
                  </div>
                  {review && (
                    <>
                      {missing.length ? (
                        <ul className="review-list">
                          {missing.map((m) => (
                            <li key={m}>待補：{m}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="notice">
                          必要欄位已填寫。請核對真實性、分類與蝦皮規則後，複製文案或匯出草稿。
                        </div>
                      )}
                    </>
                  )}
                  <button className="secondary" onClick={s.exportDraft}>
                    <Download size={16} />
                    匯出草稿 JSON
                  </button>
                </section>
              </TabsContent>
            </Tabs>
          </fieldset>
          <footer className="editor-footer">
            <span>
              {s.busy
                ? "處理中…"
                : s.dirty
                  ? "有尚未儲存的修改"
                  : p.version
                    ? "草稿已儲存"
                    : "尚未儲存"}
              {!s.loaded ? " · 正在連接資料庫" : ""}
            </span>
            <button
              className="secondary"
              disabled={!!s.busy || !s.loaded}
              onClick={s.save}
            >
              <Save size={16} />
              儲存草稿
            </button>
          </footer>
        </main>
        <aside className="preview">
          <div className="panel-title">
            <h2>商品預覽</h2>
            <span className="draft">即時更新</span>
          </div>
          <p className="preview-sub">買家看到的樣子</p>
          <div className="preview-card">
            <div className="preview-image">
              {p.images.length ? (
                <img
                  src={`/api/images/${p.images[0].id}`}
                  alt={p.name || "商品主圖"}
                />
              ) : (
                <>
                  <Package size={48} strokeWidth={1} />
                  <span>等待你的商品照片</span>
                </>
              )}
            </div>
            <div className="preview-body">
              <span className="platform">蝦皮商品頁預覽</span>
              <h3>{p.title || p.name || "你的商品名稱"}</h3>
              <div className="price">
                {p.price !== null
                  ? `NT$${p.price.toLocaleString()}`
                  : "售價待設定"}
              </div>
              {p.priceIsSuggested && <p className="field-help">BigGo 建議價{p.market?.provisional ? " · 全新品行情參考，商品狀況待確認" : " · 待你核對"}</p>}
              <div className="preview-meta">
                <span>{p.condition || "狀況待確認"}</span>
                <span>庫存 {p.stock ?? "—"}</span>
              </div>
              <hr />
              <p className="description-preview">
                {p.description ||
                  "完成商品資訊後，在「商品描述」產生文案，這裡會即時更新。"}
              </p>
            </div>
          </div>
          <div className="quality-note">
            <Check size={16} />
            <p>
              只寫有依據的商品資訊。
              <br />
              <small>未知規格保留待確認，不自動猜測。</small>
            </p>
          </div>
          <button className="secondary export-button" onClick={s.exportDraft}>
            <Download size={16} />
            匯出商品草稿
          </button>
          <p className="field-help" style={{ marginTop: 8 }}>
            通用 JSON，非蝦皮批次匯入格式。
          </p>
        </aside>
      </div>
    </div>
  );
}
