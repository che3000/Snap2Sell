import {
  globalPolicySchema,
  personalProfileSchema,
  validatePersonalGate,
  validatePricingGate,
  type GlobalPolicy,
} from "../../packages/learning";
import type { Preferences } from "../../packages/contracts";
import {
  runGlobalMarketFilterAgent,
  runGlobalPricingAgent,
  runGlobalTitleStructureAgent,
  runPersonalProfileAgent,
} from "./learning-agent";
import {
  GLOBAL_FEEDBACK,
  PERSONAL_PROFILE_UPDATE,
  globalLearningTriggerCount,
  globalAgentMinConfidence,
  globalRollbackAdoptionThreshold,
  globalRollbackMinSample,
  personalProfileMaxDimensionChanges,
  personalProfileMinConfidence,
  activeGlobalPolicy,
  activePersonalProfile,
  type FeedbackPayload,
} from "./learning";
import { db } from "./storage";

type QueueRow = {
  id: string;
  event_id: string;
  owner: string;
  product: string;
  payload: string;
  attempts: number;
};

function confidencePercent(value: number | undefined) {
  return value === undefined ? null : Math.round(value * 100);
}

async function claimJob(taskType: string, scopeKey?: string) {
  const condition = scopeKey
    ? "task_type=? AND scope_key=?"
    : "task_type=?";
  const params = scopeKey ? [taskType, scopeKey] : [taskType];
  const row = await db()
    .prepare(
      `SELECT id,event_id,owner,product,payload,attempts FROM learning_queue WHERE ${condition} AND status='queued' AND available_at<=? ORDER BY created_at LIMIT 1`,
    )
    .bind(...params, Date.now())
    .first<QueueRow>();
  if (!row) return null;
  const claimed = await db()
    .prepare("UPDATE learning_queue SET status='processing',attempts=attempts+1 WHERE id=? AND status='queued'")
    .bind(row.id)
    .run();
  return claimed.meta.changes ? row : null;
}

async function failJob(row: QueueRow, error: unknown) {
  await db()
    .prepare(
      "UPDATE learning_queue SET status='failed',last_error=?,processed_at=? WHERE id=?",
    )
    .bind(error instanceof Error ? error.message.slice(0, 500) : "learning job failed", Date.now(), row.id)
    .run();
}

async function finishJob(row: QueueRow, proposalId?: string, batchId?: string) {
  await db()
    .prepare(
      "UPDATE learning_queue SET status='completed',proposal_id=?,batch_id=COALESCE(?,batch_id),processed_at=? WHERE id=?",
    )
    .bind(proposalId || null, batchId || null, Date.now(), row.id)
    .run();
}

function diffProfile(base: Preferences, patch: Partial<Preferences>) {
  return Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => value !== undefined && value !== base[key as keyof Preferences]),
  ) as Partial<Preferences>;
}

function constrainMarketPatch(
  patch: {
    retrieval?: {
      sourcePriority?: string[];
      sourceQuota?: Record<string, number>;
      queryHints?: string[];
    };
    sourceWeights?: Record<string, number>;
    sourceAllowList?: string[];
    sourceBlockList?: string[];
    maxSourceShare?: number | null;
  },
  sourceStats: Record<string, unknown>,
) {
  const observed = new Set(
    Object.keys(sourceStats)
      .map((source) => source.toLowerCase())
      .filter((source) => source !== "unknown"),
  );
  const keep = (source: string) => observed.has(source.toLowerCase());
  const retrieval = patch.retrieval
    ? {
        ...patch.retrieval,
        sourcePriority: patch.retrieval.sourcePriority?.filter(keep),
        sourceQuota: patch.retrieval.sourceQuota
          ? Object.fromEntries(
              Object.entries(patch.retrieval.sourceQuota)
                .filter(([source]) => keep(source))
                .map(([source, quota]) => [source.toLowerCase(), quota]),
            )
          : undefined,
      }
    : undefined;
  return {
    ...patch,
    ...(retrieval ? { retrieval } : {}),
    sourceWeights: Object.fromEntries(
      Object.entries(patch.sourceWeights || {})
        .filter(([source]) => keep(source))
        .map(([source, weight]) => [source.toLowerCase(), weight]),
    ),
    sourceAllowList: (patch.sourceAllowList || []).filter(keep),
    sourceBlockList: (patch.sourceBlockList || []).filter(keep),
  };
}

