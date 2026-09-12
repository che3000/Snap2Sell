import type { Product } from "../contracts";
/** Editable suggestions, not a claim that these are official platform enums. */
export const attributeChoices: Record<string,string[]> = {
 品牌:["Apple","Logitech","Sony","Samsung","ASUS","Acer","HP","Canon","Epson","Brother","無品牌"],
 顏色:["黑色","白色","銀色","灰色","藍色","綠色","紫色","粉紅色","紅色","金色"],
 連接類型:["無線","有線","藍牙","USB"],耳機:["入耳式","耳罩式","耳塞式"],
 電競專用:["是","否"],運動專用:["是","否"],麥克風:["有","無"],
 適用設備:["手機","電腦","平板","遊戲主機"],充電接口:["USB-C","Lightning","Micro USB"],
 容量:["64GB","128GB","256GB","512GB","1TB"],保固類型:["原廠保固","店家保固","無保固"],
 作業系統:["iOS","Android","Windows","macOS","Linux"],列印技術:["噴墨","雷射","熱感"],
 列印色彩:["彩色","黑白"],雙面列印:["自動","手動","不支援"],
};
export function attributeKeys(p:Product) {
 const hint=[p.name,p.model,p.analysis?.category,p.category].join(' ');
 const specific=/耳機|airpods|headphone/i.test(hint)?["連接類型","耳機","麥克風","充電接口"]:
 /iphone|手機|平板/i.test(hint)?["容量","作業系統","充電接口","螢幕尺寸"]:
 /滑鼠|鍵盤|g304/i.test(hint)?["連接類型","DPI","適用設備"]:
 /列印|印表|墨水|掃描/.test(hint)?["列印技術","列印色彩","雙面列印","適用型號"]:[];
 return Array.from(new Set(["型號","顏色",...Object.keys(p.attributes).filter(k=>p.attributes[k].trim()),...specific]));
}
