import { z } from "zod";
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
  inferEdits,
  resolvePreferences,
} from "../../packages/preferences";
import { generateListing } from "../../packages/listing";
import { missingInformation } from "../../packages/product";
import { research } from "../../packages/market/biggo";
import { ai } from "./openai";
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
  return {
    ...resolvePreferences(explicit, evidence, scopes, current),
    explicit,
    evidenceCount: evidence.length,
  };
}
export async function handle(request: Request, action: string) {
  try {
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
          settings: { configured: !!key, model: key?.model || "gpt-4.1-mini" },
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
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
        throw new AppError("僅支援 JPG、PNG、WebP。");
      const len = Number(request.headers.get("content-length"));
      if (len > 5 * 1024 * 1024) throw new AppError("圖片不得超過 5 MB。", 413);
      const reader = request.body?.getReader();
      if (!reader) throw new AppError("沒有圖片內容。");
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 5 * 1024 * 1024) {
          await reader.cancel();
          throw new AppError("圖片不得超過 5 MB。", 413);
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
        mime === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : mime === "image/png"
            ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
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
    for (const image of p.images) {
      if (
        !(await db()
          .prepare("SELECT id FROM uploads WHERE id=? AND owner=?")
          .bind(image.id, user)
          .first())
      )
        throw new AppError("商品包含無權使用的圖片。", 403);
    }
    if (action === "save") {
      const version = p.version + 1;
      const encoded = JSON.stringify({ ...p, version });
      let saved;
      if (p.version === 0) {
        saved = await db()
          .prepare(
            "INSERT INTO drafts(owner,id,store,data,version,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,id) DO NOTHING",
          )
          .bind(user, p.id, p.store, encoded, version, Date.now())
          .run();
      } else {
        saved = await db()
          .prepare(
            "UPDATE drafts SET data=?,store=?,version=?,updated=? WHERE owner=? AND id=? AND version=?",
          )
          .bind(encoded, p.store, version, Date.now(), user, p.id, p.version)
          .run();
      }
      if (!saved.meta.changes)
        throw new AppError(
          "此商品已在另一個視窗更新。請先匯出目前內容，再重新載入草稿。",
          409,
        );
      if (typeof data.generationId === "string") {
        const generated = await db()
          .prepare(
            "SELECT data,observed FROM generations WHERE id=? AND owner=? AND product=?",
          )
          .bind(data.generationId, user, p.id)
          .first<{ data: string; observed: number }>();
        if (generated && !generated.observed) {
          const source = JSON.parse(generated.data);
          const evidence = inferEdits(source, p, p.id, `store:${p.store}`);
          await db().batch([
            db()
              .prepare(
                "INSERT INTO events(id,owner,product,scope,kind,data,at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM generations WHERE id=? AND owner=? AND observed=0)",
              )
              .bind(
                crypto.randomUUID(),
                user,
                p.id,
                `store:${p.store}`,
                "PREFERENCE_OBSERVATION",
                JSON.stringify(evidence),
                Date.now(),
                data.generationId,
                user,
              ),
            db()
              .prepare(
                "UPDATE generations SET observed=1 WHERE id=? AND owner=?",
              )
              .bind(data.generationId, user),
          ]);
        }
      }
      return json({ product: { ...p, version } });
    }
    if (action === "generate") {
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
    if (action === "analyze") {
      return json(await ai(user, p, "analyze", defaults));
    }
    if (action === "market") {
      return json(await research(p));
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
