"use client";
import {useRef,useState} from 'react';
import type {Product} from '@/packages/contracts';
import {shopeeConsoleScript} from '@/packages/shopee/console';
export function ShopeeConsoleExport({product,disabled}:{product:Product;disabled:boolean}) {
 const dialog=useRef<HTMLDialogElement>(null), area=useRef<HTMLTextAreaElement>(null);
 const [script,setScript]=useState(''),[message,setMessage]=useState('');
 return <>
  <button className="secondary" disabled={disabled || !(product.name||product.title)} onClick={()=>{setScript(shopeeConsoleScript(product));setMessage('');dialog.current?.showModal();}}>產生蝦皮 Console 程式</button>
  <dialog ref={dialog} style={{width:'min(860px, 92vw)',maxHeight:'90vh',padding:24,border:'1px solid #ddd',borderRadius:12}} aria-labelledby="shopee-console-title">
   <h3 id="shopee-console-title">貼到蝦皮測試</h3>
   <p>1. 複製程式。2. 開啟蝦皮新增商品頁，先選類別並收起下拉選單。3. 在 F12 Console 貼上執行。</p>
   <p className="field-help">使用按下產生時的草稿，可填名稱、描述、價格、庫存、主商品貨號與狀態，會覆寫對應欄位。缺少欄位會回報，不會儲存或上架。類別、其他動態屬性、圖片、物流及規格請手動處理；富文字描述仍需實際核對。</p>
   <textarea ref={area} aria-label="蝦皮 Console 程式碼" readOnly value={script} spellCheck={false} style={{width:'100%',height:260,fontFamily:'monospace',fontSize:12}} onFocus={e=>e.target.select()}/>
   <p role="status">{message}</p>
   <div className="actions">
    <button className="primary" onClick={async()=>{try{await navigator.clipboard.writeText(script);setMessage('已複製，可貼到蝦皮 Console。');}catch{area.current?.focus();area.current?.select();setMessage('無法自動複製，程式已選取，請按 ⌘C／Ctrl+C。');}}}>複製程式</button>
    <a href="https://seller.shopee.tw/portal/product/new" target="_blank" rel="noreferrer">開啟蝦皮新增商品</a>
    <button className="secondary" onClick={()=>dialog.current?.close()}>關閉</button>
   </div>
  </dialog>
 </>;
}
