import type { Product } from '../contracts';
export type ConsoleListing = {title:string;description:string;price:number|null;stock:number|null;sku:string;condition:string;category:string;attributes:Record<string,string>;imageCount:number};

// Self-contained browser adapter: serialized into a standalone Console script.
async function runShopeeConsole(product:ConsoleListing) {
 if(location.hostname!=='seller.shopee.tw' || !/^\/portal\/product\/new\/?$/.test(location.pathname)) {
  console.error('[Snap2Sell] 請在蝦皮賣家中心「新增商品」頁執行');return;
 }
 const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
 const visible=(el:Element)=>el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden';
 const results:{field:string;status:string;detail:string}[]=[];
 const unique=(selector:string)=>{
  const list=[...document.querySelectorAll<HTMLElement>(selector)].filter(visible);
  if(list.length!==1)throw Error(`找到 ${list.length} 個可見欄位；請先選類別、展開區塊，或確認是否啟用多規格`);
  return list[0];
 };
 const record=async(field:string,value:unknown,fill:()=>Promise<void>)=>{
  if(value===null || value===undefined || value===''){results.push({field,status:'略過',detail:'草稿未填值'});return;}
  try{await fill();results.push({field,status:'畫面值已保留',detail:'請核對字數／驗證與切換欄位後是否保留'});}
  catch(e){results.push({field,status:'需處理',detail:e instanceof Error?e.message:String(e)});}
 };
 async function text(selector:string,value:string) {
  const el=unique(selector) as HTMLInputElement;
  if(el.disabled || el.readOnly)throw Error('欄位目前不可編輯');
  if(el.maxLength>0 && value.length>el.maxLength)throw Error('內容超過欄位長度限制');
  const win=el.ownerDocument.defaultView!;
  const proto=el.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
  if(!setter)throw Error('非支援的文字欄位');
  el.focus();setter.call(el,value);
  el.dispatchEvent(new win.Event('input',{bubbles:true}));el.dispatchEvent(new win.Event('change',{bubbles:true}));el.blur();
  await pause(350);
  if((unique(selector) as HTMLInputElement).value!==value)throw Error('頁面未保留輸入值');
 }
 await record('商品名稱',product.title,()=>text('[data-product-edit-field-unique-id="name"] input',product.title));
 await record('商品描述',product.description,async()=>{
  const selector='.rich-text-editor [contenteditable="true"]';
  const el=unique(selector);
  if(el.getAttribute('aria-disabled')==='true')throw Error('描述目前不可編輯');
  if(typeof document.execCommand!=='function')throw Error('瀏覽器不支援文字編輯指令，請手動貼上描述');
  el.focus();const selection=window.getSelection();if(!selection)throw Error('無法定位文字選取範圍');
  const range=document.createRange();range.selectNodeContents(el);selection.removeAllRanges();selection.addRange(range);
  if(!document.execCommand('insertText',false,product.description))throw Error('富文字編輯器未接受輸入，請手動貼上描述');
  el.blur();await pause(350);
  const normalize=(s:string)=>s.replace(/\r\n/g,'\n').trim();
  if(normalize(unique(selector).innerText)!==normalize(product.description))throw Error('描述未完整保留，請核對編輯器');
 });
 for(const [field,selector,value] of [
  ['價格','.basic-price input',product.price],['庫存','.basic-stock input',product.stock]
 ] as const) await record(field,value,async()=>{
  if(!Number.isFinite(value) || value! < 0 || (field==='價格' && value===0) || (field==='庫存' && !Number.isInteger(value)))throw Error('草稿數字無效');
  await text(selector,String(value));
 });
 await record('主商品貨號',product.sku,()=>text('[data-product-edit-field-unique-id="parentSku"] input',product.sku));
 await record('狀態',product.condition,async()=>{
  const selector='.product-attribute-item-100413';
  const field=unique(selector);
  if(!(field.closest<HTMLElement>('.edit-row')?.innerText||'').split('\n').some(s=>s.trim()==='狀態'))throw Error('屬性標籤不符');
  const read=()=>unique(selector).querySelector<HTMLElement>('.eds-selector__inner')?.innerText.trim();
  if(read()===product.condition)return;
  const menuSelector='.eds-select-popover-content';
  if([...document.querySelectorAll(menuSelector)].some(visible))throw Error('請收起下拉選單後重跑');
  unique(selector+' .eds-selector').click();
  let option:HTMLElement|undefined;
  for(let i=0;i<30;i++) {
   const menus=[...document.querySelectorAll(menuSelector)].filter(visible);
   if(menus.length>1)throw Error('多個選單開啟，已停止');
   const choices=menus.length?[...menus[0].querySelectorAll<HTMLElement>('.eds-option')].filter(el=>visible(el)&&el.innerText.trim()===product.condition):[];
   if(choices.length>1)throw Error('有多個同名選項');
   if(choices.length===1){option=choices[0];break;}await pause(150);
  }
  if(!option)throw Error('未找到完全相符的狀態選項，請手動選擇');
  if(option.getAttribute('aria-disabled')==='true'||/disabled/.test(option.className))throw Error('選項不可使用');
  option.click();await pause(350);if(read()!==product.condition)throw Error('狀態未保留');
 });
 results.push({field:'類別／動態屬性／圖片／物流／規格',status:'手動確認',detail:'請依草稿核對；此 PoC 不自動填寫這些項目'});
 console.table(results);
 console.log('[Snap2Sell] 核對資料', {category:product.category,attributes:product.attributes,imageCount:product.imageCount});
 console.log('[Snap2Sell] 未儲存或上架。若欄位尚未出現，選好類別後可重新執行同一段程式。');
 return results;
}
export function shopeeConsoleScript(p:Product) {
 const data:ConsoleListing={title:p.name||p.title,description:p.description,price:p.price,stock:p.stock,sku:p.seller?.sku||'',condition:p.condition,category:p.category,attributes:p.attributes,imageCount:p.images.length};
 const json=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return '// Snap2Sell Console PoC — 僅填表，不儲存或上架。\n// 會覆寫已提供資料的支援欄位；請先選好類別並收起下拉選單。\n('+runShopeeConsole.toString()+')('+json+');';
}
