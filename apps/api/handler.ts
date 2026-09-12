import {servicesDisabled,stoppedResponse} from "../../packages/shared/service-status";
import { z } from "zod";
import { loginCookie, logoutCookie, testLoginEnabled } from "./test-auth";
import {
  productSchema,
  preferenceSchema,
  defaults,
  type Product,
  type Evidence,
  type Preferences,
} from "../../packages/contracts";
import {
  scopeChain,
  describeDescriptionStyle,
  inferEdits,
  resolvePreferences,
} from "../../packages/preferences";
import { generateListing, previewFromAnalysis } from "../../packages/listing";
import { missingInformation } from "../../packages/product";
import { webPriceResearch } from "./market-fallback";
import { researchWithFallback } from "../../packages/market/fallback";
import { research } from "../../packages/market/biggo";
import { ai } from "./openai";
import {
  activeGlobalPolicy,
  activePersonalProfile,
  feedbackStatements,
  productIdentityId,
  saveMarketSnapshot,
} from "./learning";
import {
  processLearningJobs,
  processLearningJobsAuthorized,
} from "./learning-orchestrator";
import { db, bucket, owner } from "./storage";
import { AppError, json, readLimited } from "../../packages/shared/http";
import { seal } from "./secrets";
async function profile(
  user: string,
  store: string,
  category: string,
  current: Partial<Preferences> = {},
) {
  const scopes = scopeChain(store, category);
  const rows = await db()
    .prepare("SELECT scope,data FROM preferences WHERE owner=?")
    .bind(user)
    .all<{ scope: string; data: string }>();
  const events = await db()
    .prepare(
      "SELECT data FROM events WHERE owner=? AND kind=? ORDER BY at DESC LIMIT 500",
    )
    .bind(user, "PREFERENCE_OBSERVATION")
    .all<{ data: string }>();
  const explicit = Object.fromEntries(
    rows.results.map((r) => [r.scope, JSON.parse(r.data)]),
  );
  const evidence: Evidence[] = events.results.flatMap((r) =>
    JSON.parse(r.data),
  );
  const personal = await activePersonalProfile(user);
  const explicitByScope = Object.fromEntries(
    scopes.map((scope) => [scope, explicit[scope] || {}]),
  );
  const explicitOverride = Object.assign({}, ...scopes.map((scope) => explicitByScope[scope]));
  const resolved = resolvePreferences(explicit, evidence, scopes);
  return {
    profile: {
      ...resolved.profile,
      ...personal.profile,
      titleFormat: defaults.titleFormat,
      ...explicitOverride,
      ...current,
    },
    learned: resolved.learned,
    personalProfileVersion: personal.version,
    explicit,
    evidenceCount: evidence.length,
  };
}

const saveListingSchema = z.object({
  title: z.string().max(300),
  description: z.string().max(10000),
  warnings: z.array(z.string()).max(20),
});

function shouldUseSaveGeneratedField(
  product: Product,
  field: "title" | "description",
) {
  const preview = previewFromAnalysis({
    ...product,
    title: "",
    description: "",
  });
  const value = product[field].trim();
  return !value || value === (preview[field] || "").trim();
}

async function generateSaveListing(user: string, product: Product) {
  const preferences = (
    await profile(user, product.store, product.category)
  ).profile;
  try {
    return saveListingSchema.parse(await ai(user, product, "generate", preferences));
  } catch (error) {
    // Saving a draft must remain available when the shared AI is unavailable.
    console.error("snap2sell_save_generation_fallback", {
      error: error instanceof Error ? error.name : "Unknown",
    });
    return { ...generateListing(product, preferences), warnings: [] };
  }
}

