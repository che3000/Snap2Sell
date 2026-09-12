"use client";
import { useState } from "react";
import { ImageIcon, Plus, Check, Sparkles } from "lucide-react";
import { type Studio } from "../useStudio";
import { Choice } from "./Choice";
export function ProductInfo({ s }: { s: Studio }) {
  const analysis = s.p.analysis;
  const [attribute, setAttribute] = useState("");
  const p = s.p;
  return (
    <section>
      <div className="section-heading">
        <h3>商品圖片</h3>
        <span>{p.images.length} / 9</span>
      </div>
      <div className="upload-area">
        <div className="upload-icon">
          <ImageIcon size={27} />
        </div>
        <strong>讓商品先說話</strong>
        <p>上傳後自動辨識並填入空白欄位；請拍攝正面、型號標籤與包裝</p>
        <label className="secondary" style={{ margin: 0, cursor: "pointer" }}>
          <Plus size={16} />
          選擇圖片
          <input
            aria-label="上傳商品圖片"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={!!s.busy}
            style={{ width: 1, height: 1, position: "absolute", opacity: 0 }}
            onChange={(e) => {
              void s.upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <small>JPG、PNG、WebP · 每張不超過 5 MB</small>
      </div>
      <div className="image-grid">
        {p.images.map((image, i) => (
          <figure key={image.id}>
            <img src={`/api/images/${image.id}`} alt={image.name} />
            <figcaption>
              {i === 0 ? "主圖 · " : ""}
              {image.name}
            </figcaption>
            <button
              className="text-button"
              disabled={i === 0}
              onClick={() => {
                const images = [...p.images];
                [images[i - 1], images[i]] = [images[i], images[i - 1]];
                s.update({ images });
              }}
            >
              往前
            </button>
            <button
              className="text-button"
              onClick={() =>
                s.update({ images: p.images.filter((x) => x.id !== image.id) })
              }
            >
              移除
            </button>
          </figure>
        ))}
      </div>
      <div className="actions">
        <button
          className="secondary"
          disabled={!!s.busy || !p.images.length || !s.settings.configured}
          onClick={s.analyze}
        >
          <Sparkles size={16} />
          {s.busy === "analyze" ? "正在辨識…" : "AI 辨識並填入"}
        </button>
      </div>
      {!s.settings.configured && (
        <p className="field-help">
          {s.settings.shared ? "共用 AI 尚未啟用，請聯絡管理者；照片仍可上傳保存。" : "可先手動填寫；啟用圖片辨識請至「服務設定」填寫 OpenAI 金鑰。"}
        </p>
      )}
      {analysis && (
        <div className="notice">
          <h3>AI 辨識結果 · 已填入資訊與文案草稿，待你確認</h3>
          <p>{[analysis.brand, analysis.name, analysis.model].join(" / ")}</p><p>身分依據：{analysis.identityEvidence}</p><p>既有欄位會保留；若與照片不符，請先新增商品。</p>
          {analysis.observations.map((o, i) => (
            <p key={i}>
              {o.label}：{o.value}
              <br />
              <small>
                依據：{o.evidence} · {o.confidence}
              </small>
            </p>
          ))}
          {analysis.questions.map((q) => (
            <p key={q}>{q}</p>
          ))}

        </div>
      )}
      <label>
        商品名稱
        <input
          value={p.name}
          onChange={(e) => s.update({ name: e.target.value })}
          placeholder="輸入商品名稱"
        />
      </label>
      <div className="two-col">
        <label>
          品牌
          <input
            value={p.brand}
            onChange={(e) => s.update({ brand: e.target.value })}
          />
        </label>
        <label>
          型號
          <input
            value={p.model}
            onChange={(e) => s.update({ model: e.target.value })}
          />
        </label>
      </div>
      <div className="two-col">
        <label>
          商品分類
          <input
            value={p.category}
            onChange={(e) => s.update({ category: e.target.value })}
          />
        </label>
        <label>
          商品狀況
          <Choice
            label="商品狀況"
            value={p.condition}
            onChange={(v) => s.update({ condition: v })}
            options={[
              ["全新", "全新"],
              ["二手", "二手"],
              ["拆封未使用", "拆封未使用"],
            ]}
          />
        </label>
      </div>
      <h3>已知商品規格</h3>
      <p className="field-help">只填寫已確認的規格；不確定的資訊留空。</p>
      {Object.entries(p.attributes).map(([key, value]) => (
        <div className="fact-row" key={key}>
          <span>{key}</span>
          <input
            aria-label={key}
            value={value}
            onChange={(e) =>
              s.update({
                attributes: { ...p.attributes, [key]: e.target.value },
              })
            }
          />
          <button
            className="text-button"
            aria-label={`移除${key}`}
            onClick={() =>
              s.update({
                attributes: Object.fromEntries(
                  Object.entries(p.attributes).filter(([k]) => k !== key),
                ),
              })
            }
          >
            ×
          </button>
        </div>
      ))}
      <div className="actions">
        <input
          aria-label="新增規格名稱"
          style={{ width: 160, margin: 0 }}
          placeholder="規格名稱，如容量"
          value={attribute}
          onChange={(e) => setAttribute(e.target.value)}
        />
        <button
          className="secondary"
          disabled={!attribute.trim() || attribute in p.attributes}
          onClick={() => {
            s.update({
              attributes: { ...p.attributes, [attribute.trim()]: "" },
            });
            setAttribute("");
          }}
        >
          新增規格
        </button>
      </div>
      <button
        className="secondary"
        disabled={p.pendingQuestions || !p.name || !p.model || !p.category}
        onClick={() => s.update({ confirmed: true })}
      >
        <Check size={16} />
        {p.confirmed ? "已確認商品身分與規格" : "確認商品身分與規格"}
      </button>
    </section>
  );
}
