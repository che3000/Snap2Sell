// API contract verified against Funmula-Corp/BigGo-MCP-Server product_search service.
import { z } from "zod";
import type { Product } from "../contracts";
import { AppError, readLimited } from "../shared/http";
import { filterComparables, priceSummary } from "./index";
const responseSchema = z.object({
  result: z.boolean().optional(),
  list: z.array(
    z.object({
      title: z.string(),
      price: z.number(),
      currency: z.string().default(""),
      url: z.string().default(""),
      affurl: z.string().nullable().optional(),
      price_range_min: z.unknown(),
      price_range_max: z.unknown(),
    }),
  ),
});
export async function research(p: Product) {
  if (!p.confirmed || !p.model || !p.condition)
    throw new AppError("請先確認商品型號與商品狀況。");
  const query = [p.brand, p.model, p.attributes["容量"]]
    .filter(Boolean)
    .join(" ");
  const response = await fetch(
    `https://api.biggo.com/api/v1/spa/search/${encodeURIComponent(query)}/product`,
    {
      headers: { site: "biggo.com.tw", region: "tw" },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) throw new AppError("BigGo 暫時無法回應，請稍後重試。", 502);
  const result = responseSchema.parse(
    JSON.parse(await readLimited(response, 4_000_000)),
  );
  if (result.result === false) throw new AppError("BigGo 未能完成搜尋。", 502);
  const items = filterComparables(
    result.list
      .slice(0, 50)
      .map((x) => {
        const raw = x.affurl
          ? new URL(x.affurl, "https://biggo.com.tw").href
          : x.url;
        return {
          title: x.title,
          price: x.price,
          currency: x.currency,
          url: /^https?:\/\//.test(raw) ? raw : "",
          min: typeof x.price_range_min === "number" ? x.price_range_min : null,
          max: typeof x.price_range_max === "number" ? x.price_range_max : null,
          reason: "",
          included: false,
        };
      })
      .filter((x) => x.url),
    p,
  );
  return {
    query,
    at: new Date().toISOString(),
    items,
    summary: priceSummary(items),
    source: "BigGo product_search API",
  };
}
