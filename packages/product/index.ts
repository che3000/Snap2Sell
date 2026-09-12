import type { Product, AnalysisResult } from "../contracts";
export function missingInformation(p: Product) {
  return [
    ...(!p.name.trim() ? ["商品名稱"] : []),
    ...(!p.model.trim() ? ["型號"] : []),
    ...(!p.category.trim() ? ["分類"] : []),
    ...(!p.confirmed ? ["商品身分確認"] : []),
    ...(!p.condition ? ["商品狀況"] : []),
    ...(!p.images.length ? ["商品照片"] : []),
    ...(p.price === null || p.price <= 0 ? ["售價"] : []),
    ...(p.stock === null ? ["庫存"] : []),
    ...(!p.shipping.trim() ? ["出貨資訊"] : []),
    ...(!p.title.trim() ? ["商品標題"] : []),
    ...(!p.description.trim() ? ["商品描述"] : []),
  ];
}
export function factualLines(p: Product) {
  return Object.entries({
    品牌: p.brand,
    型號: p.model,
    ...p.attributes,
    商品狀況: p.condition,
    規格選項: p.variants,
    保固: p.warranty,
  })
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k}：${v}`);
}

export function emptyProduct(id: string, store = "main"): Product {
  return { id, store, name:"", brand:"", model:"", category:"", condition:"",
    attributes:{}, title:"", description:"", price:null, stock:null, shipping:"",
    warranty:"", variants:"", images:[], confirmed:false, version:0 };
}
/** Fill empty fields only. A photo cannot establish price, stock or seller promises. */
export function applyAnalysis(p: Product, analysis: AnalysisResult): Product {
  const next = { ...p, attributes: { ...p.attributes }, analysis, confirmed: false };
  if (analysis.identityConfidence === "high_confidence" && analysis.identityEvidence.trim()) {
    for (const key of ["name", "brand", "model", "category"] as const) {
      if (!next[key].trim()) next[key] = analysis[key].trim();
    }
  }
  if (!next.name.trim() && analysis.identityEvidence.trim() && analysis.identityConfidence === "probable" && analysis.name.trim()) {
    next.name = `${analysis.name.trim()}（AI 候選，待確認）`;
  }
  if (!next.name.trim() && analysis.category.trim()) next.name = analysis.category.trim();
  if (!next.category.trim() && analysis.category.trim()) next.category = analysis.category.trim();
  const reserved = /^(商品名稱|名稱|品牌|型號|商品分類|分類|商品狀況|狀況|售價|價格|庫存|數量|運費|出貨資訊|保固|保固資訊|真偽|認證|現貨)$/;
  for (const observation of analysis.observations) {
    const key = observation.label.trim();
    if (observation.confidence !== "high_confidence" || !observation.evidence.trim() ||
        !observation.value.trim() || reserved.test(key) || ["__proto__", "constructor", "prototype"].includes(key)) continue;
    if (!next.attributes[key]?.trim()) next.attributes[key] = observation.value.trim();
  }
  return next;
}

export const conditionQuestion = "這件商品是全新、拆封未使用，還是二手？";
export function minimalQuestions(p: Product) {
  return p.condition.trim() ? [] : [conditionQuestion];
}

/** Uncertain phone generations are not usable identity candidates for pricing. */
export function normalizeAnalysis(a: AnalysisResult): AnalysisResult {
  if (a.identityConfidence !== "high_confidence" && /iphone/i.test(a.name + " " + a.model)) {
    return {...a, name:"Apple iPhone 智慧型手機", model:"", identityEvidence:"外觀辨識為 Apple iPhone 系列候選；照片不足以確認代數、Plus／Pro 版本或容量。"};
  }
  return a;
}
