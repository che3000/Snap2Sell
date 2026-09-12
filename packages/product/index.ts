import type { Product } from "../contracts";
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
