import type { MarketResearch, Product } from '../contracts';
import { priceSummary, comparisonModel, marketSourceKey, productLink, applyMarketFilterPolicy, type MarketFilterPolicy } from './index';
export async function researchWithFallback(
 p:Product,
 primary:()=>Promise<MarketResearch>,
 secondary:()=>Promise<MarketResearch>,
 policy?:MarketFilterPolicy,
):Promise<MarketResearch> {
 let first:MarketResearch;
 let reason='BigGo 可比價格不足';
 try { first=await primary();if(first.summary) return first; }
 catch { reason='BigGo 查詢失敗';first={query:p.model || p.name,at:new Date().toISOString(),source:'BigGo',conditionBasis:p.condition || '全新',provisional:!p.condition,referenceOnly:!comparisonModel(p),items:[],summary:null}; }
 try {
  const fallback=await secondary();
  const seen=new Set<string>();
  const merged=[...first.items.filter(i=>i.included),...fallback.items,...first.items.filter(i=>!i.included)].filter(i=>{const key=productLink(i.url).split('#')[0];if(seen.has(key))return false;seen.add(key);return true;}).slice(0,50);
  const items=policy?applyMarketFilterPolicy(merged,policy):merged;
  return {...first,items,summary:first.referenceOnly?null:priceSummary(items),source:'BigGo + OpenAI 網頁搜尋',fallback:{status:'completed',reason,source:'OpenAI web_search',at:fallback.at}};
 } catch {
  return {...first,fallback:{status:'failed',reason,source:'OpenAI web_search',at:new Date().toISOString()}};
 }
}
export function citedPriceRows(rows:{title:string;url:string;price:number|null;currency:string;price_text:string}[], sources:string[]) {
 const normalize=(raw:string)=>{try{const u=new URL(raw);if(!['https:','http:'].includes(u.protocol))return '';u.hash='';return u.href;}catch{return '';}};
 const cited=new Set(sources.map(normalize).filter(Boolean));
 return rows.filter(r=>{
  if(!cited.has(normalize(r.url)) || r.price===null || r.price<=0 || !Number.isFinite(r.price) || r.currency!=='TWD')return false;
  if(/\d[\d,]*(?:\.\d+)?\s*[-–—~～至]\s*(?:NT\$)?\s*\d/.test(r.price_text))return false;
  const numbers=r.price_text.replace(/,/g,'').match(/\d+(?:\.\d+)?/g) || [];
  return numbers.some(n=>Number(n)===r.price) && /NT\$|TWD|新[臺台]幣|元/.test(r.price_text);
 }).map(r=>({title:r.title,url:normalize(r.url),price:r.price!,currency:r.currency,min:null,max:null,included:false,reason:'',priceEvidence:r.price_text,priceSource:'OpenAI web_search',sourceKey:marketSourceKey(r.url)}));
}
