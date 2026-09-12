import test from "node:test";
import assert from "node:assert/strict";
import { resolvePreferences, scopeChain } from "../packages/preferences";
import { defaults, productSchema, type Evidence } from "../packages/contracts";
import { samples } from "../fixtures/products";
import { generateListing } from "../packages/listing";
import { missingInformation } from "../packages/product";
import {
  filterComparables,
  priceSummary,
  type MarketItem,
} from "../packages/market";
const now = Date.now();
const evidence = (id: string, value = "none", at = now): Evidence => ({
  id,
  productId: id,
  at,
  dimension: "emoji",
  value,
  source: "implicit",
  scope: "store:main",
  weight: 1,
});
test("single edit does not become a durable preference", () =>
  assert.equal(
    resolvePreferences(
      {},
      [evidence("one")],
      scopeChain("main", "手機"),
      {},
      now,
    ).profile.emoji,
    "low",
  ));
test("repeated edits across products become preferences", () =>
  assert.equal(
    resolvePreferences(
      {},
      ["a", "b", "c"].map((x) => evidence(x)),
      scopeChain("main", "手機"),
      {},
      now,
    ).profile.emoji,
    "none",
  ));
test("duplicate edits on one product never count as several products", () =>
  assert.equal(
    resolvePreferences(
      {},
      [evidence("a"), evidence("a"), evidence("a")],
      scopeChain("main", ""),
      {},
      now,
    ).profile.emoji,
    "low",
  ));
test("old evidence decays", () =>
  assert.equal(
    resolvePreferences(
      {},
      ["a", "b", "c"].map((x) => evidence(x, "none", now - 180 * 86400000)),
      scopeChain("main", ""),
      {},
      now,
    ).profile.emoji,
    "low",
  ));
test("conflicting signals remain uncertain", () =>
  assert.equal(
    resolvePreferences(
      {},
      ["a", "b", "c"]
        .map((x) => evidence(x))
        .concat(["d", "e", "f"].map((x) => evidence(x, "medium"))),
      scopeChain("main", ""),
      {},
      now,
    ).profile.emoji,
    "low",
  ));
test("current > category > store > seller, store isolation", () => {
  const prefs = {
    seller: { tone: "professional" as const },
    "store:main": { tone: "friendly" as const },
    "category:main:手機": { tone: "y2k" as const },
  };
  assert.equal(
    resolvePreferences(prefs, [], scopeChain("main", "手機"), {}, now).profile
      .tone,
    "y2k",
  );
  assert.equal(
    resolvePreferences(prefs, [], scopeChain("second", "手機"), {}, now).profile
      .tone,
    "professional",
  );
  assert.equal(
    resolvePreferences(
      prefs,
      [],
      scopeChain("main", "手機"),
      { tone: "minimalist" },
      now,
    ).profile.tone,
    "minimalist",
  );
});
test("unconfirmed product cannot generate", () =>
  assert.throws(() => generateListing(samples[0], defaults)));
