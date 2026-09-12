"use client";
export function SuggestionCards({label,options,value,onSelect,disabled=false}:{label:string;options:{label:string;text:string}[];value:string;onSelect:(v:string)=>void;disabled?:boolean}) {
 return <div className="suggestions" role="group" aria-label={label}>
  <div className="suggestions-heading"><strong>{label}</strong><span>三個版本 · 點選套用後可編輯</span></div>
  {options.length?<div className="suggestion-grid">{options.map((o,i)=><button type="button" disabled={disabled} key={o.label} className={`suggestion-card ${value===o.text?'is-selected':''}`} aria-pressed={value===o.text} onClick={()=>onSelect(o.text)}><span className="suggestion-label">{i+1} · {o.label}</span><span className="suggestion-text">{o.text}</span><span className="suggestion-action">{value===o.text?'✓ 使用中':'套用這個版本'}</span></button>)}</div>:<p className="field-help">上傳照片或填寫商品名稱後，即可取得三個參考版本。</p>}
 </div>;
}
