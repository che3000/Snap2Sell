"use client";
import { categories, categoryIdForPath, type CategoryTree } from "@/packages/product/categories";
export function CategoryPicker({ value, onChange }: {value:string;onChange:(v:string)=>void}) {
  const path=value.split(" > ");
  const levels:{options:string[];value:string}[]=[];
  let tree:CategoryTree=categories;
  for(let i=0;i<5 && Object.keys(tree).length;i++) {
    levels.push({options:Object.keys(tree),value:path[i] || ""});
    tree=tree[path[i]] || {};
  }
  return <div className="category-picker">
    <div className="category-levels">{levels.map((level,i)=><select key={i} aria-label={`第 ${i+1} 層商品分類`} value={level.options.includes(level.value)?level.value:""} onChange={e=>onChange([...path.slice(0,i),e.target.value].filter(Boolean).join(" > "))}>
      <option value="">請選擇第 {i+1} 層分類</option>{level.options.map(v=><option key={v}>{v}</option>)}
    </select>)}</div>
    <input aria-label="完整商品分類，可自行編輯" value={value} onChange={e=>onChange(e.target.value)} placeholder="選擇分類，或輸入完整分類路徑" />
    {categoryIdForPath(value) && <p className="field-help">蝦皮商品分類 ID：{categoryIdForPath(value)}</p>}
    <p className="field-help">已整合提供的部分蝦皮分類；尚未提供的子分類可自行填寫。</p>
  </div>;
}
