"use client";
import { type Studio } from "../useStudio";
export function Market({ s }: { s: Studio }) {
  const result = s.p.market;
  return (
    <div>
      <h3>BigGo 市場價格</h3>
      <p className="field-help">
        比對型號、容量與商品狀況，至少 3
        筆可比資料才計算建議。價格不代表銷售速度或毛利。
      </p>
      <div className="actions">
        <button
          className="secondary"
          disabled={!!s.busy || !s.p.model.trim()}
          onClick={s.market}
        >
          {s.busy === "market" ? "正在查詢…" : "查詢市場價格"}
        </button>
      </div>
      {!s.p.model.trim() && <p className="field-help">上傳照片辨識或填寫型號後，即可自動或手動查價。</p>}
      {result && (
        <div className="market-results">
          <p>
            搜尋：{result.query} · {new Date(result.at).toLocaleString("zh-TW")}
          </p>
          <p className="field-help">{result.provisional ? "商品狀況尚未確認，以下為全新品行情參考，不代表此商品為全新。" : `比價條件：${result.conditionBasis}`}</p>
          {result.summary ? (
            <>
              <div className="notice">
                可比價格 NT${result.summary.low.toLocaleString()}–
                {result.summary.high.toLocaleString()}（{result.summary.count}{" "}
                筆）
              </div>
              <div className="actions">
                {(
                  [
                    ["competitive", "價格競爭"],
                    ["balanced", "市場中位"],
                    ["premium", "較高定價"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    className={
                      key === (s.override.pricing || s.prefs.pricing)
                        ? "primary"
                        : "secondary"
                    }
                    key={key}
                    onClick={() => s.update({ price: result.summary![key] })}
                  >
                    {label} NT${result.summary![key]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="notice">
              可比商品不足 3 筆，不提供推算價格。請查看來源後自行定價。
            </div>
          )}
          <details>
            <summary>
              查看全部搜尋結果與排除原因（{result.items.length}）
            </summary>
            {result.items.map((i, n) => (
              <p key={n} style={{ margin: "12px 0" }}>
                <a href={i.url} target="_blank" rel="noreferrer">
                  {i.title}
                </a>
                <br />
                NT${i.price} ·{" "}
                {i.included
                  ? result.summary?.outliers.includes(i.url)
                    ? "排除：離群價格"
                    : "可比候選，請核對"
                  : `排除：${i.reason}`}
              </p>
            ))}
          </details>
        </div>
      )}
    </div>
  );
}
