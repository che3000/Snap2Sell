"use client";
import { useState } from "react";
export function AttributeSelect({label,value,options=[],onChange}:{label:string;value:string;options?:string[];onChange:(v:string)=>void}) {
 const [custom,setCustom]=useState(false);
 const values=Array.from(new Set([...options,...(value?[value]:[])]));
 return <div><select aria-label={label} value={custom?"__custom__":value} onChange={e=>{if(e.target.value==='__custom__')setCustom(true);else{setCustom(false);onChange(e.target.value);}}}>
   <option value="">請選擇／尚未確認</option>{values.map(v=><option key={v}>{v}</option>)}<option value="__custom__">自行填寫…</option>
 </select>{custom && <input autoFocus aria-label={`${label}自訂值`} value={value} onChange={e=>onChange(e.target.value)} placeholder={`填寫${label}`} />}</div>;
}
