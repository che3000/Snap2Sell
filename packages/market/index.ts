import type { Product } from "../contracts";
export type MarketItem = {
  title: string;
  price: number;
  url: string;
  currency: string;
  min: number | null;
  max: number | null;
  reason: string;
  included: boolean;
};
export function filterComparables(items: MarketItem[], p: Product) {
  const compact = (s: string) => s.toLowerCase().replace(/[\s\-]/g, "");
  const model = compact(p.model);
  const capacity = p.attributes["容量"];
  const seen = new Set<string>();
  return items.map((item) => {
    let reason = "";
    const title = compact(item.title);
    if (!model || !title.includes(model)) reason = "型號不符";
    else if (model === "g304" && /g304x|g304ii|g3042/.test(title))
      reason = "版本不符";
    else if (model === "iphone17" && /iphone17(pro|air|plus)/.test(title))
      reason = "版本不符";
    else if (capacity && !title.includes(compact(capacity)))
      reason = "容量未確認";
    else if (
      /保護[套殼膜]|耳塞|耳帽|收納|替換|充電盒|單耳|左耳|右耳|維修|零件|腳貼|微動|電池蓋|防塵|皮套|空盒|按鍵板|接收器|轉接|貼膜|防滑貼|貼紙|吸汗貼/.test(
        item.title,
      )
    )
      reason = "配件或零件";
    else if (/組合|套組|加購|搭售|綁約|月付|訂金/.test(item.title))
      reason = "組合或非單品價格";
    else if (
      p.condition === "全新" &&
      /二手|中古|福利|整新|展示|拆封/.test(item.title)
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
    else if (seen.has(item.url)) reason = "重複來源";
    seen.add(item.url);
    return { ...item, included: !reason, reason };
  });
}
export function priceSummary(items: MarketItem[]) {
  let included = items.filter((x) => x.included);
  if (included.length < 3) return null;
  const sorted = included.map((x) => x.price).sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.floor((sorted.length - 1) * f)];
  const iqr = q(0.75) - q(0.25);
  if (iqr > 0)
    included = included.filter(
      (x) => x.price >= q(0.25) - 1.5 * iqr && x.price <= q(0.75) + 1.5 * iqr,
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
      .filter((x) => x.included && !included.includes(x))
      .map((x) => x.url),
  };
}
