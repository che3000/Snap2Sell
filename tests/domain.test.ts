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
