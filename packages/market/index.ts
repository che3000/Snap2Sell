import type { Product, MarketResearch } from "../contracts";
export type MarketItem = {
  title: string;
  price: number;
  url: string;
  currency: string;
  min: number | null;
  max: number | null;
  reason: string;
  included: boolean;
  manualExcluded?: boolean;
  manualIncluded?: boolean;
};
const compact = (s: string) => s.toLowerCase().replace(/pro\s*[（(]?(\d+)\s*代?[）)]?/g, "pro$1").replace(/[\s\-]/g, "");
/** Resolve explicit model names, never promote an AI-labelled candidate to confirmed identity. */
export function comparisonModel(p: Product) {
  if (p.model.trim()) return p.model.trim();
  if (/候選|待確認|可能|疑似/.test(p.name)) return "";
  const matches = p.name.match(/airpods\s*pro\s*[（(]?\d+\s*代?[）)]?|iphone\s*\d+(?:\s*(?:pro\s*max|pro|plus|air))?|g304(?:x|ii|2)?/gi) || [];
  return matches.length === 1 ? matches[0].trim() : "";
}
function sourceKey(raw: string) {
  try {
    const u = new URL(raw);
    if (u.hostname === "biggo.com.tw" && u.searchParams.has("i") && u.searchParams.has("id")) return `${u.searchParams.get("i")}:${u.searchParams.get("id")}`;
    return raw;
  } catch { return raw; }
}
export function filterComparables(items: MarketItem[], p: Product) {
  const model = compact(comparisonModel(p));
  const capacity = p.attributes["容量"];
  const seen = new Set<string>();
  return items.map((item) => {
    let reason = "";
    const title = compact(item.title);
    if (!model) reason = "商品型號尚未確認";
    else if (!title.includes(model)) reason = "型號不符";
    else if (model === "g304" && /g304x|g304ii|g3042/.test(title))
      reason = "版本不符";
    else if (model === "iphone17" && /iphone17(pro|air|plus)/.test(title))
      reason = "版本不符";
    else if (capacity && !title.includes(compact(capacity)))
      reason = "容量未確認";
    else if (
      /保護[套殼膜]|耳塞|耳帽|收納|替換|單賣充電盒|充電盒單售|單耳|左耳|右耳|維修|零件|腳貼|微動|電池蓋|防塵|皮套|空盒|按鍵板|接收器|轉接|貼膜|防滑貼|貼紙|吸汗貼/.test(
        item.title,
      )
    )
      reason = "配件或零件";
    else if (/組合|套組|超值組|加購|搭售|綁約|月付|訂金/.test(item.title))
      reason = "組合或非單品價格";
    else if (
      p.condition === "全新" &&
      /二手|中古|福利|整新|展示|(?<!未)拆封/.test(item.title)
    )
      reason = "商品狀況不同";
    else if (p.condition === "拆封未使用" && !/拆封未使用|全新拆封/.test(item.title))
      reason = "商品狀況未確認";
    else if (p.condition === "二手" && !/二手|中古/.test(item.title))
      reason = "商品狀況未確認";
    else if (!Number.isFinite(item.price) || item.price <= 0)
      reason = "價格無效";
    else if (!["TWD", "NTD", "NT$"].includes(item.currency))
      reason = "幣別未確認";
    else if (item.min && item.max && item.min !== item.max)
      reason = "多規格價格範圍";
    else if (seen.has(sourceKey(item.url))) reason = "重複來源";
    seen.add(sourceKey(item.url));
    return { ...item, included: !reason, reason };
  });
}
export function priceSummary(items: MarketItem[]) {
  let included = items.filter((x) => (x.manualIncluded ?? (x.included && !x.manualExcluded)) && Number.isFinite(x.price) && x.price > 0 && ["TWD","NTD","NT$"].includes(x.currency));
  if (included.length < 3) return null;
  const sorted = included.map((x) => x.price).sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.floor((sorted.length - 1) * f)];
  const iqr = q(0.75) - q(0.25);
  if (iqr > 0)
    included = included.filter(
      (x) => x.manualIncluded === true || (x.price >= q(0.25) - 1.5 * iqr && x.price <= q(0.75) + 1.5 * iqr),
    );
  if (included.length < 3) return null;
  const prices = included.map((x) => x.price).sort((a, b) => a - b);
  return {
    count: prices.length,
    low: prices[0],
    high: prices[prices.length - 1],
    competitive: prices[Math.floor((prices.length - 1) * 0.3)],
    balanced: prices[Math.floor((prices.length - 1) * 0.5)],
    premium: prices[Math.floor((prices.length - 1) * 0.7)],
    outliers: items
      .filter((x) => (x.manualIncluded ?? (x.included && !x.manualExcluded)) && !included.includes(x))
      .map((x) => x.url),
  };
}

/** Manual exclusions supplement automatic filters; restoring never bypasses those filters. */
export function toggleMarketExclusion(market: MarketResearch, index: number): MarketResearch {
 if (!market.items[index]) return market;
 const items=market.items.map((item,i)=>i===index?{...item,manualExcluded:!item.manualExcluded}:item);
 return {...market,items,summary:market.referenceOnly?null:priceSummary(items)};
}

export function setMarketInclusion(market: MarketResearch, index:number, include:boolean):MarketResearch {
 const items=market.items.map((item,i)=>i===index?{...item,manualIncluded:include,manualExcluded:!include}:item);
 const eligible=market.referenceOnly?items.filter(i=>i.manualIncluded===true):items;
 return {...market,items,summary:priceSummary(eligible)};
}
export function marketItemIncluded(market:MarketResearch,item:MarketItem) {
 return item.manualIncluded ?? (!item.manualExcluded && item.included && !market.summary?.outliers.includes(item.url));
}
export function marketInputKey(p:Product) {
 return JSON.stringify([p.id,p.name,p.brand,p.model,p.category,p.condition,p.attributes]);
}

export function quoteMarketQuery(query:string) {
 const cleaned=query.replace(/["“”]/g,"").trim().replace(/\s+/g," ");
 return cleaned ? `"${cleaned}"` : "";
}
