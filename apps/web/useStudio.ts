"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { previewFromAnalysis } from "@/packages/listing";
import { emptyProduct, applyAnalysis } from "@/packages/product";
import { analysisResultSchema } from "@/packages/contracts";
import { defaults, type Product, type Preferences } from "@/packages/contracts";
export async function api<T = { profile: Preferences }>(
  path: string,
  data?: unknown,
): Promise<T> {
  const r = await fetch(
    `/api/${path}`,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : undefined,
  );
  const body = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(body.error || "操作失敗，請稍後重試。");
  return body;
}
export function useStudio() {
  const [p, setP] = useState<Product>(() => emptyProduct("new-product"));
  const [saved, setSaved] = useState<Product[]>([]);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [override, setOverride] = useState<Partial<Preferences>>({});
  const [settings, setSettings] = useState({
    shared: false,
    configured: false,
    model: "gpt-4.1-mini",
  });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [generationId, setGenerationId] = useState<string>();
  const working = useRef<
    Record<string, { product: Product; dirty: boolean; generationId?: string }>
  >({});
  const notify = useCallback((text: string, isError = false) => {
    setMessage(text);
    setError(isError);
  }, []);
  const run = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      setBusy(name);
      try {
        await fn();
      } catch (e) {
        notify(e instanceof Error ? e.message : "操作失敗。", true);
      } finally {
        setBusy("");
      }
    },
    [notify],
  );
  useEffect(() => {
    void api<{
      drafts: Product[];
      settings: { configured: boolean; shared: boolean; model: string };
      profile: Preferences;
    }>("bootstrap")
      .then((d) => {
        setSaved(d.drafts);
        setP((old) => (old.id === "new-product" ? d.drafts[0] || old : old));
        setSettings(d.settings);
        setPrefs(d.profile);
        setLoaded(true);
      })
      .catch((e) => notify(e.message, true));
  }, [notify]);
  useEffect(() => {
    let current = true;
    void api(
      `preferences?store=${encodeURIComponent(p.store)}&category=${encodeURIComponent(p.category)}`,
    )
      .then((d) => {
        if (current) setPrefs(d.profile);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [p.store, p.category]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || Object.values(working.current).some((x) => x.dirty)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const update = (patch: Partial<Product>) => {
    setP((old) => ({
      ...old,
      ...patch,
      ...(["name", "model", "brand", "attributes"].some((k) => k in patch)
        ? { confirmed: false }
        : {}),
    }));
    setDirty(true);
  };
  const select = (product: Product) => {
    working.current[p.id] = { product: p, dirty, generationId };
    const state = working.current[product.id];
    setP(state?.product || saved.find((x) => x.id === product.id) || product);
    setDirty(state?.dirty || false);
    setGenerationId(state?.generationId);
    setOverride({});
    setMessage("");
  };
  const save = () =>
    run("save", async () => {
      const result = await api<{ product: Product }>("save", {
        product: p,
        generationId,
      });
      setP(result.product);
      setSaved((old) => [result.product, ...old.filter((x) => x.id !== p.id)]);
      working.current[p.id] = { product: result.product, dirty: false };
      setGenerationId(undefined);
      setDirty(false);
      notify("草稿已儲存。");
    });
  const generate = (useAI: boolean) =>
    run("generate", async () => {
      const r = await api<{
        title: string;
        description: string;
        generationId: string;
        warnings: string[];
      }>("generate", { product: p, preferences: override, useAI });
      update({ title: r.title, description: r.description });
      setGenerationId(r.generationId);
      notify(
        `${useAI ? "AI" : "依已確認資料"}已產生草稿，請核對後儲存。${r.warnings?.join("；") || ""}`,
      );
    });
  const analyzeProduct = async (product: Product) => {
    const result = analysisResultSchema.parse(await api("analyze", { product }));
    const next = applyAnalysis(product, result);
    update({ ...next, ...previewFromAnalysis(next) });
    notify("照片已辨識，有依據的資訊已填入空白欄位。標題與描述已整理為待核對草稿；售價、庫存與出貨資訊需由你填寫。");
  };
  const analyze = () => run("analyze", () => analyzeProduct(p));
  const upload = (files: FileList | null) =>
    run("upload", async () => {
      if (!files) return;
      if (files.length + p.images.length > 9)
        throw new Error("最多上傳 9 張圖片。");
      const next = [...p.images];
      try {
        for (const file of Array.from(files)) {
          if (file.size > 5 * 1024 * 1024)
            throw new Error("每張圖片不得超過 5 MB。");
          const r = await fetch("/api/upload", {
            method: "POST",
            headers: {
              "Content-Type": file.type,
              "x-file-name": encodeURIComponent(file.name),
            },
            body: file,
          });
          const result = (await r.json()) as {
            id: string;
            name: string;
            error?: string;
          };
          if (!r.ok) throw new Error(result.error);
          next.push(result);
        }
      } finally {
        if (next.length > p.images.length) update({ images: next });
      }
      if (settings.configured) {
        setBusy("analyze");
        notify("圖片已上傳，正在辨識並填入資訊…");
        try { await analyzeProduct({ ...p, images: next }); }
        catch (e) { notify(`照片已保留，辨識未完成：${e instanceof Error ? e.message : "請重試"}`, true); }
      } else notify("圖片已上傳。AI 尚未啟用，啟用後可按「AI 辨識並填入」重試。");
    });
  const exportDraft = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "snap2sell-draft-v1",
            exportedAt: new Date().toISOString(),
            product: p,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `snap2sell-${p.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("已匯出通用商品草稿 JSON；非蝦皮批次匯入檔。");
  };
  return {
    p,
    saved,
    prefs,
    override,
    setOverride,
    settings,
    setSettings,
    busy,
    message,
    error,
    dirty,
    loaded,
    notify,
    run,
    update,
    select,
    save,
    generate,
    upload,
    analyze,
    exportDraft,
    setPrefs,
  };
}
export type Studio = ReturnType<typeof useStudio>;
