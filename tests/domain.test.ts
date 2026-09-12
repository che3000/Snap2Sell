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
 assert.equal(p.name,"耳機");assert.equal(p.brand,"");assert.equal(p.model,"");
 assert.equal(previewFromAnalysis(p).title,"耳機");
});
