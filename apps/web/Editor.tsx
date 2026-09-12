"use client";
import { useEffect, useRef, useState } from "react";
import {
  ShoppingBag,
  ChevronRight,
  Check,
  ChevronDown,
  ImageIcon,
  Lightbulb,
  Download,
  Package,
} from "lucide-react";
import { useStudio } from "./useStudio";
import { emptyProduct, missingInformation } from "@/packages/product";
import { Settings } from "./components/Settings";
import { PreferencePanel } from "./components/Preferences";
import { ProductQuestions } from "./components/ProductQuestions";
import { SellerForm, sellerSections } from "./components/SellerForm";
export default function Editor() {
  const s = useStudio(),
    p = s.p;
  const [active, setActive] = useState("basic");
  const jump = (id: string) => {
    setActive(id);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const found = entries.find((e) => e.isIntersecting);
        if (found) setActive(found.target.id);
      },
      { rootMargin: "-130px 0px -65% 0px" },
    );
    sellerSections.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  const checks = [
    ["至少 10 個字", p.name.length >= 10],
    ["無誇大用詞", !!p.name && !/最強|第一|保證有效/.test(p.name)],
    ["包含商品／品牌名稱", !!p.name],
  ] as const;
  return (
    <div className="seller-page">
      <ProductQuestions
        key={p.id + JSON.stringify(p.analysis?.questions)}
        s={s}
      />
      <header className="seller-header">
        <a href="/" className="seller-logo" aria-label="Snap2Sell 首頁">
          <ShoppingBag size={27} />
        </a>
        <div className="seller-breadcrumb">
          <span>首頁</span>
          <ChevronRight size={15} />
          <button
            onClick={() =>
              document
                .getElementById("seller-drafts")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            我的商品
          </button>
          <ChevronRight size={15} />
          <span>新增商品</span>
        </div>
        <span className="seller-test-label">Snap2Sell 測試工作台</span>
        <div className="seller-account">
          <Settings s={s} />
        </div>
      </header>
      <div className="seller-layout">
        <aside className="seller-optimization">
          <div className="seller-optimization-main">
            <h3>商品優化建議</h3>
            <div className="seller-traffic">
              <div>
                提升流量<span>○</span>標準
              </div>
              <div>
                更多流量<span>○</span>非常好
              </div>
            </div>
            <h4>
              建議優化 <ChevronDown size={14} />
            </h4>
            <button onClick={() => jump("basic")}>
              圖片 <span>{Math.min(p.images.length, 4)} / 4⌄</span>
            </button>
            <button onClick={() => jump("basic")}>
              標題 <span>{checks.filter((x) => x[1]).length} / 3⌃</span>
            </button>
            {checks.map(([text, ok]) => (
              <p className="seller-check" key={text}>
                <span className={ok ? "ok" : ""}>
                  <Check size={11} />
                </span>
                {text}
              </p>
            ))}
            <button onClick={() => jump("description")}>
              描述 <span>{p.description ? 1 : 0} / 1⌄</span>
            </button>
            <h4>進階優化</h4>
            <p className="seller-check">
              <span className={p.seller?.video ? "ok" : ""}>
                <Check size={11} />
              </span>
              上傳影片
            </p>
          </div>
          <div className="seller-tip">
            <Lightbulb size={44} />
            <h3>小撇步</h3>
            <h4>類別</h4>
            <p>• 請選擇最適合的商品分類，避免與商品本身不相符的類別。</p>
            <p>• 系統會依據商品名稱、圖片與辨識內容提供資料供你核對。</p>
            <p>• 上傳照片後，只需選擇商品新舊狀況，即可自動整理。</p>
            <PreferencePanel s={s} />
          </div>
        </aside>
        <main className="seller-main">
          <nav className="seller-nav" aria-label="商品表單章節">
            {sellerSections.map(([id, title]) => (
              <button
                className={active === id ? "active" : ""}
                key={id}
                onClick={() => jump(id)}
              >
                {title}
              </button>
            ))}
          </nav>
          <div id="seller-drafts" className="seller-drafts">
            <button
              className="secondary"
              disabled={!!s.busy}
              onClick={() => {
                s.select(emptyProduct(crypto.randomUUID(), p.store));
                jump("basic");
              }}
            >
              ＋新增商品
            </button>
            {s.saved.map((d) => (
              <button
                key={d.id}
                disabled={!!s.busy}
                onClick={() => s.select(d)}
              >
                {d.name || "未命名商品"}
              </button>
            ))}
          </div>
          {s.message && (
            <div
              className={"toast-status " + (s.error ? "error" : "")}
              role="status"
            >
              {s.message}
            </div>
          )}
          {p.pendingQuestions && (
            <div className="notice">
              請選擇商品狀況，以完成自動整理。
              <button
                className="secondary"
                disabled={!!s.busy}
                onClick={() => s.setQuestionsOpen(true)}
              >
                繼續
              </button>
            </div>
          )}
          {p.market && (
            <button
              className="seller-market-status"
              onClick={() => jump("sales")}
            >
              BigGo 已搜尋「{p.market.query}」· {p.market.items.length}{" "}
              筆結果　查看行情 ›
            </button>
          )}
          <SellerForm key={p.id} s={s} />
        </main>
        <aside className="seller-preview">
          <h3>預覽</h3>
          <p>商品詳情</p>
          <div className="seller-phone">
            <div className="seller-preview-image">
              {p.images[0] ? (
                <img
                  src={"/api/images/" + p.images[0].id}
                  alt={p.name || "商品主圖"}
                />
              ) : (
                <Package size={40} />
              )}
            </div>
            <p className="seller-variant-count">
              {p.variants ? 1 : 0} 個規格可用
            </p>
            <div className="seller-preview-price">
              {p.price === null ? "--.---" : "NT$" + p.price.toLocaleString()}
            </div>
            {p.priceIsSuggested && <small>BigGo 建議價 · 待核對</small>}
            <h4>{p.name || "商品名稱"}</h4>
            <div className="seller-shop">
              <span>S</span>我的賣場
            </div>
            <h4>屬性</h4>
            <dl>
              {Object.entries({
                品牌: p.brand,
                型號: p.model,
                商品狀況: p.condition,
                ...p.attributes,
              })
                .filter(([, v]) => v)
                .slice(0, 6)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            <h4>商品描述</h4>
            <p className="seller-preview-description">
              {p.description || "尚未填寫商品描述"}
            </p>
          </div>
          <p className="seller-hint">預覽僅供參考，實際頁面依上架平台為準。</p>
          <button className="secondary" onClick={s.exportDraft}>
            <Download size={14} />
            匯出草稿
          </button>
        </aside>
      </div>
      <footer className="seller-footer">
        <span>
          {s.busy
            ? "處理中…"
            : s.dirty
              ? "有尚未儲存的修改"
              : p.version
                ? "草稿已儲存"
                : "新增商品草稿"}
        </span>
        <button
          className="secondary"
          disabled={!!s.busy}
          onClick={() => {
            if (s.dirty && !window.confirm("取消目前編輯並開啟空白商品？"))
              return;
            s.select(emptyProduct(crypto.randomUUID(), p.store));
            jump("basic");
          }}
        >
          取消
        </button>
        <button
          className="primary"
          disabled={!!s.busy || !s.loaded}
          onClick={s.save}
        >
          儲存
        </button>
      </footer>
    </div>
  );
}
