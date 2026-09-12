"use client";
import {useEffect,useRef} from "react";
export function ProcessingOverlay({active,stage}:{active:boolean;stage:string}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const dialog=ref.current;
  if(!active || !dialog) return;
  const overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  dialog.showModal();
  return ()=>{dialog.close();document.body.style.overflow=overflow;};
 },[active]);
 const isSave=stage==='save';
 const step=stage==='upload'?0:stage==='market'?2:1;
 const labels=isSave
  ? ['讀取商品草稿','整理文案並儲存','更新個人與系統偏好']
  : ['上傳商品圖片',stage==='clarify'?'整理你的回答與修正':'AI 辨識商品資訊','查詢行情與必要的網頁備援'];
 return <dialog ref={ref} className="processing-screen" aria-labelledby="processing-title" aria-describedby="processing-description" onCancel={e=>e.preventDefault()}>
  <div className="processing-panel" aria-busy="true">
   <div className="processing-spinner" aria-hidden="true" />
   <p className="processing-eyebrow">SNAP2SELL · 正在處理</p>
   <h2 id="processing-title" role="status" aria-live="polite">{labels[step]}</h2>
   <p id="processing-description">請稍候，完成後會自動回到編輯畫面。若需要補充資訊，會接著顯示問答視窗。</p>
   <ol className="processing-steps">{labels.map((label,i)=><li key={i} className={i===step?'current':i<step?'complete':''} aria-current={i===step?'step':undefined}><span>{i<step?'✓':i+1}</span>{label}<small>{i===step?'處理中':i<step?'已完成':'待處理'}</small></li>)}</ol>
  </div>
 </dialog>;
}
