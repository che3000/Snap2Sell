import { z } from "zod";
export const preferenceSchema = z.object({
  length: z.enum(["concise", "medium", "detailed"]).default("medium"),
  tone: z
    .enum(["professional", "friendly", "y2k", "minimalist"])
    .default("professional"),
  emoji: z.enum(["none", "low", "medium"]).default("low"),
  technical: z.enum(["moderate", "high"]).default("moderate"),
  marketing: z.enum(["low", "moderate"]).default("low"),
  titleFormat: z.enum(["plain", "brackets"]).default("plain"),
  pricing: z.enum(["competitive", "balanced", "premium"]).default("balanced"),
});
export type Preferences = z.infer<typeof preferenceSchema>;
export const defaults: Preferences = preferenceSchema.parse({});
export const pricingStrategySchema = z.enum([
  "profit_first",
  "momentum_price",
  "traffic_first",
]);
export type PricingStrategy = z.infer<typeof pricingStrategySchema>;
export const pricingPolicySchema = z.object({
  version: z.string().nullable().optional(),
  defaultStrategy: pricingStrategySchema,
  order: z.array(pricingStrategySchema).length(3),
  strategies: z.object({
    profit_first: z.object({ percentile: z.number().min(0).max(1) }),
    momentum_price: z.object({ percentile: z.number().min(0).max(1) }),
    traffic_first: z.object({ percentile: z.number().min(0).max(1) }),
  }),
});
export type PricingPolicy = z.infer<typeof pricingPolicySchema>;
const priceRecommendationSchema = z.object({
  percentile: z.number().min(0).max(1),
  price: z.number().positive(),
});
export const priceRecommendationsSchema = z.object({
  referenceMarketMedian: z.number().positive(),
  strategies: z.object({
    profit_first: priceRecommendationSchema,
    momentum_price: priceRecommendationSchema,
    traffic_first: priceRecommendationSchema,
  }),
  defaultStrategy: pricingStrategySchema,
  policyVersion: z.string().nullable().optional(),
});
export type PriceRecommendations = z.infer<
  typeof priceRecommendationsSchema
>;
export const imageSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
});
export const analysisResultSchema = z.object({
  name: z.string().max(200),
  brand: z.string().max(100),
  model: z.string().max(100),
  category: z.string().max(100),
  identityConfidence: z.enum(["high_confidence", "probable", "uncertain"]),
  identityEvidence: z.string().max(1000),
  observations: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        value: z.string().max(500),
        evidence: z.string().max(1000),
        confidence: z.enum(["high_confidence", "probable", "uncertain"]),
      }),
    )
    .max(30),
  questions: z.array(z.string().max(500)).max(10),
});
export const clarifiedResultSchema = analysisResultSchema.extend({
  condition: z.enum(["", "全新", "二手", "拆封未使用"]),
  shipping: z.string().max(300),
  warranty: z.string().max(500),
  variants: z.string().max(1000),
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export const marketResearchSchema = z.object({
  marketSnapshotId: z.string().optional(),
  priceRecommendationId: z.string().optional(),
  globalPolicyVersion: z.string().nullable().optional(),
  retrievalPlan: z.unknown().optional(),
  appliedCapabilities: z.array(z.string()).optional(),
  fallback: z.object({status:z.enum(["completed","failed"]),reason:z.string(),source:z.string(),at:z.string()}).optional(),
  referenceOnly: z.boolean().optional(),
  query: z.string(),
  at: z.string(),
  source: z.string(),
  conditionBasis: z.string(),
  provisional: z.boolean(),
  items: z
    .array(
      z.object({
        title: z.string(),
        price: z.number(),
        url: z.string(),
        currency: z.string(),
        min: z.number().nullable(),
        max: z.number().nullable(),
        reason: z.string(),
        included: z.boolean(),
        manualExcluded: z.boolean().optional(),
        manualIncluded: z.boolean().optional(),
        sourceKey: z.string().optional(),
        priceSource: z.string().optional(),
        priceEvidence: z.string().optional(),
      }),
    )
    .max(50),
  summary: z
    .object({
      count: z.number(),
      low: z.number(),
      high: z.number(),
      competitive: z.number(),
      balanced: z.number(),
      premium: z.number(),
      outliers: z.array(z.string()),
    })
    .nullable(),
  pricingPolicy: pricingPolicySchema.optional(),
  priceRecommendations: priceRecommendationsSchema.optional(),
});
export type MarketResearch = z.infer<typeof marketResearchSchema>;
export const sellerFieldsSchema = z.object({
  ratio: z.enum(["1:1", "3:4"]).optional(),
  gtin: z.string().max(80).optional(),
  noGtin: z.boolean().optional(),
  marketingImage: imageSchema.optional(),
  video: imageSchema.optional(),
  descriptionImages: z.array(imageSchema).max(12).optional(),
  minPurchase: z.number().int().min(1).max(1000000).optional(),
  weight: z.string().max(30).optional(),
  width: z.string().max(30).optional(),
  length: z.string().max(30).optional(),
  height: z.string().max(30).optional(),
  restricted: z.boolean().optional(),
  longerPreparation: z.boolean().optional(),
  preparationDays: z.number().int().min(1).max(90).optional(),
  scheduledAt: z.string().max(40).optional(),
  sku: z.string().max(100).optional(),
  carriers: z
    .array(
      z.object({
        name: z.string().max(80),
        fee: z.number().min(0).max(100000),
        enabled: z.boolean(),
      }),
    )
    .max(20)
    .optional(),
  discounts: z
    .array(
      z.object({ quantity: z.number().int().min(2), price: z.number().min(0) }),
    )
    .max(10)
    .optional(),
});
export type SellerFields = z.infer<typeof sellerFieldsSchema>;
export const productSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().max(200),
  brand: z.string().max(100),
  model: z.string().max(100),
  category: z.string().max(100),
  condition: z.string().max(80),
  attributes: z.record(z.string().max(100), z.string().max(500)),
  title: z.string().max(300),
  description: z.string().max(10000),
  priceIsSuggested: z.boolean().optional(),
  price: z.number().min(0).max(100000000).nullable(),
  stock: z.number().int().min(0).max(1000000).nullable(),
  shipping: z.string().max(300),
  warranty: z.string().max(500),
  variants: z.string().max(1000),
  images: z.array(imageSchema).max(9),
  seller: sellerFieldsSchema.optional(),
  pendingQuestions: z.boolean().optional(),
  answers: z
    .array(
      z.object({
        question: z.string().max(500),
        answer: z.string().min(1).max(1000),
      }),
    )
    .max(40)
    .optional(),
  analysis: analysisResultSchema.optional(),
  market: marketResearchSchema.optional(),
  confirmed: z.boolean(),
  version: z.number().int().min(0),
  store: z.string().min(1).max(80),
});
export type Product = z.infer<typeof productSchema>;
export type Evidence = {
  id: string;
  productId: string;
  at: number;
  dimension: keyof Preferences;
  value: string;
  source: "explicit" | "implicit";
  scope: string;
  weight: number;
};
export type Comparable = {
  title: string;
  price: number;
  url: string;
  model: string;
  condition: string;
  variant: string;
  kind: "product" | "accessory" | "bundle";
  fetchedAt: string;
};
export type MarketPriceEvidence = {
  distribution?: Array<{ percentile: number; price: number }>;
  history?: Array<{ observedAt: string; price: number }>;
  sampleCount?: number;
  basis?: "current_listings" | "historical" | "biggo_aggregate";
};
