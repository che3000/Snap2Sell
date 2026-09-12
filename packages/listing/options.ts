import type { Product } from "../contracts";
/** Keep the source name when applying a suggestion; adopt newly entered or recognized names. */
export function nameSuggestionBase(p: Product, previous: string) {
 if (!previous.trim()) return p.name;
 return listingOptions({...p,name:previous}).names.some(o=>o.text===p.name) ? previous : p.name;
}
export function listingOptions(p: Product) {
 if(!p.name.trim()) return {names:[],descriptions:[]};
 const base=p.name.trim();
 const details=Object.entries(p.attributes).filter(([k,v])=>v.trim() && /顏色|容量|連接類型|耳機類型/.test(k)).slice(0,2).map(([,v])=>v);
 const append=(parts:string[])=>[base,...parts.filter(v=>v && !base.includes(v))].join(' ').slice(0,60);
 const attributes=Object.entries(p.attributes).filter(([,v])=>v.trim());
 const important=attributes.filter(([k])=>/瑕疵|刮|故障|缺|損|維修|功能異常/.test(k));
 const highlights=attributes.filter(([k])=>/容量|顏色|連接|尺寸|耳機類型/.test(k)).slice(0,3);
 const shortFacts=Array.from(new Map([...highlights,...important]).entries());
 const concise=[base,[p.condition,...shortFacts.map(([k,v])=>`${k}：${v}`)].filter(Boolean).join('｜'),p.variants?`可選規格：${p.variants}`:'',p.warranty?`保固：${p.warranty}`:'',p.shipping?`出貨：${p.shipping}`:''].filter(Boolean).join('\n');
 const identity=[p.brand?`品牌：${p.brand}`:'',p.model?`型號：${p.model}`:'',p.condition?`商品狀況：${p.condition}`:''].filter(Boolean);
 const sections=[`【商品】\n${base}`,...(identity.length?[`【基本資料】\n${identity.map(v=>`• ${v}`).join('\n')}`]:[]),...(attributes.length?[`【詳細規格】\n${attributes.map(([k,v])=>`• ${k}：${v}`).join('\n')}`]:[]),...(p.variants?[`【規格選項】\n${p.variants}`]:[]),...(p.warranty?[`【保固說明】\n${p.warranty}`]:[]),...(p.shipping?[`【出貨安排】\n${p.shipping}`]:[])];
 const natural=[`這次提供的是 ${base}。${p.condition?`商品狀況為${p.condition}。`:''}`,
  attributes.length?attributes.map(([k,v])=>`${k}為${v}`).join('，')+'。':'',
  p.variants?`挑選時可參考以下規格選項：${p.variants}。`:'',
  p.warranty?`關於保固：${p.warranty}。`:'',
  p.shipping?`出貨安排如下：${p.shipping}。`:'',
  '下單前，請確認以上規格與商品狀況符合你的需求。'].filter(Boolean).join('\n\n');
 return {
 names:[{label:'精簡辨識',text:base.slice(0,60)},{label:'規格重點',text:details.length?append(details):`【${base}】`.slice(0,60)},{label:'狀況優先',text:(p.condition?`【${p.condition}】${base.replace(`【${p.condition}】`,'')}`:append([p.category])).slice(0,60)}],
 descriptions:[
 {label:'精簡速讀',hint:'用短句集中呈現狀況與關鍵規格',text:concise.slice(0,3000)},
 {label:'完整規格',hint:'分區條列，適合逐項核對商品細節',text:sections.join('\n\n').slice(0,3000)},
 {label:'自然介紹',hint:'以完整段落介紹商品，搭配購買提醒',text:natural.slice(0,3000)}]
 };
}
