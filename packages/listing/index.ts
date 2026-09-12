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
  const mark = prefs.emoji === "medium" ? "✨ " : "";
  const intro =
    prefs.tone === "friendly"
      ? `${mark}${p.name}\n商品資訊整理如下。`
      : prefs.tone === "y2k"
        ? `${mark}${p.name} / PRODUCT NOTES`
        : `${mark}${p.name}`;
  const description =
    prefs.length === "concise"
      ? `${intro}\n${lines.join("\n")}`
      : `${intro}\n\n【商品規格】\n${lines.map((l) => `- ${l}`).join("\n")}${p.shipping ? `\n\n【出貨資訊】\n${p.shipping}` : ""}`;
  return { title, description };
}

/** Editable photo-derived preview, never a confirmed or publishable listing. */
export function previewFromAnalysis(p: Product) {
  if (p.analysis?.identityConfidence !== "high_confidence" || !p.analysis.identityEvidence.trim() || !p.name.trim()) return {};
  const title = p.name.startsWith(p.brand) ? p.name : `${p.brand} ${p.name}`.trim();
  return {title:p.title || title, description:p.description || [p.name, ...factualLines(p)].join("\n")};
}
