// Category labels and available hierarchy extracted from the seller HTML supplied by the user.
export type CategoryTree = { [name: string]: CategoryTree };
export const categories: CategoryTree = {
  "女生衣著": {},
  "男生衣著": {},
  "美妝保養": {},
  "保健": {},
  "時尚配件": {},
  "家用電器": {},
  "男鞋": {},
  "手機平板與周邊": {},
  "旅行相關用品/行李箱": {},
  "女生包包/精品": {},
  "女鞋": {},
  "男生包包": {},
  "手錶": {},
  "影音": {},
  "美食、伴手禮": {},
  "寵物": {},
  "母嬰用品": {},
  "嬰幼兒童裝童鞋": {},
  "電玩遊戲": {},
  "相機&空拍機": {},
  "居家生活": {},
  "戶外與運動用品": {},
  "文具、美術用具": {},
  "愛好與收藏品": {},
  "票券、優惠券與服務": {},
  "書籍及雜誌期刊": {},
  "電腦與周邊配件": {
    "桌上型電腦": {},
    "螢幕顯示器": {},
    "電腦零組件": {},
    "儲存裝置": {},
    "電腦周邊配件": {},
    "軟體": {},
    "辦公設備": {},
    "列印機/掃描機": {
      "列印機/掃描機/影印機": {},
      "熱感印表機/條碼印表機": {},
      "墨水匣": {},
      "3D列印機": {},
      "其他": {}
    },
    "電腦/筆電周邊配件": {},
    "鍵盤滑鼠": {},
    "筆記型電腦": {},
    "其他": {}
  },
  "汽機車百貨／交通用品": {}
};

// Partial category lookup rows supplied by the seller; not a complete Shopee taxonomy.
// Category IDs and attribute IDs are separate namespaces.
import records from './category-records.json';
export const categoryRecords = records;
for (const record of categoryRecords) {
  let branch = categories;
  for (const label of record.path) branch = branch[label] ||= {};
}
export function categoryIdForPath(path:string) {
  return categoryRecords.find(record=>record.path.join(' > ')===path)?.id;
}
