"use client";
import { useState } from "react";
export default function Login() {
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  return <main className="test-login"><a className="brand" href="/">Snap2Sell <span className="edition">TEST STUDIO</span></a><h1>登入商品測試工作台</h1><p>使用管理者提供的帳號密碼，上傳照片並自動整理商品資訊。</p><form onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError("");const form=new FormData(e.currentTarget);
    try{const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(form))});const data=await response.json() as {error?:string};if(!response.ok)throw Error(data.error||'登入失敗');window.location.assign('/')}catch(e){setError(e instanceof Error?e.message:'無法連線');setBusy(false)}
  }}><label>測試帳號<input name="username" autoComplete="username" required maxLength={100}/></label><label>密碼<input name="password" type="password" autoComplete="current-password" required maxLength={200}/></label>{error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'登入中…':'登入工作台'}</button></form><p className="field-help">AI 由管理者提供。圖片會傳送至 OpenAI 辨識。草稿依本次登入保存；登出後重新登入會建立新的測試空間，請先匯出需要保留的資料。</p></main>;
}
