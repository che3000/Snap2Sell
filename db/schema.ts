import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const drafts = sqliteTable(
  "drafts",
  {
    owner: text("owner").notNull(),
    id: text("id").notNull(),
    store: text("store").notNull(),
    data: text("data").notNull(),
    version: integer("version").notNull(),
    updated: integer("updated").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.id] }),
    index("drafts_owner_store").on(t.owner, t.store),
  ],
);
export const preferences = sqliteTable(
  "preferences",
  {
    owner: text("owner").notNull(),
    scope: text("scope").notNull(),
    data: text("data").notNull(),
    updated: integer("updated").notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.scope] })],
);
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    product: text("product").notNull(),
    scope: text("scope").notNull(),
    kind: text("kind").notNull(),
    data: text("data").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [index("events_owner_scope_time").on(t.owner, t.scope, t.at)],
);
export const generations = sqliteTable("generations", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  product: text("product").notNull(),
  data: text("data").notNull(),
  at: integer("at").notNull(),
  observed: integer("observed").notNull().default(0),
});
export const credentials = sqliteTable("credentials", {
  owner: text("owner").primaryKey(),
  cipher: text("cipher").notNull(),
  model: text("model").notNull(),
  updated: integer("updated").notNull(),
});
export const uploads = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [index("uploads_owner").on(t.owner)],
);
export const marketSnapshots = sqliteTable(
  "market_snapshots",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    product: text("product").notNull(),
    query: text("query").notNull(),
    source: text("source").notNull(),
    globalPolicyVersion: text("global_policy_version"),
    retrievalPlan: text("retrieval_plan"),
    appliedCapabilities: text("applied_capabilities"),
    requestData: text("request_data").notNull(),
    responseData: text("response_data").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [index("market_snapshots_owner_product_time").on(t.owner, t.product, t.fetchedAt)],
);
export const priceRecommendations = sqliteTable(
  "price_recommendations",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    product: text("product").notNull(),
    marketSnapshotId: text("market_snapshot_id").notNull(),
    globalPolicyVersion: text("global_policy_version"),
    personalPreferences: text("personal_preferences").notNull(),
    optionsData: text("options_data").notNull(),
    defaultStrategy: text("default_strategy"),
    selectedStrategy: text("selected_strategy"),
    selectedPrice: integer("selected_price"),
    selectedAt: integer("selected_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("price_recommendations_owner_product_time").on(t.owner, t.product, t.createdAt)],
);
export const learningQueue = sqliteTable(
  "learning_queue",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    owner: text("owner").notNull(),
    product: text("product").notNull(),
    taskType: text("task_type").notNull(),
    scopeKey: text("scope_key").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: integer("available_at").notNull(),
    batchId: text("batch_id"),
    proposalId: text("proposal_id"),
    createdAt: integer("created_at").notNull(),
    processedAt: integer("processed_at"),
    lastError: text("last_error"),
  },
  (t) => [
    uniqueIndex("learning_queue_dedupe").on(t.dedupeKey),
    index("learning_queue_task_status_time").on(t.taskType, t.status, t.availableAt, t.createdAt),
    index("learning_queue_scope_status_time").on(t.scopeKey, t.taskType, t.status, t.createdAt),
  ],
);
export const learningBatches = sqliteTable("learning_batches", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  triggerCount: integer("trigger_count").notNull(),
  queueCount: integer("queue_count").notNull(),
  triggerType: text("trigger_type").notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  summaryData: text("summary_data"),
  candidatePolicyData: text("candidate_policy_data"),
  error: text("error"),
});
export const globalPolicies = sqliteTable("global_policies", {
  version: text("version").primaryKey(),
  status: text("status").notNull(),
  basedOnVersion: text("based_on_version"),
  batchId: text("batch_id"),
  data: text("data").notNull(),
  createdAt: integer("created_at").notNull(),
  activatedAt: integer("activated_at"),
  rolledBackAt: integer("rolled_back_at"),
});
export const agentProposals = sqliteTable(
  "agent_proposals",
  {
    id: text("id").primaryKey(),
    agentType: text("agent_type").notNull(),
    scope: text("scope").notNull(),
    scopeKey: text("scope_key").notNull(),
    eventId: text("event_id"),
    batchId: text("batch_id"),
    baseVersion: text("base_version"),
    proposalData: text("proposal_data").notNull(),
    confidence: integer("confidence"),
    gateData: text("gate_data"),
    status: text("status").notNull(),
    appliedVersion: text("applied_version"),
    createdAt: integer("created_at").notNull(),
    evaluatedAt: integer("evaluated_at"),
    error: text("error"),
  },
  (t) => [
    index("agent_proposals_scope_agent_time").on(t.scopeKey, t.agentType, t.createdAt),
    index("agent_proposals_status_time").on(t.status, t.createdAt),
  ],
);
export const personalProfileVersions = sqliteTable(
  "personal_profile_versions",
  {
    version: text("version").primaryKey(),
    owner: text("owner").notNull(),
    basedOnVersion: text("based_on_version"),
    proposalId: text("proposal_id"),
    status: text("status").notNull(),
    data: text("data").notNull(),
    createdAt: integer("created_at").notNull(),
    activatedAt: integer("activated_at"),
    rolledBackAt: integer("rolled_back_at"),
  },
  (t) => [index("personal_profile_versions_owner_status_time").on(t.owner, t.status, t.createdAt)],
);
export const policyEvaluations = sqliteTable("policy_evaluations", {
  id: text("id").primaryKey(),
  policyVersion: text("policy_version").notNull(),
  basedOnVersion: text("based_on_version"),
  scope: text("scope").notNull(),
  windowStart: integer("window_start").notNull(),
  windowEnd: integer("window_end").notNull(),
  sampleCount: integer("sample_count").notNull(),
  metricData: text("metric_data").notNull(),
  decision: text("decision").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const productIdentities = sqliteTable(
  "product_identities",
  {
    id: text("id").primaryKey(),
    canonicalKey: text("canonical_key").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    attributes: text("attributes").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("product_identities_canonical_key").on(t.canonicalKey),
    index("product_identities_model_name").on(t.model, t.name),
  ],
);
export const titleVariants = sqliteTable(
  "title_variants",
  {
    id: text("id").primaryKey(),
    identityId: text("identity_id").notNull(),
    owner: text("owner").notNull(),
    product: text("product").notNull(),
    title: text("title").notNull(),
    source: text("source").notNull(),
    wasGenerated: integer("was_generated").notNull(),
    accepted: integer("accepted").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("title_variants_identity_time").on(t.identityId, t.createdAt),
    index("title_variants_owner_time").on(t.owner, t.createdAt),
  ],
);
