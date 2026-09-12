import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { marketResearchSchema, type MarketResearch, type Preferences, type Product, type DescriptionStyleSignals } from "../../packages/contracts";
import {
  defaultGlobalPolicy,
  defaultPricingPolicy,
  globalPolicySchema,
  personalProfileSchema,
  type GlobalPolicy,
} from "../../packages/learning";
import { priceRecommendations } from "../../packages/market";
import { db } from "./storage";

export const GLOBAL_FEEDBACK = "GLOBAL_FEEDBACK";
export const PERSONAL_PROFILE_UPDATE = "PERSONAL_PROFILE_UPDATE";

function normalizeIdentityPart(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function productIdentityKey(product: Product) {
  const attributes = Object.fromEntries(
    Object.entries(product.attributes)
      .map(([key, value]) => [normalizeIdentityPart(key), normalizeIdentityPart(value)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({
    brand: normalizeIdentityPart(product.brand),
    model: normalizeIdentityPart(product.model),
    name: normalizeIdentityPart(product.name),
    category: normalizeIdentityPart(product.category),
    attributes,
  });
}

function identityHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pi-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function productIdentityId(product: Product) {
  if (!product.confirmed || !product.brand.trim() || !product.model.trim())
    return null;
  return identityHash(productIdentityKey(product));
}

function integerSetting(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function globalLearningTriggerCount() {
  return integerSetting("GLOBAL_LEARNING_TRIGGER_COUNT", 20);
}

export function personalProfileMinConfidence() {
  const value = Number(process.env.PERSONAL_PROFILE_MIN_CONFIDENCE);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.7;
}

export function personalProfileMaxDimensionChanges() {
  return integerSetting("PERSONAL_PROFILE_MAX_DIMENSION_CHANGES", 2);
}

export function globalAgentMinConfidence() {
  const value = Number(process.env.GLOBAL_AGENT_MIN_CONFIDENCE);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.7;
}

export function globalRollbackMinSample() {
  return integerSetting("GLOBAL_ROLLBACK_MIN_SAMPLE", 10);
}

export function globalRollbackAdoptionThreshold() {
  const value = Number(process.env.GLOBAL_ROLLBACK_ADOPTION_THRESHOLD);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.2;
}

export async function activeGlobalPolicy() {
  const row = await db()
    .prepare("SELECT version,data FROM global_policies WHERE status='active' ORDER BY activated_at DESC LIMIT 1")
    .first<{ version: string; data: string }>();
  if (!row) return defaultGlobalPolicy;
  try {
    return globalPolicySchema.parse({ ...JSON.parse(row.data), version: row.version });
  } catch {
    return defaultGlobalPolicy;
  }
}

export async function activePersonalProfile(owner: string) {
  const row = await db()
    .prepare("SELECT version,data FROM personal_profile_versions WHERE owner=? AND status='active' ORDER BY activated_at DESC LIMIT 1")
    .bind(owner)
    .first<{ version: string; data: string }>();
  if (!row) return { version: null, profile: personalProfileSchema.parse({}) };
  try {
    return { version: row.version, profile: personalProfileSchema.parse(JSON.parse(row.data)) };
  } catch {
    return { version: null, profile: personalProfileSchema.parse({}) };
  }
}

export function enrichMarketResearch(
  result: MarketResearch,
  policy: GlobalPolicy,
) {
  const parsed = marketResearchSchema.parse(result);
  const recommendations = parsed.summary
    ? priceRecommendations(parsed.items, policy.pricing)
    : null;
  return {
    ...parsed,
    pricingPolicy: policy.pricing,
    priceRecommendations: recommendations || undefined,
    globalPolicyVersion: policy.version,
  };
}

export async function saveMarketSnapshot(
  owner: string,
  product: Product,
  result: MarketResearch,
  policy: GlobalPolicy,
  preferences: Preferences,
) {
  const enriched = enrichMarketResearch(result, policy);
  const snapshotId = crypto.randomUUID();
  const recommendationId = crypto.randomUUID();
  const now = Date.now();
  const recommendation = enriched.priceRecommendations;
  await db().batch([
    db()
      .prepare(
        "INSERT INTO market_snapshots(id,owner,product,query,source,global_policy_version,retrieval_plan,applied_capabilities,request_data,response_data,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        snapshotId,
        owner,
        product.id,
        enriched.query,
        enriched.source,
        policy.version,
        JSON.stringify((enriched as { retrievalPlan?: unknown }).retrievalPlan || null),
        JSON.stringify((enriched as { appliedCapabilities?: unknown }).appliedCapabilities || []),
        JSON.stringify({
          name: product.name,
          brand: product.brand,
          model: product.model,
          category: product.category,
          condition: product.condition,
          attributes: product.attributes,
        }),
        JSON.stringify(enriched),
        now,
      ),
    db()
      .prepare(
        "INSERT INTO price_recommendations(id,owner,product,market_snapshot_id,global_policy_version,personal_preferences,options_data,default_strategy,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        recommendationId,
        owner,
        product.id,
        snapshotId,
        policy.version,
        JSON.stringify(preferences),
        JSON.stringify(recommendation || null),
        recommendation?.defaultStrategy || policy.pricing.defaultStrategy,
        now,
      ),
  ]);
  return {
    result: {
      ...enriched,
      marketSnapshotId: snapshotId,
      priceRecommendationId: recommendationId,
    },
    snapshotId,
    recommendationId,
  };
}

export type FeedbackPayload = {
  generationId?: string;
  marketSnapshotId?: string;
  priceRecommendationId?: string;
  productIdentityId?: string;
  generated?: { title: string; description: string };
  descriptionStyle?: {
    generated?: DescriptionStyleSignals;
    final: DescriptionStyleSignals;
  };
  final: { title: string; description: string; price: number | null };
  price?: {
    strategy?: string;
    percentile?: number;
    recommended?: number;
    referenceBalanced?: number;
  };
  marketSources?: Array<{ sourceKey?: string; includedCount: number; excludedCount: number }>;
  source: string;
};

export function feedbackStatements(
  database: D1Database,
  input: {
    owner: string;
    product: Product;
    payload: FeedbackPayload;
    evidence: unknown[];
    generationId?: string;
    draftVersion?: number;
    draftUpdatedAt?: number;
  },
) {
  const eventId = crypto.randomUUID();
  const now = Date.now();
  const eventData = JSON.stringify(input.payload);
  const identityKey = productIdentityKey(input.product);
  const identityId = input.payload.productIdentityId || productIdentityId(input.product);
  const hasDraftGuard =
    input.draftVersion !== undefined && input.draftUpdatedAt !== undefined;
  const draftWhere = hasDraftGuard
    ? " WHERE EXISTS (SELECT 1 FROM drafts WHERE owner=? AND id=? AND version=? AND updated=?)"
    : "";
  const draftAnd = hasDraftGuard
    ? " AND EXISTS (SELECT 1 FROM drafts WHERE owner=? AND id=? AND version=? AND updated=?)"
    : "";
  const draftParams = hasDraftGuard
    ? [input.owner, input.product.id, input.draftVersion!, input.draftUpdatedAt!]
    : [];
  const statements: D1PreparedStatement[] = [];
  if (identityId) {
    statements.push(
      database
        .prepare(
          `INSERT INTO product_identities(id,canonical_key,brand,model,name,category,attributes,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?${draftWhere} ON CONFLICT(canonical_key) DO UPDATE SET brand=excluded.brand,model=excluded.model,name=excluded.name,category=excluded.category,attributes=excluded.attributes,updated_at=excluded.updated_at`,
        )
        .bind(
          identityId,
          identityKey,
          input.product.brand,
          input.product.model,
          input.product.name,
          input.product.category,
          JSON.stringify(input.product.attributes),
          now,
          now,
          ...draftParams,
        ),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO events(id,owner,product,scope,kind,data,at) SELECT ?,?,?,?,?,?,?${draftWhere}`,
      )
      .bind(
        eventId,
        input.owner,
        input.product.id,
        "seller",
        "LISTING_FEEDBACK",
        eventData,
        now,
        ...draftParams,
      ),
  );
  if (identityId && input.payload.final.title.trim()) {
    statements.push(
      database
        .prepare(
          `INSERT INTO title_variants(id,identity_id,owner,product,title,source,was_generated,accepted,created_at) SELECT ?,?,?,?,?,?,?,?,?${draftWhere}`,
        )
        .bind(
          crypto.randomUUID(),
          identityId,
          input.owner,
          input.product.id,
          input.payload.final.title,
          input.payload.source,
          input.payload.generated?.title ? 1 : 0,
          input.payload.generated?.title === input.payload.final.title ? 1 : 0,
          now,
          ...draftParams,
        ),
    );
  }
  if (input.evidence.length) {
    statements.push(
      database
        .prepare(
          `INSERT INTO events(id,owner,product,scope,kind,data,at) SELECT ?,?,?,?,?,?,?${draftWhere}`,
        )
        .bind(
          crypto.randomUUID(),
          input.owner,
          input.product.id,
          `store:${input.product.store}`,
          "PREFERENCE_OBSERVATION",
          JSON.stringify(input.evidence),
          now,
          ...draftParams,
        ),
    );
  }
  for (const [taskType, scopeKey] of [
    [PERSONAL_PROFILE_UPDATE, input.owner],
    [GLOBAL_FEEDBACK, "global"],
  ] as const) {
    const dedupeKey = `${eventId}:${taskType}:${scopeKey}`;
    statements.push(
      database
        .prepare(
          "INSERT OR IGNORE INTO learning_queue(id,event_id,owner,product,task_type,scope_key,dedupe_key,payload,status,attempts,available_at,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM events WHERE id=? AND owner=? AND product=?)",
        )
        .bind(
          crypto.randomUUID(),
          eventId,
          input.owner,
          input.product.id,
          taskType,
          scopeKey,
          dedupeKey,
          eventData,
          "queued",
          0,
          now,
          now,
          eventId,
          input.owner,
          input.product.id,
        ),
    );
  }
  if (input.generationId) {
    statements.push(
      database
        .prepare(
          `UPDATE generations SET observed=1 WHERE id=? AND owner=? AND product=? AND observed=0${draftAnd}`,
        )
        .bind(input.generationId, input.owner, input.product.id, ...draftParams),
    );
  }
  return { eventId, statements };
}

export function emptyPricingPolicy() {
  return defaultPricingPolicy;
}
