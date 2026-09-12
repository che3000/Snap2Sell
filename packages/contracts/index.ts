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
export const imageSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
});
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
  price: z.number().min(0).max(100000000).nullable(),
  stock: z.number().int().min(0).max(1000000).nullable(),
  shipping: z.string().max(300),
  warranty: z.string().max(500),
  variants: z.string().max(1000),
  images: z.array(imageSchema).max(9),
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