async function processPersonalJob(row: QueueRow) {
  const current = await activePersonalProfile(row.owner);
  const payload = JSON.parse(row.payload) as FeedbackPayload;
  const observations = await db()
    .prepare("SELECT data FROM events WHERE owner=? AND kind='PREFERENCE_OBSERVATION' ORDER BY at DESC LIMIT 100")
    .bind(row.owner)
    .all<{ data: string }>();
  const proposal = await runPersonalProfileAgent(row.owner, {
    profile: current.profile,
    baseVersion: current.version,
    event: payload,
    observations: observations.results.map((item) => JSON.parse(item.data)),
  });
  const patch = diffProfile(current.profile, proposal.profilePatch);
  const normalized = { ...proposal, baseVersion: current.version, profilePatch: patch };
  const gate = validatePersonalGate(
    normalized,
    current.version,
    personalProfileMinConfidence(),
    personalProfileMaxDimensionChanges(),
  );
  const proposalId = crypto.randomUUID();
  const now = Date.now();
  const nextVersion = gate.ok ? `seller-${crypto.randomUUID()}` : null;
  const nextProfile = gate.ok
    ? personalProfileSchema.parse({ ...current.profile, ...patch })
    : null;
  const statements = [
    db()
      .prepare(
        "INSERT INTO agent_proposals(id,agent_type,scope,scope_key,event_id,base_version,proposal_data,confidence,gate_data,status,applied_version,created_at,evaluated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        proposalId,
        "PersonalProfileAgent",
        "seller",
        row.owner,
        row.event_id,
        current.version,
        JSON.stringify(normalized),
        confidencePercent(proposal.confidence),
        JSON.stringify(gate),
        gate.ok ? "applied" : "rejected",
        nextVersion,
        now,
        now,
      ),
  ];
  if (gate.ok && nextVersion && nextProfile) {
    statements.push(
      db()
        .prepare("UPDATE personal_profile_versions SET status='retired' WHERE owner=? AND status='active'")
        .bind(row.owner),
      db()
        .prepare(
          "INSERT INTO personal_profile_versions(version,owner,based_on_version,proposal_id,status,data,created_at,activated_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(nextVersion, row.owner, current.version, proposalId, "active", JSON.stringify(nextProfile), now, now),
      db()
        .prepare("INSERT INTO events(id,owner,product,scope,kind,data,at) VALUES(?,?,?,?,?,?,?)")
        .bind(
          crypto.randomUUID(),
          row.owner,
          row.product,
          "seller",
          "AGENT_PROFILE_FEEDBACK",
          JSON.stringify({ proposalId, profileVersion: nextVersion, patch, confidence: proposal.confidence }),
          now,
        ),
    );
  }
  await db().batch(statements);
  await finishJob(row, proposalId);
}

function summarizeGlobalPayloads(rows: QueueRow[]) {
  const payloads = rows.map((row) => JSON.parse(row.payload) as FeedbackPayload);
  const strategyCounts: Record<string, number> = {};
  const priceSelections: Array<{
    strategy: string;
    price: number;
    recommended: number | null;
    reference: number | null;
  }> = [];
  const titleStats = { generated: 0, accepted: 0, edited: 0 };
  const sourceStats: Record<
    string,
    { shown: number; included: number; excluded: number }
  > = {};
  for (const payload of payloads) {
    const strategy = payload.price?.strategy || "manual";
    strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
    if (payload.final.price !== null)
      priceSelections.push({
        strategy,
        price: payload.final.price,
        recommended: payload.price?.recommended ?? null,
        reference: payload.price?.referenceBalanced ?? null,
      });
    if (payload.generated?.title) {
      titleStats.generated += 1;
      if (payload.generated.title === payload.final.title) titleStats.accepted += 1;
      else titleStats.edited += 1;
    }
    for (const source of payload.marketSources || []) {
      const current = sourceStats[source.sourceKey || "unknown"] || {
        shown: 0,
        included: 0,
        excluded: 0,
      };
      current.shown += source.includedCount + source.excludedCount;
      current.included += source.includedCount;
      current.excluded += source.excludedCount;
      sourceStats[source.sourceKey || "unknown"] = current;
    }
  }
  return {
    feedbackCount: payloads.length,
    strategyCounts,
    priceSelections,
    titleStats,
    sourceStats,
  };
}

async function latestPolicyEvaluation() {
  const row = await db()
    .prepare(
      "SELECT policy_version,metric_data,decision,sample_count FROM policy_evaluations ORDER BY created_at DESC LIMIT 1",
    )
    .first<{
      policy_version: string;
      metric_data: string;
      decision: string;
      sample_count: number;
    }>();
  if (!row) return null;
  try {
    return { ...row, metrics: JSON.parse(row.metric_data) as Record<string, unknown> };
  } catch {
    return { ...row, metrics: {} as Record<string, unknown> };
  }
}

async function rollbackTarget(
  policy: GlobalPolicy,
  metrics: ReturnType<typeof policyMetrics>,
) {
  const sampleCount = metrics.sampleCount;
  const adoption = metrics.recommendationAdoptionRate;
  if (
    sampleCount < globalRollbackMinSample() ||
    typeof adoption !== "number" ||
    adoption >= globalRollbackAdoptionThreshold() ||
    !policy.version
  )
    return null;
  const active = policy.version
    ? await db()
        .prepare("SELECT based_on_version FROM global_policies WHERE version=? AND status='active'")
        .bind(policy.version)
        .first<{ based_on_version: string | null }>()
    : null;
  const row = active?.based_on_version
    ? await db()
        .prepare("SELECT version,data FROM global_policies WHERE version=? AND status='retired'")
        .bind(active.based_on_version)
        .first<{ version: string; data: string }>()
    : null;
  if (!row) return null;
  try {
    return globalPolicySchema.parse({ ...JSON.parse(row.data), version: row.version });
  } catch {
    return null;
  }
}

function policyMetrics(aggregate: ReturnType<typeof summarizeGlobalPayloads>) {
  const strategySelections = aggregate.priceSelections.filter(
    (item) => item.strategy !== "manual",
  );
  const recommendationAdoptionRate = strategySelections.length
    ? strategySelections.filter(
        (item) => item.recommended !== null && item.price === item.recommended,
      ).length / strategySelections.length
    : null;
  const titleAcceptanceRate = aggregate.titleStats.generated
    ? aggregate.titleStats.accepted / aggregate.titleStats.generated
    : null;
  return {
    sampleCount: aggregate.feedbackCount,
    strategySelections: strategySelections.length,
    recommendationAdoptionRate,
    titleAcceptanceRate,
    sourceStats: aggregate.sourceStats,
  };
}

async function loadGlobalTitleStats(rows: QueueRow[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    const payload = JSON.parse(row.payload) as FeedbackPayload;
    if (payload.productIdentityId) ids.add(payload.productIdentityId);
  }
  const stats = { identityCount: ids.size, variantCount: 0, acceptedCount: 0 };
  for (const identityId of ids) {
    const row = await db()
      .prepare(
        "SELECT COUNT(*) AS variants,COALESCE(SUM(accepted),0) AS accepted FROM title_variants WHERE identity_id=?",
      )
      .bind(identityId)
      .first<{ variants: number; accepted: number }>();
    stats.variantCount += row?.variants || 0;
    stats.acceptedCount += row?.accepted || 0;
  }
  return stats;
}

async function loadGlobalPrices(rows: QueueRow[]) {
  const prices: number[] = [];
  for (const row of rows) {
    const payload = JSON.parse(row.payload) as FeedbackPayload;
    if (!payload.marketSnapshotId) continue;
    const snapshot = await db()
      .prepare("SELECT response_data FROM market_snapshots WHERE id=? AND owner=? AND product=?")
      .bind(payload.marketSnapshotId, row.owner, row.product)
      .first<{ response_data: string }>();
    if (!snapshot) continue;
    try {
      const response = JSON.parse(snapshot.response_data) as {
        items?: Array<{ price: number; included: boolean; url: string }>;
        summary?: { outliers: string[] } | null;
      };
      const outliers = new Set(response.summary?.outliers || []);
      for (const item of response.items || [])
        if (item.included && !outliers.has(item.url) && Number.isFinite(item.price)) prices.push(item.price);
    } catch {}
  }
  return prices;
}

async function processGlobalBatch() {
  const count = await db()
    .prepare("SELECT COUNT(*) AS count FROM learning_queue WHERE task_type=? AND status='queued' AND available_at<=?")
    .bind(GLOBAL_FEEDBACK, Date.now())
    .first<{ count: number }>();
  const threshold = globalLearningTriggerCount();
  if (!count || count.count < threshold) return false;
  const batchId = crypto.randomUUID();
  const startedAt = Date.now();
  const rows = await db()
    .prepare("SELECT id,event_id,owner,product,payload,attempts FROM learning_queue WHERE task_type=? AND status='queued' AND available_at<=? ORDER BY created_at LIMIT ?")
    .bind(GLOBAL_FEEDBACK, startedAt, threshold)
    .all<QueueRow>();
  if (!rows.results.length) return false;
  const claimedRows: QueueRow[] = [];
  for (const row of rows.results) {
    await db()
      .prepare("UPDATE learning_queue SET status='processing',batch_id=? WHERE id=? AND status='queued'")
      .bind(batchId, row.id)
      .run();
    const claimed = await db()
      .prepare("SELECT id,event_id,owner,product,payload,attempts FROM learning_queue WHERE id=? AND status='processing' AND batch_id=?")
      .bind(row.id, batchId)
      .first<QueueRow>();
    if (claimed) claimedRows.push(claimed);
  }
  const rowsForBatch = claimedRows;
  if (!rowsForBatch.length) return false;
  const agentOwner = rowsForBatch[0].owner;
  const policy = await activeGlobalPolicy();
  const aggregate = summarizeGlobalPayloads(rowsForBatch);
  const prices = await loadGlobalPrices(rowsForBatch);
  const titleIdentityStats = await loadGlobalTitleStats(rowsForBatch);
  const previousEvaluation = await latestPolicyEvaluation();
  const metrics = policyMetrics(aggregate);
  const input = {
    policy,
    aggregate,
    priceDistribution: prices,
    sourceStats: aggregate.sourceStats,
    titleIdentityStats,
    previousEvaluation,
  };
  const proposals: Array<{ agent: string; data: unknown; confidence: number; status: string }> = [];
  let next = policy;
  let policyChanged = false;
  const confidenceGate = globalAgentMinConfidence();
  const target = await rollbackTarget(policy, metrics);
  if (target) {
    next = target;
    policyChanged = true;
    proposals.push({
      agent: "PolicyValidatorPublisher",
      data: {
        decision: "rollback",
        fromVersion: policy.version,
        toVersion: target.version,
        evaluation: previousEvaluation,
      },
      confidence: 1,
      status: "rollback",
    });
  }
  if (!target) {
    try {
    const market = await runGlobalMarketFilterAgent(agentOwner, input);
    const patch = constrainMarketPatch(
      market.marketFilterPatch,
      aggregate.sourceStats,
    );
    const marketPolicy = {
      ...next.marketFilter,
      ...patch,
      retrieval: { ...next.marketFilter.retrieval, ...patch.retrieval },
      sourceWeights: { ...next.marketFilter.sourceWeights, ...patch.sourceWeights },
    };
    const accepted = market.confidence >= confidenceGate;
    if (accepted) {
      next = globalPolicySchema.parse({ ...next, marketFilter: marketPolicy });
      policyChanged = true;
    }
    proposals.push({ agent: "GlobalMarketFilterAgent", data: { ...market, gate: { ok: accepted, minConfidence: confidenceGate } }, confidence: market.confidence, status: accepted ? "applied" : "rejected" });
  } catch (error) {
    console.error("global_market_filter_agent_failed", error instanceof Error ? error.name : "Unknown");
  }
  try {
    const pricing = await runGlobalPricingAgent(agentOwner, input);
    const pricingPolicy = globalPolicySchema.shape.pricing.parse({
      ...next.pricing,
      strategies: { ...next.pricing.strategies, ...pricing.pricingPatch },
    });
    const gate = validatePricingGate(pricingPolicy);
    const accepted = gate.ok && pricing.confidence >= confidenceGate;
    proposals.push({ agent: "GlobalPricingAgent", data: { ...pricing, gate: { ...gate, confidence: accepted, minConfidence: confidenceGate } }, confidence: pricing.confidence, status: accepted ? "applied" : "rejected" });
    if (accepted) {
      next = globalPolicySchema.parse({ ...next, pricing: pricingPolicy });
      policyChanged = true;
    }
  } catch (error) {
    console.error("global_pricing_agent_failed", error instanceof Error ? error.name : "Unknown");
  }
  try {
    const title = await runGlobalTitleStructureAgent(agentOwner, input);
    proposals.push({ agent: "GlobalTitleStructureAgent", data: title, confidence: title.confidence, status: title.confidence >= confidenceGate ? "shadow" : "rejected" });
  } catch (error) {
    console.error("global_title_agent_failed", error instanceof Error ? error.name : "Unknown");
  }
  }
  const version = policyChanged ? `global-${crypto.randomUUID()}` : policy.version;
  next = globalPolicySchema.parse({ ...next, version });
  const now = Date.now();
  const statements = [
    db()
      .prepare("INSERT INTO learning_batches(id,status,trigger_count,queue_count,trigger_type,started_at,finished_at,summary_data,candidate_policy_data) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(batchId, "completed", threshold, rowsForBatch.length, "GLOBAL_QUEUE_THRESHOLD", startedAt, now, JSON.stringify({ ...aggregate, priceDistribution: prices }), JSON.stringify(next)),
  ];
  if (policy.version) {
    statements.push(
      db()
        .prepare(
          "INSERT INTO policy_evaluations(id,policy_version,based_on_version,scope,window_start,window_end,sample_count,metric_data,decision,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          policy.version,
          policy.version,
          "global",
          startedAt,
          now,
          metrics.sampleCount,
          JSON.stringify(metrics),
          target ? "rollback_applied" : "observed",
          now,
        ),
    );
  }
  if (policyChanged && version) {
    statements.push(
      db()
        .prepare("UPDATE global_policies SET status='retired' WHERE status='active'"),
      db()
        .prepare("INSERT INTO global_policies(version,status,based_on_version,batch_id,data,created_at,activated_at) VALUES(?,?,?,?,?,?,?)")
        .bind(version, "active", policy.version, batchId, JSON.stringify(next), now, now),
    );
  }
  for (const proposal of proposals) {
    const proposalId = crypto.randomUUID();
    statements.push(
      db()
        .prepare("INSERT INTO agent_proposals(id,agent_type,scope,scope_key,batch_id,base_version,proposal_data,confidence,gate_data,status,applied_version,created_at,evaluated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(proposalId, proposal.agent, "global", "global", batchId, policy.version, JSON.stringify(proposal.data), confidencePercent(proposal.confidence), JSON.stringify({ automatic: true }), proposal.status, proposal.status === "applied" ? version : null, now, now),
    );
  }
  for (const row of rowsForBatch)
    statements.push(
      db()
        .prepare("UPDATE learning_queue SET status='completed',processed_at=? WHERE id=?")
        .bind(now, row.id),
    );
  await db().batch(statements);
  return true;
}

export async function processLearningJobs(owner?: string) {
  const row = await claimJob(PERSONAL_PROFILE_UPDATE, owner);
  if (row) {
    try {
      await processPersonalJob(row);
    } catch (error) {
      await failJob(row, error);
    }
  }
  try {
    await processGlobalBatch();
  } catch (error) {
    console.error("global_learning_batch_failed", error instanceof Error ? error.name : "Unknown");
  }
}

export async function processLearningJobsAuthorized(token: string | null) {
  const expected = process.env.LEARNING_WORKER_TOKEN;
  if (!expected || !token || token !== expected) return false;
  await processLearningJobs();
  return true;
}
