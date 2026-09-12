"use client";
import { useEffect, useState } from "react";
import {
  ImagePlus,
  Video,
  Plus,
  ChevronDown,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Choice } from "./Choice";
import { Market } from "./Market";
import { CategoryPicker } from "./CategoryPicker";
import { AttributeSelect } from "./AttributeSelect";
import { SuggestionCards } from "./SuggestionCards";
import { attributeChoices, attributeKeys } from "@/packages/product/attributes";
import { listingOptions, nameSuggestionBase } from "@/packages/listing/options";
import { priceForLegacyPreference } from "@/packages/market";
import type { Studio } from "../useStudio";
import type { SellerFields } from "@/packages/contracts";
export const sellerSections = [
  ["basic", "基本資訊"],
  ["attributes", "屬性"],
  ["description", "商品描述"],
  ["sales", "銷售資訊"],
  ["shipping", "運費"],
  ["other", "其他"],
] as const;
const shippingDefaults = [
  ["全家", 60],
  ["店到家宅配", 65],
  ["宅配通", 70],
  ["黑貓宅急便", 90],
  ["萊爾富", 50],
  ["7-ELEVEN", 60],
  ["蝦皮店到店", 45],
  ["萊爾富 - 經濟包", 40],
  ["蝦皮店到店 - 隔日到貨", 60],
].map(([name, fee]) => ({
  name: String(name),
  fee: Number(fee),
  enabled: false,
}));
export function SellerForm({ s }: { s: Studio }) {
  const p = s.p,
    fields = p.seller || {};
  const [expanded, setExpanded] = useState(false);
  const [variants, setVariants] = useState(!!p.variants);
  const set = (patch: Partial<SellerFields>) =>
    s.update({ seller: { ...fields, ...patch } });
  const attrs = attributeKeys(p);
  const [proposalBase, setProposalBase] = useState(p.name);
  const nextProposalBase = nameSuggestionBase(p, proposalBase);
  const proposals = listingOptions({...p,name:nextProposalBase});
  useEffect(() => {
    setProposalBase(nextProposalBase);
  }, [nextProposalBase]);
  const media = (
    file: File | undefined,
    kind: "marketingImage" | "video" | "descriptionImages",
  ) =>
    s.run("upload", async () => {
      if (!file) return;
      const limit = kind === "video" ? 30 : 5;
      if (file.size > limit * 1024 * 1024)
        throw Error(`檔案不可超過 ${limit} MB`);
      if (
        kind === "descriptionImages" &&
        (fields.descriptionImages?.length || 0) >= 12
      )
        throw Error("描述圖片最多12張");
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const data = (await response.json()) as {
        id: string;
        name: string;
        error?: string;
      };
      if (!response.ok) throw Error(data.error || "上傳失敗");
      set(
        kind === "descriptionImages"
          ? {
              descriptionImages: [
                ...(fields.descriptionImages || []),
                { id: data.id, name: data.name },
              ],
            }
          : { [kind]: { id: data.id, name: data.name } },
      );
      s.notify("檔案已上傳，儲存草稿即可保留。");
    });
  const upload = (
    kind: "marketingImage" | "video" | "descriptionImages",
    label: string,
  ) => (
    <label className="seller-upload">
      <input
        aria-label={label}
        type="file"
        accept={
          kind === "video" ? "video/mp4" : "image/jpeg,image/png,image/webp"
        }
        disabled={!!s.busy}
        onChange={(e) => {
          void media(e.target.files?.[0], kind);
          e.target.value = "";
        }}
      />
      {kind === "video" ? <Video size={22} /> : <ImagePlus size={22} />}
      <span>{label}</span>
    </label>
  );
  const yesNo = (key: "restricted" | "longerPreparation") => (
    <RadioGroup
      className="seller-radios"
      value={fields[key] ? "yes" : "no"}
      onValueChange={(v) => set({ [key]: v === "yes" })}
    >
      {[
        ["no", "否"],
        ["yes", "是"],
      ].map(([v, t]) => (
        <label key={v}>
          <RadioGroupItem value={v} />
          {t}
        </label>
      ))}
    </RadioGroup>
  );
  return (
    <fieldset className="seller-form-fields" disabled={!!s.busy}>
      <section id="basic" className="seller-card">
        <h2>基本資訊</h2>
        <label className="required">商品圖片</label>
        <RadioGroup
          className="seller-radios"
          value={fields.ratio || "1:1"}
          onValueChange={(v) => set({ ratio: v as "1:1" | "3:4" })}
        >
          <label>
            <RadioGroupItem value="1:1" />
            1:1 比例圖片
          </label>
          <label>
            <RadioGroupItem value="3:4" />
            3:4 比例圖片
          </label>
        </RadioGroup>
        <div className="seller-image-row">
          {p.images.map((im, i) => (
            <div
              className="seller-thumb"
              key={im.id}
              style={{ aspectRatio: fields.ratio === "3:4" ? "3/4" : "1" }}
            >
              <img src={"/api/images/" + im.id} alt={im.name} />
              <div>
                <button
                  type="button"
                  title="設為主圖"
                  onClick={() =>
                    s.update({
                      images: [im, ...p.images.filter((x) => x.id !== im.id)],
                    })
                  }
                >
                  {i === 0 ? "主圖" : "設主圖"}
                </button>
                <button
                  type="button"
                  aria-label={"移除" + im.name}
                  onClick={() =>
                    s.update({ images: p.images.filter((x) => x.id !== im.id) })
                  }
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {p.images.length < 9 && (
            <label className="seller-upload">
              <input
                aria-label="上傳商品圖片"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={!!s.busy}
                onChange={(e) => {
                  void s.upload(e.target.files);
                  e.target.value = "";
                }}
              />
              <ImagePlus size={22} />
              <span>
                新增圖片
                <br />({p.images.length}/9)
              </span>
            </label>
          )}
        </div>
        <p className="seller-hint">
          上傳後自動辨識；圖片每張最多 5 MB。顯示比例不會裁切原始檔。
        </p>
        {p.images.length > 0 && (
          <div className="seller-ai-row">
            <button
              className="secondary"
              disabled={!s.settings.configured}
              onClick={s.analyze}
            >
              <Sparkles size={15} />
              重新辨識並填入
            </button>
            {p.pendingQuestions && (
              <button
                className="primary"
                onClick={() => s.setQuestionsOpen(true)}
              >
                確認商品狀況
              </button>
            )}
          </div>
        )}
        <label className="required">行銷活動圖片</label>
        <div className="seller-media-row">
          {fields.marketingImage || p.images[0] ? (
            <img
              className="seller-marketing"
              src={"/api/images/" + (fields.marketingImage || p.images[0]).id}
              alt="行銷活動圖片"
            />
          ) : null}
          {upload("marketingImage", "新增 1:1 圖片")}
          <ul>
            <li>新增 1:1 商品圖片</li>
            <li>
              行銷活動圖片將會使用於行銷活動頁面，包含搜尋結果頁、每日新發現頁。
            </li>
          </ul>
        </div>
        <label>商品影片</label>
        <div className="seller-media-row">
          {fields.video ? (
            <div>
              <video
                controls
                src={"/api/images/" + fields.video.id}
                style={{ width: 200 }}
              />
              <button
                className="text-button"
                onClick={() => set({ video: undefined })}
              >
                移除影片
              </button>
            </div>
          ) : (
            upload("video", "新增影片")
          )}
          <ul>
            <li>檔案大小：不得超過 30 MB</li>
            <li>格式：MP4；建議影片長度 10–60 秒</li>
            <li>影片會隨測試草稿保存。</li>
          </ul>
        </div>
        <label className="required">
          商品名稱
          <div className="seller-count-input">
            <input
              aria-label="商品名稱"
              value={p.name}
              maxLength={60}
              onChange={(e) =>
                s.update({ name: e.target.value, title: e.target.value })
              }
              placeholder="請輸入商品名稱"
            />
            <span>{p.name.length}/60</span>
          </div>
        </label>
        <SuggestionCards label="商品名稱建議" options={proposals.names} value={p.name} disabled={!!s.busy || !!p.pendingQuestions} onSelect={name=>s.update({name,title:name})} />
        <label className="required">
          類別
          <CategoryPicker value={p.category} onChange={category=>s.update({category})} />
        </label>
        {p.analysis?.category && (
          <div className="seller-category">
            <span>✦ 建議分類</span>
            <button
              className="secondary"
              onClick={() => s.update({ category: p.analysis!.category })}
            >
              {p.analysis.category}
            </button>
          </div>
        )}
        <label>
          國際條碼（GTIN）
          <div className="seller-gtin">
            <input
              aria-label="國際條碼"
              value={fields.gtin || ""}
              disabled={fields.noGtin}
              onChange={(e) => set({ gtin: e.target.value })}
              placeholder="Input"
            />
            <label>
              <Checkbox
                checked={!!fields.noGtin}
                onCheckedChange={(v) => set({ noGtin: v === true })}
              />
              商品無有效的國際條碼（GTIN）
            </label>
          </div>
        </label>
      </section>
      <section id="attributes" className="seller-card">
        <h2>屬性</h2>
        <p className="seller-hint">
          完成度：
          {Object.values(p.attributes).filter(Boolean).length +
            (p.brand ? 1 : 0)}{" "}
          / {attrs.length + 1}　依商品類型顯示相關欄位
        </p>
        <div className="seller-attributes">
          <label className="required">
            品牌
            <AttributeSelect label="品牌" value={p.brand} options={attributeChoices.品牌} onChange={brand=>s.update({brand})} />
          </label>
          {attrs.slice(0, expanded ? attrs.length : 9).map((key) => (
            <label
              key={key}
              className={key === "連接類型" || key === "耳機" ? "required" : ""}
            >
              {key}
              <AttributeSelect label={key} value={key === "型號" ? p.model : p.attributes[key] || ""} options={attributeChoices[key]} onChange={value=>s.update(key === "型號" ? {model:value} : {attributes:{...p.attributes,[key]:value}})} />
            </label>
          ))}
        </div>
        {attrs.length > 9 && <button className="text-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收合" : "展開全部"} <ChevronDown size={14} />
        </button>}
        {p.analysis && <button type="button" className="secondary" disabled={!!s.busy} onClick={()=>{s.update({pendingQuestions:true});s.setQuestionsOpen(true);}}>修正辨識結果／補充說明</button>}
        {p.analysis && (
          <details className="seller-analysis">
            <summary>AI 辨識依據與待確認資訊</summary>
            <p>{p.analysis.identityEvidence}</p>
            {p.analysis.observations.map((o, i) => (
              <p key={i}>
                {o.label}：{o.value} — {o.evidence}
              </p>
            ))}
          </details>
        )}
        <button
          className="secondary"
          disabled={p.pendingQuestions || !p.name || !p.model || !p.category}
          onClick={() => s.update({ confirmed: true })}
        >
          {p.confirmed ? "已確認商品身分與規格" : "確認商品身分與規格"}
        </button>
      </section>
      <section id="description" className="seller-card">
        <h2>商品描述</h2>
        <SuggestionCards label="商品描述建議" options={proposals.descriptions} value={p.description} disabled={!!s.busy || !!p.pendingQuestions} onSelect={description=>s.update({description})} />
        <p className="field-help">三個版本依目前商品資料整理；未知規格不會補寫，套用後仍可自行修改。</p>
        <label className="required">商品描述</label>
        <div className="seller-description">
          <div className="seller-description-toolbar">
            {upload(
              "descriptionImages",
              "新增圖片 (" + (fields.descriptionImages?.length || 0) + "/12)",
            )}
            <span>{p.description.length}/3000</span>
          </div>
          <textarea
            aria-label="商品描述"
            maxLength={3000}
            value={p.description}
            onChange={(e) => s.update({ description: e.target.value })}
            placeholder="請輸入商品描述或點選以上新增圖片"
          />
          <div className="seller-image-row">
            {fields.descriptionImages?.map((im) => (
              <div className="seller-thumb" key={im.id}>
                <img src={"/api/images/" + im.id} alt={im.name} />
                <button
                  aria-label={"移除描述圖片" + im.name}
                  onClick={() =>
                    set({
                      descriptionImages: fields.descriptionImages!.filter(
                        (x) => x.id !== im.id,
                      ),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="actions">
          <button
            className="secondary"
            onClick={() =>
              s.run("copy", async () => {
                await navigator.clipboard.writeText(
                  p.name + "\n\n" + p.description,
                );
                s.notify("已複製商品文案。");
              })
            }
          >
            複製文案
          </button>
        </div>
      </section>
      <section id="sales" className="seller-card">
        <h2>銷售資訊</h2>
        <div className="suggestions">
          <div className="suggestions-heading"><strong>建議售價</strong><span>依 BigGo 可比行情</span></div>
          <div className="suggestion-grid">{([
            ['competitive','價格競爭','採用可比價格第 30 百分位'],
            ['balanced','市場平衡','採用可比價格中位數'],
            ['premium','較高定價','採用可比價格第 70 百分位'],
          ] as const).map(([key,label,detail])=>{
            const price=priceForLegacyPreference(p.market, key);
            return <button type="button" key={key} className={`suggestion-card ${price && p.price===price?'is-selected':''}`} disabled={!price || !!s.busy} aria-pressed={!!price && p.price===price} onClick={()=>s.update({price:price!,priceIsSuggested:true})}><span className="suggestion-label">{label}</span><strong className="suggestion-price">{price?`NT$${price.toLocaleString()}`:'等待可比行情'}</strong><span>{detail}</span><span className="suggestion-action">{price?'套用此價格':'至少需要 3 筆可比資料'}</span></button>;
          })}</div>
        </div>
        <label>規格</label>
        {variants ? (
          <label>
            <textarea
              aria-label="商品規格"
              placeholder="例如：顏色黑色／白色；容量256GB（文字草稿）"
              value={p.variants}
              onChange={(e) => s.update({ variants: e.target.value })}
            />
            <button
              className="text-button"
              onClick={() => {
                setVariants(false);
                s.update({ variants: "" });
              }}
            >
              關閉規格
            </button>
          </label>
        ) : (
          <button className="seller-dashed" onClick={() => setVariants(true)}>
            <Plus size={16} />
            開啟商品規格
          </button>
        )}
        <label className="required">
          價格
          <div className="seller-unit">
            <span>NT$</span>
            <input
              aria-label="價格"
              type="number"
              min="0"
              value={p.price ?? ""}
              placeholder="Input"
              onChange={(e) =>
                s.update({
                  price: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
        </label>
        <label className="required">
          商品數量
          <input
            aria-label="商品數量"
            type="number"
            min="0"
            value={p.stock ?? ""}
            placeholder="0"
            onChange={(e) =>
              s.update({
                stock: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label className="required">
          最低購買數量
          <input
            type="number"
            min="1"
            value={fields.minPurchase ?? 1}
            onChange={(e) => set({ minPurchase: Number(e.target.value) || 1 })}
          />
        </label>
        <p className="seller-hint">
          最低購買數量是指買家一次至少購買的商品數量。庫存少於最低購買數量時，買家將無法下單購買。
        </p>
        <label>多件優惠</label>
        {fields.discounts?.map((d, i) => (
          <div className="seller-discount" key={i}>
            <input
              aria-label="優惠最低數量"
              type="number"
              min="2"
              value={d.quantity}
              onChange={(e) =>
                set({
                  discounts: fields.discounts!.map((x, n) =>
                    n === i
                      ? { ...x, quantity: Number(e.target.value) || 2 }
                      : x,
                  ),
                })
              }
            />
            <input
              aria-label="優惠單價"
              type="number"
              min="0"
              value={d.price}
              onChange={(e) =>
                set({
                  discounts: fields.discounts!.map((x, n) =>
                    n === i ? { ...x, price: Number(e.target.value) } : x,
                  ),
                })
              }
            />
            <button
              aria-label="移除優惠"
              onClick={() =>
                set({ discounts: fields.discounts!.filter((_, n) => n !== i) })
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          className="seller-dashed"
          disabled={(fields.discounts?.length || 0) >= 10}
          onClick={() =>
            set({
              discounts: [
                ...(fields.discounts || []),
                { quantity: 2, price: p.price || 0 },
              ],
            })
          }
        >
          <Plus size={16} />
          新增優惠區間
        </button>
        <p className="seller-hint">
          優惠與規格先保留在草稿中，尚未連接蝦皮促銷或多規格庫存。
        </p>
        <details className="seller-market" open={!!p.market}>
          <summary>
            BigGo 市場價格 {p.priceIsSuggested ? "· 已填入建議售價" : ""}
          </summary>
          <Market s={s} />
        </details>
      </section>
      <section id="shipping" className="seller-card">
        <h2>運費</h2>
        <label>
          重量
          <div className="seller-unit short">
            <input
              aria-label="重量"
              type="number"
              min="0"
              step="0.01"
              value={fields.weight || ""}
              onChange={(e) => set({ weight: e.target.value })}
              placeholder="Input"
            />
            <span>kg</span>
          </div>
        </label>
        <label>包裹尺寸大小</label>
        <div className="seller-dimensions">
          {[
            ["width", "寬"],
            ["length", "長"],
            ["height", "高"],
          ].map(([k, t]) => (
            <div className="seller-unit" key={k}>
              <input
                aria-label={t}
                type="number"
                min="0"
                value={fields[k as "width"] || ""}
                placeholder={t}
                onChange={(e) => set({ [k]: e.target.value })}
              />
              <span>cm</span>
            </div>
          ))}
        </div>
        <label className="required">禁運品</label>
        {yesNo("restricted")}
        <label>買家支付運費</label>
        <div className="seller-logistics">
          {(fields.carriers || shippingDefaults).map((c, i) => (
            <div className="seller-carrier" key={c.name}>
              <span>
                {c.name}
                <small>蝦皮支援物流</small>
              </span>
              <div>
                <span>NT$</span>
                <input
                  aria-label={c.name + "運費"}
                  type="number"
                  min="0"
                  value={c.fee}
                  onChange={(e) =>
                    set({
                      carriers: (fields.carriers || shippingDefaults).map(
                        (x, n) =>
                          n === i ? { ...x, fee: Number(e.target.value) } : x,
                      ),
                    })
                  }
                />
                <Switch
                  aria-label={"啟用" + c.name}
                  checked={c.enabled}
                  onCheckedChange={(enabled) =>
                    set({
                      carriers: (fields.carriers || shippingDefaults).map(
                        (x, n) => (n === i ? { ...x, enabled } : x),
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
        <p className="seller-hint">
          物流費用依提供的頁面作為可編輯範本；開關只儲存此測試草稿，不會變更蝦皮物流。
        </p>
        <label>較長備貨</label>
        {yesNo("longerPreparation")}
        <p>
          我會在{" "}
          <input
            className="seller-inline-number"
            aria-label="備貨工作天"
            type="number"
            min="1"
            max="90"
            value={fields.preparationDays || 1}
            onChange={(e) =>
              set({ preparationDays: Number(e.target.value) || 1 })
            }
          />{" "}
          個工作日之內出貨（不包含週六、週日與國定假日）
        </p>
        <label>
          補充出貨資訊
          <textarea
            value={p.shipping}
            onChange={(e) => s.update({ shipping: e.target.value })}
            placeholder="其他物流或運費說明"
          />
        </label>
      </section>
      <section id="other" className="seller-card">
        <h2>其他</h2>
        <label>
          商品保存狀況
          <Choice
            label="商品保存狀況"
            value={p.condition}
            onChange={(condition) => s.update({ condition })}
            options={["全新", "拆封未使用", "二手"].map((v) => [v, v])}
          />
        </label>
        <label>
          預約上架時間
          <input
            type="datetime-local"
            value={fields.scheduledAt || ""}
            onChange={(e) => set({ scheduledAt: e.target.value })}
          />
          <span className="seller-hint">僅記錄預定時間，不會自動刊登。</span>
        </label>
        <label>
          主商品貨號
          <input
            value={fields.sku || ""}
            placeholder="-"
            onChange={(e) => set({ sku: e.target.value })}
          />
        </label>
        <label>
          保固資訊
          <textarea
            value={p.warranty}
            onChange={(e) => s.update({ warranty: e.target.value })}
          />
        </label>
      </section>
    </fieldset>
  );
}
