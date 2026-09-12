import type { Product } from "../contracts";
import { factualLines } from "../product";
export function listingOptions(p: Product) {
 if(!p.name.trim()) return {names:[],descriptions:[]};
 const base=p.name.trim();
 const details=Object.entries(p.attributes).filter(([k,v])=>v.trim() && /顏色|容量|連接類型|耳機類型/.test(k)).slice(0,2).map(([,v])=>v);
 const append=(parts:string[])=>[base,...parts.filter(v=>v && !base.includes(v))].join(' ').slice(0,60);
 const lines=factualLines(p);
 const facts=lines.map(l=>`・${l}`).join('\n');
 return {
 names:[{label:'精簡辨識',text:base.slice(0,60)},{label:'規格重點',text:details.length?append(details):`【${base}】`.slice(0,60)},{label:'狀況優先',text:(p.condition?`【${p.condition}】${base.replace(`【${p.condition}】`,'')}`:append([p.category])).slice(0,60)}],
 descriptions:[
 {label:'精簡摘要',text:[base,...lines].join('\n').slice(0,3000)},
 {label:'規格條列',text:[base,'【商品資訊】',facts,...(p.shipping?['【出貨資訊】',p.shipping]:[])].join('\n\n').slice(0,3000)},
 {label:'親切介紹',text:[`這件商品是 ${base}。`,p.condition?`商品狀況：${p.condition}。`:'',lines.filter(l=>!l.startsWith('商品狀況：')).join('\n'),p.shipping?`出貨資訊：${p.shipping}`:''].filter(Boolean).join('\n\n').slice(0,3000)}]
 };
}
