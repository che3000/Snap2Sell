"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { marketInputKey, priceForLegacyPreference } from "@/packages/market";
import { previewFromAnalysis } from "@/packages/listing";
import { emptyProduct, applyAnalysis, correctionQuestion, correctedProduct } from "@/packages/product";
import { marketResearchSchema, type MarketResearch } from "@/packages/contracts";
import { analysisResultSchema, clarifiedResultSchema, type AnalysisResult } from "@/packages/contracts";
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
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [processing, setProcessing] = useState(false);
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
      const blocking=["upload","analyze","clarify"].includes(name);
      if(blocking) setProcessing(true);
      try {
        await fn();
      } catch (e) {
        notify(e instanceof Error ? e.message : "操作失敗。", true);
      } finally {
        if(blocking) setProcessing(false);
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
    setP((old) => {
      const changed = (["name", "category", "model", "brand", "condition", "attributes"] as const).some(key => key in patch && JSON.stringify(patch[key]) !== JSON.stringify(old[key]));
      return ({
      ...old,
      ...(changed ? {market:undefined, ...(old.priceIsSuggested ? {price:null,priceIsSuggested:false} : {})} : {}),
      ...patch,
      ...("price" in patch ? {priceIsSuggested:patch.priceIsSuggested ?? false} : {}),
      ...(["name", "model", "brand", "attributes"].some((k) => k in patch)
        ? { confirmed: false }
        : {}),
    });});
    setDirty(true);
  };
  const select = (product: Product) => {
    setQuestionsOpen(false);
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
  const fetchMarket = async (product: Product): Promise<MarketResearch> =>
    marketResearchSchema.parse(await api("market", { product }));
  const market = () => run("market", async () => {
    const result = await fetchMarket(p);
    const suggested = priceForLegacyPreference(result, override.pricing || prefs.pricing);
    update({market:result, ...(p.price === null && suggested ? {price:suggested,priceIsSuggested:true} : {})});
    notify(result.summary ? "市場行情已更新，空白售價已填入建議價格。" : "搜尋完成，可比資料不足，請查看來源或調整型號後重試。");
  });
  const latestProduct = useRef(p);
  latestProduct.current = p;
  const autoAttempt = useRef("");
  useEffect(() => {
    if (!loaded || busy || p.pendingQuestions || p.market || !(p.name.trim() || p.model.trim())) return;
    const key=marketInputKey(p);
    if(autoAttempt.current===key) return;
    const timer=setTimeout(async()=>{
      autoAttempt.current=key;
      setBusy("market");
      try {
        const result=await fetchMarket(p);
        if(marketInputKey(latestProduct.current)!==key) return;
        const suggested = priceForLegacyPreference(result, override.pricing || prefs.pricing);
        update({market:result,...(latestProduct.current.price===null && suggested?{price:suggested,priceIsSuggested:true}:{})});
        notify(result.summary?'已自動查詢 BigGo，三個建議價格已更新。':'BigGo 已自動搜尋完成，可使用 ✓／✕ 調整採計資料。');
      } catch(error) {
        if(marketInputKey(latestProduct.current)===key) notify(`自動查價失敗：${error instanceof Error?error.message:'請稍後重試'}`,true);
      } finally {setBusy("");}
    },800);
    return ()=>clearTimeout(timer);
  },[loaded,busy,p.id,p.name,p.model,p.brand,p.category,p.condition,p.attributes,p.market,p.pendingQuestions]);
  const finishAnalysis = async (product: Product, result: AnalysisResult) => {
    const next = applyAnalysis(product, result);
    if (next.priceIsSuggested) { next.price = null; next.priceIsSuggested = false; }
    update({ ...next, pendingQuestions:false, ...previewFromAnalysis(next) });
    setBusy("market");
    notify("商品資訊與文案已填入，正在查詢 BigGo 建議售價…");
    try {
      const result = await fetchMarket(next);
      const suggested = priceForLegacyPreference(result, override.pricing || prefs.pricing);
      update({market:result, ...(next.price === null && suggested ? {price:suggested,priceIsSuggested:true} : {})});
      notify(result.summary
        ? `商品資訊、文案及建議售價已整理完成。${result.provisional ? "售價暫以全新品行情參考，確認商品狀況後可重新查價。" : ""}既有售價會保留。`
        : result.referenceOnly ? "商品狀況、已知資訊與文案已填入；BigGo 已搜尋完成，因型號未確認，先展示參考結果而不自動定價。" : "商品資訊與文案已填入；BigGo 可比資料不足，暫無可靠建議售價，可在銷售資訊查看來源並重試。");
    } catch (error) {
      notify(`商品資訊與文案已保留，比價未完成：${error instanceof Error ? error.message : "請重試"}`, true);
    }
  };
  const analyzeProduct = async (product: Product) => {
    const result = analysisResultSchema.parse(await api("analyze", { product }));
    if (result.questions.length) {
      update({analysis:result,pendingQuestions:true,confirmed:false});
      setQuestionsOpen(true);
      notify("AI 需要補充資訊，回答後會整理欄位、文案與建議售價。");
    } else await finishAnalysis(product,result);
  };
  const answerQuestions = (answers: {question:string;answer:string}[]) => run("clarify", async () => {
    const product = {...p,answers:[...(p.answers || []),...answers].slice(-40)};
    update({answers:product.answers});
    if (!product.analysis || !answers.length) throw new Error("請先回答或選擇不確定。");
    const result = clarifiedResultSchema.parse(await api("clarify", {product}));
    const corrected = answers.some(a=>a.question===correctionQuestion && a.answer.trim()) ? correctedProduct(product,result) : product;
    const next = {...corrected,condition:result.condition || product.condition,shipping:result.shipping || product.shipping,warranty:result.warranty || product.warranty,variants:result.variants || product.variants};
    const oldPreview = previewFromAnalysis({...p,title:"",description:""});
    if (p.title === oldPreview.title) next.title = "";
    if (p.description === oldPreview.description) next.description = "";
    if (result.questions.length) {
      update({...next,analysis:result,pendingQuestions:true});
      notify("還有資訊需要確認，請繼續回答。");
      return;
    }
    setQuestionsOpen(false);
    await finishAnalysis(next,result);
  });
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
    processing,
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
    answerQuestions,
    questionsOpen,
    setQuestionsOpen,
    market,
    exportDraft,
    setPrefs,
  };
}
export type Studio = ReturnType<typeof useStudio>;
