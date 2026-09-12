import { defaults, type Preferences, type Evidence } from "../contracts";
export const scopeChain = (store: string, category: string) => [
  "seller",
  `store:${store}`,
  `category:${store}:${category}`,
];
export function inferEdits(
  before: { title: string; description: string },
  after: { title: string; description: string },
  productId: string,
  scope: string,
  at = Date.now(),
): Evidence[] {
  const output: Evidence[] = [];
  const add = (dimension: keyof Preferences, value: string) =>
    output.push({
      id: crypto.randomUUID(),
      productId,
      scope,
      at,
      dimension,
      value,
      source: "implicit",
      weight: 1,
    });
  if (
    before.description.length > 60 &&
    after.description.length < before.description.length * 0.75 &&
    after.description.length > 15
  )
    add("length", "concise");
  if (
    /\p{Extended_Pictographic}/u.test(before.description) &&
    !/\p{Extended_Pictographic}/u.test(after.description)
  )
    add("emoji", "none");
  if (
    !/\p{Extended_Pictographic}/u.test(before.description) &&
    /\p{Extended_Pictographic}/u.test(after.description)
  )
    add("emoji", "medium");
  if (before.title.includes("【") && !after.title.includes("【"))
    add("titleFormat", "plain");
  return output;
}
export function resolvePreferences(
  explicit: Record<string, Partial<Preferences>>,
  events: Evidence[],
  scopes: string[],
  current: Partial<Preferences> = {},
  now = Date.now(),
): { profile: Preferences; learned: Partial<Preferences> } {
  const learned: Partial<Preferences> = {};
  let profile = { ...defaults };
  for (const scope of scopes) {
    const scoped = events.filter((e) => e.scope === scope);
    for (const dimension of Object.keys(defaults) as (keyof Preferences)[]) {
      const rows = scoped.filter((e) => e.dimension === dimension);
      const scores: Record<string, number> = {};
      const ids: Record<string, Set<string>> = {};
      for (const e of rows) {
        const age = Math.max(0, now - e.at) / 86400000;
        const w = e.weight * Math.pow(0.5, age / 30);
        scores[e.value] = (scores[e.value] || 0) + w;
        (ids[e.value] ??= new Set()).add(e.productId);
      }
      const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
      const total = Object.values(scores).reduce((a, b) => a + b, 0);
      if (
        best &&
        ids[best[0]].size >= 3 &&
        best[1] >= 2 &&
        best[1] / total >= 0.8
      ) {
        Object.assign(profile, { [dimension]: best[0] });
        Object.assign(learned, { [dimension]: best[0] });
      }
    }
    profile = { ...profile, ...explicit[scope] };
  }
  return { profile: { ...profile, ...current }, learned };
}