test("facts-only listing never creates warranties or specifications", () => {
  const r = generateListing({ ...samples[0], confirmed: true }, defaults);
  assert.ok(!r.description.includes("保固"));
  assert.ok(!r.description.includes("降噪"));
  assert.ok(r.title.includes("AirPods Pro 3"));
});
test("negative stock and huge title rejected", () => {
  assert.equal(
    productSchema.safeParse({ ...samples[0], stock: -1 }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({ ...samples[0], title: "x".repeat(301) }).success,
    false,
  );
});
test("zero price is not ready", () =>
  assert.ok(missingInformation({ ...samples[0], price: 0 }).includes("售價")));
const item = (
  title: string,
  price: number,
  url = crypto.randomUUID(),
): MarketItem => ({
  title,
  price,
  url,
  currency: "TWD",
  min: null,
  max: null,
  reason: "",
  included: false,
});
test("wrong generation/capacity, accessories, used and price ranges excluded", () => {
  const p = { ...samples[2], condition: "全新", confirmed: true };
  const rows = filterComparables(
    [
      item("iPhone 17 256GB", 25000),
      item("iPhone 17 Pro 256GB", 32000),
      item("iPhone 17 512GB", 32000),
      item("iPhone 17 256GB 保護殼", 100),
      item("二手 iPhone 17 256GB", 19000),
      { ...item("iPhone 17 256GB", 100), min: 100, max: 30000 },
    ],
    p,
  );
  assert.deepEqual(
    rows.map((r) => r.included),
    [true, false, false, false, false, false],
  );
});
test("minimum comparable sample prevents fabricated price estimates", () => {
  assert.equal(priceSummary([{ ...item("G304", 900), included: true }]), null);
  assert.equal(
    priceSummary(
      [800, 900, 1000].map((p) => ({ ...item("G304", p), included: true })),
    )?.balanced,
    900,
  );
});

test("G304 X and mouse skins are not G304 comparables", () => {
  assert.deepEqual(
    filterComparables(
      [
        item("Logitech G304 X Superlight", 2490),
        item("羅技 G304 貼膜防滑貼", 280),
      ],
      { ...samples[1], condition: "全新" },
    ).map((x) => x.included),
    [false, false],
  );
});

import { applyAnalysis, emptyProduct } from "../packages/product";
import { analysisResultSchema } from "../packages/contracts";
const analysis = analysisResultSchema.parse({name:"Logitech G304",brand:"Logitech",model:"G304",category:"滑鼠",identityConfidence:"high_confidence",identityEvidence:"包裝正面寫著 G304",observations:[{label:"顏色",value:"黑色",evidence:"滑鼠外殼為黑色",confidence:"high_confidence"},{label:"電池續航",value:"250 小時",evidence:"不清楚",confidence:"uncertain"},{label:"保固",value:"一年",evidence:"包裝文字",confidence:"high_confidence"}],questions:["是否有功能異常？"]});
test("photo fill keeps uncertain specs and seller promises empty",()=>{
 const p=applyAnalysis(emptyProduct('photo'),analysis);
 assert.equal(p.model,'G304');assert.deepEqual(p.attributes,{顏色:'黑色'});assert.equal(p.confirmed,false);
 assert.equal(p.stock,null);assert.equal(p.price,null);assert.equal(p.warranty,'');assert.equal(p.condition,'');
 assert.ok(missingInformation(p).includes('庫存'));
});
test("photo analysis preserves manual edits and rejects uncertain identity",()=>{
 const p=applyAnalysis({...emptyProduct('photo'),model:'manual',attributes:{顏色:'白色'}},analysis);
 assert.equal(p.model,'manual');assert.equal(p.attributes.顏色,'白色');
 assert.equal(applyAnalysis(emptyProduct('photo'),{...analysis,identityConfidence:'probable'}).model,'');
});
test("new product never inherits sample specs or images",()=>{
 assert.deepEqual(emptyProduct('new').attributes,{});assert.deepEqual(emptyProduct('new').images,[]);
 assert.equal(emptyProduct('new').brand,'');
});
import { loginCookie, sessionOwner } from "../apps/api/test-auth";
test("shared test logins isolate sessions and reject forged or revoked cookies",()=>{
 process.env.TEST_LOGIN_USERNAME='test';process.env.TEST_LOGIN_PASSWORD='test-password';process.env.TEST_SESSION_SECRET='s'.repeat(48);
 assert.throws(()=>loginCookie('test','wrong',true));
 const a=loginCookie('test','test-password',true),b=loginCookie('test','test-password',true);
 assert.notEqual(sessionOwner(a),sessionOwner(b));assert.ok(sessionOwner(a));assert.ok(a.includes('HttpOnly'));assert.ok(a.includes('Secure'));
 assert.equal(sessionOwner(a.replace('snap2sell_test_session=','snap2sell_test_session=x')),null);
 process.env.TEST_LOGIN_PASSWORD='changed';assert.equal(sessionOwner(a),null);
 delete process.env.TEST_LOGIN_USERNAME;delete process.env.TEST_LOGIN_PASSWORD;delete process.env.TEST_SESSION_SECRET;
});
import { previewFromAnalysis } from "../packages/listing";
test("photo preview fills title and description without confirming or overwriting",()=>{
 const p=applyAnalysis(emptyProduct('photo'),analysis), draft=previewFromAnalysis(p);
 assert.ok(draft.title?.includes('G304'));assert.ok(draft.description?.includes('黑色'));assert.ok(!draft.description?.includes('保固'));assert.equal(p.confirmed,false);
 assert.equal(previewFromAnalysis({...p,title:'custom'}).title,'custom');
 assert.deepEqual(previewFromAnalysis({...p,name:"",analysis:{...analysis,identityConfidence:'uncertain'}}),{});
});

test("unconfirmed products can compare new reference prices without claiming condition",()=>{
 const p={...emptyProduct('test'),model:'G304'};
 const rows=filterComparables([item('Logitech G304',800),item('Logitech G304',900),item('Logitech G304',1000)],{...p,condition:'全新'});
 assert.equal(priceSummary(rows)?.balanced,900);assert.equal(p.condition,'');assert.equal(p.confirmed,false);
});
test("opened-unused comparables do not silently use used products",()=>{
 const rows=filterComparables([item('拆封未使用 Logitech G304',800),item('二手 Logitech G304',500)],{...samples[1],condition:'拆封未使用'});
 assert.deepEqual(rows.map(x=>x.included),[true,false]);
});

import { clarifiedResultSchema } from "../packages/contracts";
test("clarification keeps answers and pending questions in saved product contract",()=>{
 const p=productSchema.parse({...emptyProduct('qa'),analysis,pendingQuestions:true,answers:[{question:'商品狀況？',answer:'二手，外殼有刮痕'}]});
 assert.equal(p.pendingQuestions,true);assert.equal(p.answers?.[0].answer,'二手，外殼有刮痕');
 assert.equal(clarifiedResultSchema.safeParse({...analysis,condition:'猜測全新',shipping:'',warranty:'',variants:''}).success,false);
 const result=clarifiedResultSchema.parse({...analysis,questions:[],condition:'二手',shipping:'',warranty:'',variants:''});
 const filled=applyAnalysis({...p,condition:result.condition},result);
 assert.equal(filled.condition,'二手');assert.equal(filled.warranty,'');assert.equal(filled.confirmed,false);
});

import {minimalQuestions,conditionQuestion} from "../packages/product";
test("minimal questions only ask condition once; uncertain identity never invents brand",()=>{
 assert.deepEqual(minimalQuestions(emptyProduct("x")),[conditionQuestion]);
 assert.deepEqual(minimalQuestions({...emptyProduct("x"),condition:"全新"}),[]);
 const p=applyAnalysis(emptyProduct("x"),{...analysis,identityConfidence:"probable",name:"Possible specific model",category:"耳機"});
 assert.equal(p.name,"Possible specific model（AI 候選，待確認）");assert.equal(p.brand,"");assert.equal(p.model,"");
 assert.equal(previewFromAnalysis(p).title,p.name);
});
test("new condition preserves original photo fields and creates a generic listing without model",()=>{
 const original={...analysis,model:'',brand:'',name:'',category:'耳機',identityConfidence:'uncertain' as const};
 const filled=applyAnalysis({...emptyProduct('photo'),condition:'全新'},original);
 assert.equal(filled.condition,'全新');assert.equal(filled.name,'耳機');assert.equal(filled.attributes.顏色,'黑色');
 assert.ok(previewFromAnalysis(filled).description?.includes('商品狀況：全新'));assert.equal(filled.model,'');
});
test("seller centre fields persist and reject invalid quantities and media overflow",()=>{
 const seller={gtin:'123456789',minPurchase:2,weight:'0.3',width:'15',carriers:[{name:'全家',fee:60,enabled:true}],sku:'SKU-1',scheduledAt:'2026-09-20T12:00'};
 assert.deepEqual(productSchema.parse({...emptyProduct('seller'),seller}).seller,seller);
 assert.equal(productSchema.safeParse({...emptyProduct('seller'),seller:{minPurchase:0}}).success,false);
 assert.equal(productSchema.safeParse({...emptyProduct('seller'),seller:{descriptionImages:Array.from({length:13},()=>({id:'a',name:'a'}))}}).success,false);
});

import { comparisonModel } from "../packages/market";
test("explicit names match AirPods aliases, filter accessories and preserve uncertainty",()=>{
 const p={...emptyProduct('pricing'),name:'Airpods Pro 3',condition:'全新'};
 const row=(title:string,url=title)=>({title,url,price:6000,currency:'TWD',min:null,max:null,reason:'',included:false});
 const rows=filterComparables([row('Apple 2025 AirPods Pro 3 白色'),row('全新未拆 AirPods Pro3'),row('AirPods Pro(3代)'),row('AirPods Pro 2'),row('AirPods Pro 3 保護殼'),row('iPhone 17 AirPods Pro 3 超值組')],p);
 assert.deepEqual(rows.map(x=>x.included),[true,true,true,false,false,false]);
 assert.equal(rows[4].reason,'配件或零件');assert.equal(rows[5].reason,'組合或非單品價格');
 assert.equal(comparisonModel({...p,name:'AirPods Pro 3（AI 候選，待確認）'}),'');
 assert.equal(filterComparables([row('手機')],emptyProduct('unknown'))[0].reason,'商品型號尚未確認');
 const duplicate=filterComparables([row('AirPods Pro3','https://biggo.com.tw/r/?i=shop&id=1&lb=ad'),row('AirPods Pro3','https://biggo.com.tw/r/?i=shop&id=1&lb=search')],p);
 assert.equal(duplicate[1].reason,'重複來源');
});

import { normalizeAnalysis } from "../packages/product";
test("uncertain iPhone generation retains series but cannot price an invented generation",()=>{
 const a=normalizeAnalysis({...analysis,name:'Apple iPhone 14 Plus',model:'iPhone 14 Plus',identityConfidence:'probable'});
 assert.equal(a.name,'Apple iPhone 智慧型手機');assert.equal(a.model,'');
 assert.equal(comparisonModel(applyAnalysis(emptyProduct('phone'),a)),'');
});

import { attributeKeys } from "../packages/product/attributes";
import { categories } from "../packages/product/categories";
import { listingOptions } from "../packages/listing/options";
test("attributes follow product type without irrelevant headphone fields",()=>{
 const phone={...emptyProduct('phone'),name:'Apple iPhone 17',attributes:{賣家備註:'已測試'}};
 assert.ok(attributeKeys(phone).includes('容量'));assert.ok(!attributeKeys(phone).includes('耳機'));assert.ok(!attributeKeys(phone).includes('DPI'));
 assert.ok(attributeKeys(phone).includes('賣家備註'));
 assert.ok(attributeKeys({...phone,name:'Logitech G304',category:'滑鼠'}).includes('DPI'));
 assert.deepEqual(attributeKeys(emptyProduct('blank')),['型號','顏色']);
 assert.ok(categories['電腦與周邊配件']['列印機/掃描機']['墨水匣']);
});
test("three listing alternatives preserve facts and omit unsupported promises",()=>{
 const p={...emptyProduct('options'),name:'Apple iPhone 17',condition:'全新',attributes:{容量:'256GB',顏色:'白色'}};
 const options=listingOptions(p);
 assert.equal(options.names.length,3);assert.equal(options.descriptions.length,3);
 assert.equal(new Set(options.names.map(o=>o.text)).size,3);
 for(const o of [...options.names,...options.descriptions]) assert.doesNotMatch(o.text,/免運|一年保固|現貨/);
 assert.ok(options.names.every(o=>o.text.length<=60));
 assert.deepEqual(listingOptions(emptyProduct('empty')),{names:[],descriptions:[]});
});

import {followUpQuestions} from "../packages/product";
test("AI followups retain product-specific gaps, cap three, and do not repeat condition",()=>{
 const a={...analysis,questions:['是全新還是二手？','請提供型號','請提供容量','是否有缺件','請提供型號']};
 assert.deepEqual(followUpQuestions(emptyProduct('questions'),a),[conditionQuestion,'請提供型號','請提供容量']);
 assert.deepEqual(followUpQuestions({...emptyProduct('questions'),condition:'全新',answers:[{question:'請提供型號',answer:'不確定'}]},a),['請提供容量','是否有缺件']);
 assert.deepEqual(followUpQuestions({...emptyProduct('complete'),condition:'全新'},{...a,questions:[]}),[]);
 assert.ok(followUpQuestions(emptyProduct('used'),{...a,questions:['二手商品有哪些瑕疵？']}).includes('二手商品有哪些瑕疵？'));
});

test("missing phone identity and storage become followups even when AI omits questions",()=>{
 const phone={...analysis,name:'Apple iPhone',model:'',identityConfidence:'probable' as const,questions:[],observations:[]};
 const questions=followUpQuestions(emptyProduct('phone'),phone);
 assert.equal(questions.length,3);assert.match(questions[1],/型號/);assert.match(questions[2],/容量/);
 assert.deepEqual(followUpQuestions({...emptyProduct('phone'),answers:questions.map(question=>({question,answer:'不確定'}))},phone),[]);
});

import { correctedProduct } from "../packages/product";
test("seller correction replaces wrong populated fields and clears old derived pricing",()=>{
 const before={...emptyProduct('correct'),name:'Wrong mouse',brand:'Wrong',model:'G304',category:'滑鼠',attributes:{DPI:'12000'},price:800,title:'old title',description:'old copy',condition:'全新'};
 const after=correctedProduct(before,{...analysis,name:'Apple iPhone 17',brand:'Apple',model:'iPhone 17',category:'手機',observations:[{label:'容量',value:'256GB',evidence:'賣家修正',confidence:'high_confidence'}]});
 assert.equal(after.model,'iPhone 17');assert.equal(after.category,'手機');assert.equal(after.attributes.DPI,undefined);assert.equal(after.attributes.容量,'256GB');
 assert.equal(after.price,null);assert.equal(after.market,undefined);assert.equal(after.description,'');assert.equal(after.title,'');assert.equal(after.confirmed,false);
});

import {normalizeSellerDetails} from "../packages/product";
test("seller phone storage is separated from model into attributes",()=>{
 const fixed=normalizeSellerDetails({...analysis,name:'iPhone 17 256GB',model:'iPhone 17 256GB',category:'手機',observations:[] as typeof analysis.observations});
 assert.equal(fixed.model,'iPhone 17');assert.equal(fixed.observations[0].value,'256GB');
});

import {toggleMarketExclusion} from "../packages/market";
import {marketResearchSchema} from "../packages/contracts";
test("manual exclusions recalculate all prices and restore without bypassing auto filters",()=>{
 const items=[100,200,300,400,500].map((price,i)=>({title:'G304',price,url:`https://example.com/${i}`,currency:'TWD',min:null,max:null,reason:'',included:true}));
 const market=marketResearchSchema.parse({query:'G304',at:'now',source:'test',conditionBasis:'全新',provisional:false,items,summary:priceSummary(items)});
 const excluded=toggleMarketExclusion(market,0);
 assert.deepEqual([excluded.summary?.competitive,excluded.summary?.balanced,excluded.summary?.premium],[200,300,400]);
 assert.equal(excluded.summary?.count,4);
 assert.equal(marketResearchSchema.parse(excluded).items[0].manualExcluded,true);
 assert.deepEqual(toggleMarketExclusion(excluded,0).summary,market.summary);
 const small=toggleMarketExclusion(toggleMarketExclusion(excluded,1),2);assert.equal(small.summary,null);
 const auto={...market,items:market.items.map((x,i)=>i===0?{...x,included:false,reason:'配件或零件'}:x)};
 assert.equal(toggleMarketExclusion(toggleMarketExclusion(auto,0),0).items[0].included,false);
 assert.equal(toggleMarketExclusion({...market,referenceOnly:true},0).summary,null);
});

import {setMarketInclusion,marketItemIncluded,marketInputKey} from "../packages/market";
test("check and cross override strategy, including outliers, and survive storage schema",()=>{
 const items=[100,200,300,10000].map((price,i)=>({title:'G304',price,url:`https://example.com/${i}`,currency:'TWD',min:null,max:null,reason:i===3?'型號不符':'',included:i!==3}));
 const market=marketResearchSchema.parse({query:'G304',at:'now',source:'test',conditionBasis:'全新',provisional:false,items,summary:priceSummary(items)});
 assert.equal(marketItemIncluded(market,items[3]),false);
 const checked=setMarketInclusion(market,3,true);
 assert.equal(checked.summary?.count,4);assert.equal(checked.summary?.high,10000);
 assert.equal(marketResearchSchema.parse(checked).items[3].manualIncluded,true);
 assert.equal(setMarketInclusion(checked,3,false).summary?.count,3);
 assert.equal(marketItemIncluded(checked,checked.items[3]),true);
 assert.notEqual(marketInputKey(emptyProduct('a')),marketInputKey({...emptyProduct('a'),name:'G304'}));
});

import {quoteMarketQuery} from "../packages/market";
test("BigGo search wraps normalized product terms in one pair of quotes",()=>{
 assert.equal(quoteMarketQuery(' Apple iPhone 17 256GB '),'"Apple iPhone 17 256GB"');
 assert.equal(quoteMarketQuery('"AirPods Pro 3"'),'"AirPods Pro 3"');
 assert.equal(quoteMarketQuery('  '),'');
});