export async function handle(request: Request, action: string) {
  if(servicesDisabled())return stoppedResponse();
  try {
    if (["login", "logout"].includes(action) && request.method === "POST") {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        throw new AppError("不允許跨網站操作。", 403);
      const secure = new URL(request.url).protocol === "https:";
      let cookie = logoutCookie(secure);
      if (action === "login") {
        const credentials = z
          .object({
            username: z.string().max(100),
            password: z.string().max(200),
          })
          .parse(JSON.parse(await readLimited(request, 4096)));
        cookie = loginCookie(
          credentials.username,
          credentials.password,
          secure,
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie": cookie,
        },
      });
    }
    if (action === "learning" && request.method === "POST") {
      const processed = await processLearningJobsAuthorized(
        request.headers.get("x-learning-token"),
      );
      if (!processed) throw new AppError("不允許執行 learning worker。", 403);
      return json({ ok: true });
    }
    const user = owner(request);
    if (request.method === "GET") {
      if (action === "bootstrap") {
        const rows = await db()
          .prepare(
            "SELECT data,version FROM drafts WHERE owner=? ORDER BY updated DESC LIMIT 200",
          )
          .bind(user)
          .all<{ data: string; version: number }>();
        const key = await db()
          .prepare("SELECT model FROM credentials WHERE owner=?")
          .bind(user)
          .first<{ model: string }>();
        return json({
          drafts: rows.results.map((r) => ({
            ...JSON.parse(r.data),
            version: r.version,
          })),
          settings: {
            configured: testLoginEnabled()
              ? !!process.env.OPENAI_API_KEY
              : !!key,
            shared: testLoginEnabled(),
            model: testLoginEnabled()
              ? process.env.OPENAI_MODEL || "gpt-4.1-mini"
              : key?.model || "gpt-4.1-mini",
          },
          ...(await profile(user, "main", "")),
        });
      }
      if (action === "preferences") {
        const u = new URL(request.url);
        return json(
          await profile(
            user,
            u.searchParams.get("store") || "main",
            u.searchParams.get("category") || "",
          ),
        );
      }
      throw new AppError("找不到此功能。", 404);
    }
    if (request.method !== "POST")
      throw new AppError("不支援此操作方式。", 405);
    if (action === "upload") {
      const mime = request.headers.get("content-type") || "";
      const maxBytes =
        mime === "video/mp4" ? 30 * 1024 * 1024 : 5 * 1024 * 1024;
      if (
        !["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(mime)
      )
        throw new AppError("僅支援 JPG、PNG、WebP 或 MP4。");
      const len = Number(request.headers.get("content-length"));
      if (len > maxBytes)
        throw new AppError("圖片限 5 MB，影片限 30 MB。", 413);
      const reader = request.body?.getReader();
      if (!reader) throw new AppError("沒有圖片內容。");
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new AppError("圖片限 5 MB，影片限 30 MB。", 413);
        }
        chunks.push(r.value);
      }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) {
        bytes.set(c, at);
        at += c.length;
      }
      const valid =
        mime === "video/mp4"
          ? new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp"
          : mime === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : mime === "image/png"
              ? [137, 80, 78, 71, 13, 10, 26, 10].every(
                  (v, i) => bytes[i] === v,
                )
              : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
                new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
      if (!valid) throw new AppError("圖片內容與格式不符。");
      const id = crypto.randomUUID();
      let name = "商品照片";
      try {
        name = decodeURIComponent(
          request.headers.get("x-file-name") || name,
        ).slice(0, 200);
      } catch {}
      await bucket().put(`${user}/${id}`, bytes, {
        httpMetadata: { contentType: mime },
      });
      try {
        await db()
          .prepare(
            "INSERT INTO uploads(id,owner,name,mime,at) VALUES(?,?,?,?,?)",
          )
          .bind(id, user, name, mime, Date.now())
          .run();
      } catch (error) {
        await bucket().delete(`${user}/${id}`);
        throw error;
      }
      return json({ id, name });
    }
    const data = JSON.parse(await readLimited(request, 100_000));
    if (action === "settings") {
      if (testLoginEnabled())
        throw new AppError("共用服務由管理者設定，測試者無須填寫金鑰。", 403);
      const input = z
        .object({
          key: z.string().max(500).optional(),
          model: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
          remove: z.boolean().optional(),
        })
        .parse(data);
      if (input.remove) {
        await db()
          .prepare("DELETE FROM credentials WHERE owner=?")
          .bind(user)
          .run();
        return json({ configured: false, model: input.model });
      }
      if (input.key) {
        if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(input.key))
          throw new AppError("請輸入有效的 OpenAI API Key。");
        const cipher = await seal(input.key, user);
        await db()
          .prepare(
            "INSERT INTO credentials(owner,cipher,model,updated) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET cipher=excluded.cipher,model=excluded.model,updated=excluded.updated",
          )
          .bind(user, cipher, input.model, Date.now())
          .run();
      } else {
        const result = await db()
          .prepare("UPDATE credentials SET model=?,updated=? WHERE owner=?")
          .bind(input.model, Date.now(), user)
          .run();
        if (!result.meta.changes) throw new AppError("請先填寫 API Key。");
      }
      return json({ configured: true, model: input.model });
    }
    if (action === "preferences") {
      const input = z
        .object({
          scope: z.string().max(200),
          patch: preferenceSchema.partial().optional(),
          reset: z.boolean().optional(),
        })
        .parse(data);
      if (!/^(seller|store:.+|category:.+)$/.test(input.scope))
        throw new AppError("偏好範圍無效。");
      if (input.reset) {
        await db().batch([
          db()
            .prepare("DELETE FROM preferences WHERE owner=? AND scope=?")
            .bind(user, input.scope),
          db()
            .prepare("DELETE FROM events WHERE owner=? AND scope=?")
            .bind(user, input.scope),
        ]);
      } else {
        const old = await db()
          .prepare("SELECT data FROM preferences WHERE owner=? AND scope=?")
          .bind(user, input.scope)
          .first<{ data: string }>();
        const merged = { ...(old ? JSON.parse(old.data) : {}), ...input.patch };
        await db()
          .prepare(
            "INSERT INTO preferences(owner,scope,data,updated) VALUES(?,?,?,?) ON CONFLICT(owner,scope) DO UPDATE SET data=excluded.data,updated=excluded.updated",
          )
          .bind(user, input.scope, JSON.stringify(merged), Date.now())
          .run();
      }
      return json({ ok: true });
    }
    const p = productSchema.parse(data.product);
    for (const image of [
      ...p.images,
      ...(p.seller?.descriptionImages || []),
      ...(p.seller?.marketingImage ? [p.seller.marketingImage] : []),
      ...(p.seller?.video ? [p.seller.video] : []),
    ]) {
      if (
        !(await db()
          .prepare("SELECT id FROM uploads WHERE id=? AND owner=?")
          .bind(image.id, user)
          .first())
      )
        throw new AppError("商品包含無權使用的圖片。", 403);
    }
    if (action === "save") {
      const providedGenerationId =
        typeof data.generationId === "string" ? data.generationId : undefined;
      let generated:
        | { data: string; observed: number }
        | undefined;
      let evidence: Evidence[] = [];
      if (providedGenerationId) {
        generated =
          (await db()
            .prepare(
              "SELECT data,observed FROM generations WHERE id=? AND owner=? AND product=?",
            )
            .bind(data.generationId, user, p.id)
            .first<{ data: string; observed: number }>()) || undefined;
        if (generated && !generated.observed) {
          const source = JSON.parse(generated.data);
          evidence = inferEdits(source, p, p.id, `store:${p.store}`);
        }
      }
      let finalProduct = p;
      let generationId = providedGenerationId;
      let generationStatement = null;
      if (
        !generated &&
        !providedGenerationId &&
        p.version === 0 &&
        p.confirmed &&
        !p.pendingQuestions &&
        p.name.trim()
      ) {
        const generatedListing = await generateSaveListing(user, p);
        const generatedData = {
          title: generatedListing.title,
          description: generatedListing.description,
          warnings: generatedListing.warnings,
        };
        generationId = crypto.randomUUID();
        generated = { data: JSON.stringify(generatedData), observed: 0 };
        generationStatement = db()
          .prepare(
            "INSERT INTO generations(id,owner,product,data,at,observed) VALUES(?,?,?,?,?,0)",
          )
          .bind(
            generationId,
            user,
            p.id,
            JSON.stringify(generatedData),
            Date.now(),
          );
        finalProduct = {
          ...p,
          ...(shouldUseSaveGeneratedField(p, "title")
            ? { title: generatedListing.title }
            : {}),
          ...(shouldUseSaveGeneratedField(p, "description")
            ? { description: generatedListing.description }
            : {}),
        };
        evidence = inferEdits(
          generatedData,
          finalProduct,
          finalProduct.id,
          `store:${finalProduct.store}`,
        );
      }
      const version = finalProduct.version + 1;
      const encoded = JSON.stringify({ ...finalProduct, version });
      const savedAt = Date.now();
      const draftStatement =
        finalProduct.version === 0
          ? db()
              .prepare(
                "INSERT INTO drafts(owner,id,store,data,version,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,id) DO NOTHING",
              )
              .bind(user, finalProduct.id, finalProduct.store, encoded, version, savedAt)
          : db()
              .prepare(
                "UPDATE drafts SET data=?,store=?,version=?,updated=? WHERE owner=? AND id=? AND version=?",
              )
              .bind(encoded, finalProduct.store, version, savedAt, user, finalProduct.id, finalProduct.version);
      const strategy = finalProduct.market?.priceRecommendations
        ? Object.entries(finalProduct.market.priceRecommendations.strategies).find(
            ([, option]) => option.price === finalProduct.price,
          )?.[0]
        : undefined;
      const selectedRecommendation =
        strategy && finalProduct.market?.priceRecommendations
          ? finalProduct.market.priceRecommendations.strategies[
              strategy as "profit_first" | "momentum_price" | "traffic_first"
            ]
          : undefined;
      const payload = {
        generationId,
        marketSnapshotId: finalProduct.market?.marketSnapshotId,
        priceRecommendationId: finalProduct.market?.priceRecommendationId,
        productIdentityId: productIdentityId(finalProduct) || undefined,
        generated: generated ? JSON.parse(generated.data) : undefined,
        final: {
          title: finalProduct.title,
          description: finalProduct.description,
          price: finalProduct.price,
        },
        descriptionStyle: {
          generated: generated
            ? describeDescriptionStyle(JSON.parse(generated.data).description || "")
            : undefined,
          final: describeDescriptionStyle(finalProduct.description),
        },
        price: {
          strategy: strategy || "manual",
          percentile: selectedRecommendation?.percentile,
          recommended: selectedRecommendation?.price,
          referenceBalanced: finalProduct.market?.priceRecommendations?.referenceMarketMedian,
        },
        marketSources: Object.values(
          (finalProduct.market?.items || []).reduce(
            (summary, item) => {
              const key = item.sourceKey || "unknown";
              const current = summary[key] || {
                sourceKey: key,
                includedCount: 0,
                excludedCount: 0,
              };
              if (item.included && !item.manualExcluded) current.includedCount += 1;
              else current.excludedCount += 1;
              summary[key] = current;
              return summary;
            },
            {} as Record<
              string,
              { sourceKey: string; includedCount: number; excludedCount: number }
            >,
          ),
        ),
        source: generated ? "save_feedback" : "manual_save",
      };
      const feedback = feedbackStatements(db(), {
        owner: user,
        product: finalProduct,
        payload,
        evidence,
        draftVersion: version,
        draftUpdatedAt: savedAt,
        generationId: generated ? generationId : undefined,
      });
      const selection = finalProduct.market?.priceRecommendationId
        ? db()
            .prepare(
              "UPDATE price_recommendations SET selected_strategy=?,selected_price=?,selected_at=? WHERE id=? AND owner=? AND product=? AND EXISTS (SELECT 1 FROM drafts WHERE owner=? AND id=? AND version=? AND updated=?)",
            )
            .bind(
              strategy || "manual",
              finalProduct.price === null ? null : Math.round(finalProduct.price),
              Date.now(),
              finalProduct.market.priceRecommendationId,
              user,
              finalProduct.id,
              user,
              finalProduct.id,
              version,
              savedAt,
            )
        : null;
      const saveResults = await db().batch(
        selection
          ? [draftStatement, ...(generationStatement ? [generationStatement] : []), ...feedback.statements, selection]
          : [draftStatement, ...(generationStatement ? [generationStatement] : []), ...feedback.statements],
      );
      if (!saveResults[0]?.meta.changes)
        throw new AppError(
          "此商品已在另一個視窗更新。請先匯出目前內容，再重新載入草稿。",
          409,
        );
      const learningTask = processLearningJobs(user).catch((error) =>
        console.error("snap2sell_learning_enqueue_failed", {
          error: error instanceof Error ? error.name : "Unknown",
        }),
      );
      if (process.env.DEMO_INLINE_LEARNING !== "false")
        await learningTask;
      return json({ product: { ...finalProduct, version } });
    }
    if (action === "generate") {
      if (p.pendingQuestions) throw new AppError("請先完成商品補充問答。");
      if (!p.confirmed) throw new AppError("請先確認商品身分。");
      const current = preferenceSchema.partial().parse(data.preferences || {});
      const prefs = (await profile(user, p.store, p.category, current)).profile;
      const result = data.useAI
        ? await ai(user, p, "generate", prefs)
        : { ...generateListing(p, prefs), warnings: [] };
      const validated = z
        .object({
          title: z.string().max(300),
          description: z.string().max(10000),
          warnings: z.array(z.string()).max(20),
        })
        .parse(result);
      const id = crypto.randomUUID();
      await db()
        .prepare(
          "INSERT INTO generations(id,owner,product,data,at,observed) VALUES(?,?,?,?,?,0)",
        )
        .bind(id, user, p.id, JSON.stringify(validated), Date.now())
        .run();
      return json({
        ...validated,
        generationId: id,
        source: data.useAI ? "openai" : "facts_template",
        requiresReview: true,
      });
    }
    if (action === "clarify") {
      if (!p.analysis || !p.answers?.length)
        throw new AppError("請先回答辨識問題。");
      return json(await ai(user, p, "clarify", defaults));
    }
    if (action === "analyze") {
      return json(await ai(user, p, "analyze", defaults));
    }
    if (action === "market") {
      const policy = await activeGlobalPolicy();
      const marketPolicy={...policy.marketFilter,version:policy.version};
      const result = await researchWithFallback(p,
        ()=>research(p,{marketPolicy}),
        ()=>webPriceResearch(user,p,marketPolicy),marketPolicy);
      const current = preferenceSchema.partial().parse(data.preferences || {});
      const prefs = (await profile(user, p.store, p.category, current)).profile;
      const savedMarket = await saveMarketSnapshot(user, p, result, policy, prefs);
      return json(savedMarket.result);
    }
    if (action === "review") {
      return json({
        missing: missingInformation(p),
        ready: missingInformation(p).length === 0,
        notice:
          "請確認所有文案與商品事實相符；匯出檔為通用 JSON，非蝦皮批次匯入格式。",
      });
    }
    throw new AppError("找不到此功能。", 404);
  } catch (error) {
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "資料格式不正確，請檢查輸入內容。" }, 400);
    console.error("snap2sell_request_failed", {
      action,
      error: error instanceof Error ? error.name : "Unknown",
    });
    return json(
      { error: "服務暫時無法完成操作，你的編輯仍保留在畫面上。" },
      503,
    );
  }
}
