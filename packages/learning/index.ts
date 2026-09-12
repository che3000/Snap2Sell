import {
  defaults,
  preferenceSchema,
  pricingPolicySchema,
  type Preferences,
  type PricingPolicy,
} from "../contracts";
import { z } from "zod";

export const marketFilterPolicySchema = z
  .object({
    retrieval: z
      .object({
        sourcePriority: z.array(z.string().max(200)).max(100).optional(),
        sourceQuota: z.record(z.number().min(0).max(1)).optional(),
        queryHints: z.array(z.string().max(200)).max(20).optional(),
      })
      .optional(),
    sourceWeights: z.record(z.number().min(-1).max(1)),
    sourceAllowList: z.array(z.string().max(200)).max(100),
    sourceBlockList: z.array(z.string().max(200)).max(100),
    maxSourceShare: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const globalPolicySchema = z
  .object({
    version: z.string().nullable(),
    marketFilter: marketFilterPolicySchema,
    pricing: pricingPolicySchema,
    title: z.object({
      enabled: z.boolean(),
      structure: z.record(z.unknown()),
    }),
  })
  .strict();
export type GlobalPolicy = z.infer<typeof globalPolicySchema>;

export const personalProfileSchema = preferenceSchema;

const personalLearnableSchema = preferenceSchema.omit({ titleFormat: true });

const evidenceSchema = z
  .object({
    dimension: z.enum([
      "length",
      "tone",
      "emoji",
      "technical",
      "marketing",
      "pricing",
    ]),
    value: z.string().max(100),
    reasonCode: z.string().max(100),
    weight: z.number().min(0).max(10),
  })
  .strict();

export const personalProfileProposalSchema = z
  .object({
    scope: z.literal("seller"),
    baseVersion: z.string().nullable(),
    profilePatch: personalLearnableSchema.partial(),
    evidence: z.array(evidenceSchema).max(30),
    confidence: z.number().min(0).max(1),
    contradictions: z.array(z.string().max(200)).max(20),
  })
  .strict();
export type PersonalProfileProposal = z.infer<
  typeof personalProfileProposalSchema
>;

export const globalMarketFilterProposalSchema = z
  .object({
    marketFilterPatch: marketFilterPolicySchema.partial(),
    confidence: z.number().min(0).max(1),
    reasonCodes: z.array(z.string().max(100)).max(20),
  })
  .strict();

export const globalPricingProposalSchema = z
  .object({
    pricingPatch: z
      .object({
        profit_first: z.object({ percentile: z.number().min(0).max(1) }).optional(),
        momentum_price: z.object({ percentile: z.number().min(0).max(1) }).optional(),
        traffic_first: z.object({ percentile: z.number().min(0).max(1) }).optional(),
      })
      .strict(),
    confidence: z.number().min(0).max(1),
    reasonCodes: z.array(z.string().max(100)).max(20),
  })
  .strict();

export const globalTitleProposalSchema = z
  .object({
    titleStructurePatch: z.record(z.unknown()),
    confidence: z.number().min(0).max(1),
    reasonCodes: z.array(z.string().max(100)).max(20),
  })
  .strict();

export const defaultPricingPolicy: PricingPolicy = {
  version: null,
  defaultStrategy: "momentum_price",
  order: ["momentum_price", "traffic_first", "profit_first"],
  strategies: {
    profit_first: { percentile: 0.7 },
    momentum_price: { percentile: 0.5 },
    traffic_first: { percentile: 0.3 },
  },
};

export const defaultGlobalPolicy: GlobalPolicy = {
  version: null,
  marketFilter: {
    retrieval: {},
    sourceWeights: {},
    sourceAllowList: [],
    sourceBlockList: [],
    maxSourceShare: null,
  },
  pricing: defaultPricingPolicy,
  title: { enabled: false, structure: {} },
};

export function mergePreferences(
  explicit: Partial<Preferences>,
  profile: Partial<Preferences>,
) {
  return preferenceSchema.parse({ ...defaults, ...profile, ...explicit });
}

export function mergeGlobalPolicy(
  current: GlobalPolicy,
  patch: Partial<GlobalPolicy>,
): GlobalPolicy {
  const marketFilter = patch.marketFilter
    ? { ...current.marketFilter, ...patch.marketFilter }
    : current.marketFilter;
  const pricing = patch.pricing
    ? {
        ...current.pricing,
        ...patch.pricing,
        strategies: {
          ...current.pricing.strategies,
          ...(patch.pricing.strategies || {}),
        },
      }
    : current.pricing;
  return globalPolicySchema.parse({
    ...current,
    ...patch,
    marketFilter,
    pricing,
    title: patch.title ? { ...current.title, ...patch.title } : current.title,
  });
}

export type GateResult = {
  ok: boolean;
  reasons: string[];
};

export function validatePersonalGate(
  proposal: PersonalProfileProposal,
  currentVersion: string | null,
  minConfidence = 0.7,
  maxDimensionChanges = 2,
): GateResult {
  const changed = Object.keys(proposal.profilePatch);
  const reasons: string[] = [];
  if (proposal.baseVersion !== currentVersion) reasons.push("stale_base_version");
  if (proposal.confidence < minConfidence) reasons.push("low_confidence");
  if (proposal.contradictions.length) reasons.push("contradictions_present");
  if (changed.length > maxDimensionChanges) reasons.push("too_many_dimensions");
  return { ok: reasons.length === 0, reasons };
}

export function validatePricingGate(
  policy: PricingPolicy,
  minPercentile = 0.1,
  maxPercentile = 0.9,
  minGap = 0.05,
): GateResult {
  const values = [
    policy.strategies.traffic_first.percentile,
    policy.strategies.momentum_price.percentile,
    policy.strategies.profit_first.percentile,
  ];
  const reasons: string[] = [];
  if (values.some((value) => value < minPercentile || value > maxPercentile))
    reasons.push("percentile_out_of_bounds");
  if (
    policy.strategies.traffic_first.percentile >
      policy.strategies.momentum_price.percentile - minGap ||
    policy.strategies.momentum_price.percentile >
      policy.strategies.profit_first.percentile - minGap
  )
    reasons.push("strategy_percentiles_too_close_or_reversed");
  if (new Set(policy.order).size !== 3) reasons.push("invalid_strategy_order");
  return { ok: reasons.length === 0, reasons };
}

export function toVersion(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
