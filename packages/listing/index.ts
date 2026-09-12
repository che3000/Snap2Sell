import type { Product, Preferences } from "../contracts";
import { factualLines } from "../product";
export function generateListing(p: Product, prefs: Preferences) {
  if (!p.confirmed || !p.name.trim())
    throw new Error("請先確認商品名稱與型號。");
  const name = p.name.startsWith(p.brand)
    ? p.name
    : `${p.brand} ${p.name}`.trim();
  const title =
    prefs.titleFormat === "brackets" && p.brand
      ? `【${p.brand}】${p.name.replace(p.brand, "").trim()}`
      : name;
  const lines = factualLines(p);
  const emoji = (kind: "greeting" | "title" | "section" | "cta") => {
    if (prefs.emoji === "none" || prefs.emoji === "low") return "";
    if (prefs.emoji === "medium") return kind === "title" ? "✨ " : "";
    return { greeting: "👋✨ ", title: "📦 ", section: "📋 ", cta: "🛒 " }[kind];
  };
  const greeting =
    prefs.greeting === "welcoming"
      ? `${emoji("greeting")}嗨～歡迎來看看！`
      : prefs.greeting === "brief"
        ? `${emoji("greeting")}你好，歡迎來看看。`
        : "";
  const introText =
    prefs.tone === "enthusiastic"
      ? "很開心為你整理商品資訊，喜歡的話歡迎看看！"
      : prefs.tone === "friendly"
        ? "商品資訊整理如下。"
        : prefs.warmth === "high"
          ? "商品資訊整理如下，歡迎參考看看。"
        : prefs.tone === "y2k"
          ? "/ PRODUCT NOTES"
          : "";
  const intro = [greeting, `${emoji("title")}${p.name}`, introText]
    .filter(Boolean)
    .join("\n");
  const formattedLines =
    prefs.format === "paragraph"
      ? lines.join("；")
      : prefs.format === "bullets"
        ? lines.map((line) => `• ${line}`).join("\n")
        : `【${emoji("section")}商品規格】\n${lines.map((line) => `- ${line}`).join("\n")}`;
  const body =
    prefs.length === "concise"
      ? `${intro}\n${formattedLines}`
      : `${intro}\n\n${formattedLines}${p.shipping ? `\n\n【出貨資訊】\n${p.shipping}` : ""}`;
  const cta =
    prefs.cta === "soft"
      ? "\n\n歡迎確認規格與商品狀況後再下單。"
      : prefs.cta === "direct"
        ? `\n\n${emoji("cta")}喜歡的話歡迎直接下單！`
        : "";
  const description = `${body}${cta}`;
  return { title, description };
}

/** Editable photo-derived preview, never a confirmed or publishable listing. */
export function previewFromAnalysis(p: Product) {
  if (!p.analysis?.identityEvidence.trim() || !p.name.trim()) return {};
  const title = p.name.startsWith(p.brand) ? p.name : `${p.brand} ${p.name}`.trim();
  return {title:p.title || title, description:p.description || [p.name, ...factualLines(p)].join("\n")};
}
