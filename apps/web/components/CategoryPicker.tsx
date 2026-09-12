"use client";
import {useRef,useState} from 'react';
import {Search,ChevronRight,X,Pencil} from 'lucide-react';
import { categories, categoryIdForPath, type CategoryTree } from "@/packages/product/categories";
function paths(tree:CategoryTree,prefix:string[]=[]):string[][] {
 return Object.entries(tree).flatMap(([name,children])=>{const path=[...prefix,name];return [path,...paths(children,path)];});
}
const allPaths=paths(categories);
export function CategoryPicker({ value, onChange }: {value:string;onChange:(v:string)=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [draft,setDraft]=useState<string[]>([]),[query,setQuery]=useState(''),[manual,setManual]=useState(false);
 const selected=draft.filter(Boolean).join(' > ');
 const levels:{name:string;children:boolean}[][]=[];
 let tree=categories;
 for(let i=0;i<5&&Object.keys(tree).length;i++) {
  levels.push(Object.entries(tree).map(([name,children])=>({name,children:Object.keys(children).length>0})));
  tree=tree[draft[i]]||{};
 }
 const matches=query.trim()?allPaths.filter(path=>path.join(' > ').toLowerCase().includes(query.trim().toLowerCase()) || categoryIdForPath(path.join(' > '))?.includes(query.trim())):[];
 const open=()=>{setDraft(value?value.split(' > '):[]);setQuery('');setManual(false);dialog.current?.showModal();};
 return <div className="category-picker">
  <button type="button" className="category-open" onClick={open}><span>{value||'請選擇商品分類'}</span><Pencil size={16}/></button>
  {categoryIdForPath(value)&&<p className="field-help">蝦皮商品分類 ID：{categoryIdForPath(value)}</p>}
  <dialog ref={dialog} className="category-dialog" aria-labelledby="category-dialog-title">
   <header className="category-dialog-header"><h3 id="category-dialog-title">編輯分類</h3><button type="button" className="category-close" aria-label="關閉分類選擇" onClick={()=>dialog.current?.close()}><X size={21}/></button></header>
   <div className="category-browser">
    <div className="category-toolbar"><label className="category-search"><input autoFocus aria-label="搜尋分類名稱或 ID" placeholder="請輸入至少 1 個字" value={query} onChange={e=>setQuery(e.target.value)}/><Search size={19}/></label><span>依序選擇分類與子分類</span></div>
    {query.trim()?<div className="category-search-results" aria-label="分類搜尋結果">{matches.length?matches.map(path=>{const text=path.join(' > ');return <button type="button" key={text} onClick={()=>{setDraft(path);setQuery('');}}><span>{text}</span><small>{categoryIdForPath(text)||''}</small><ChevronRight size={16}/></button>; }):<p>找不到符合的分類，可在下方自行填寫。</p>}</div>:<div className="category-columns">{Array.from({length:Math.max(4,levels.length)},(_,i)=><div className="category-column" key={i} role="group" aria-label={`第 ${i+1} 層分類`}>{levels[i]?.map(item=><button type="button" key={item.name} className={draft[i]===item.name?'selected':''} aria-pressed={draft[i]===item.name} onClick={()=>setDraft([...draft.slice(0,i),item.name])}><span>{item.name}</span>{item.children&&<ChevronRight size={17}/>}</button>)}</div>)}</div>}
   </div>
   <div className="category-manual"><button type="button" onClick={()=>setManual(!manual)}>{manual?'收起自行填寫':'找不到分類？自行填寫'}</button><span>目前為已提供的部分分類資料</span>{manual&&<input aria-label="完整商品分類，可自行編輯" value={selected} onChange={e=>setDraft(e.target.value.split(' > '))} placeholder="輸入完整分類路徑，以 > 分隔"/>}</div>
   <footer className="category-dialog-footer"><p>目前已選擇的： <strong>{selected||'尚未選擇'}</strong>{categoryIdForPath(selected)&&<small>（ID：{categoryIdForPath(selected)}）</small>}</p><div><button type="button" className="category-cancel" onClick={()=>dialog.current?.close()}>取消</button><button type="button" className="category-confirm" disabled={!selected.trim()} onClick={()=>{onChange(selected);dialog.current?.close();}}>確認</button></div></footer>
  </dialog>
 </div>;
}
