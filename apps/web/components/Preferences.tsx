"use client";
import { useState } from "react";
import { Choice } from "./Choice";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api, type Studio } from "../useStudio";
import type { Preferences as Prefs } from "@/packages/contracts";
const fields: [keyof Prefs, string, [string, string][]][] = [
  [
    "length",
    "描述長度",
    [
      ["concise", "精簡"],
      ["medium", "適中"],
      ["detailed", "詳細"],
    ],
  ],
  [
    "tone",
    "語氣",
    [
      ["professional", "專業"],
      ["friendly", "親切"],
      ["y2k", "Y2K"],
      ["minimalist", "極簡"],
    ],
  ],
  [
    "emoji",
    "Emoji",
    [
      ["none", "不使用"],
      ["low", "少量"],
      ["medium", "適量"],
    ],
  ],
  [
    "technical",
    "規格細節",
    [
      ["moderate", "適中"],
      ["high", "詳細"],
    ],
  ],
  [
    "marketing",
    "行銷語氣",
    [
      ["low", "低"],
      ["moderate", "適中"],
    ],
  ],
  [
    "titleFormat",
    "標題格式",
    [
      ["plain", "純文字"],
      ["brackets", "品牌括號"],
    ],
  ],
  [
    "pricing",
    "定價方向",
    [
      ["competitive", "價格競爭"],
      ["balanced", "市場中位"],
      ["premium", "較高定價"],
    ],
  ],
];
export function PreferencePanel({ s }: { s: Studio }) {
  const [scope, setScope] = useState("current");
  const values = { ...s.prefs, ...s.override };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-button">調整風格</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI 撰寫風格</DialogTitle>
          <DialogDescription>
            本次設定優先於歷史偏好。事實與規格不受風格設定影響。
          </DialogDescription>
        </DialogHeader>
        <Choice
          label="套用範圍"
          value={scope}
          onChange={setScope}
          options={[
            ["current", "僅此商品"],
            ["seller", "所有賣場"],
            [`store:${s.p.store}`, "目前賣場"],
            [`category:${s.p.store}:${s.p.category}`, "目前賣場的此分類"],
          ]}
        />
        <div className="pref-grid">
          {fields.map(([key, label, options]) => (
            <label key={key}>
              {label}
              <Choice
                label={label}
                value={values[key]}
                onChange={(v) => s.setOverride({ ...s.override, [key]: v })}
                options={options}
              />
            </label>
          ))}
        </div>
        <div className="actions">
          <button
            className="primary"
            disabled={!!s.busy}
            onClick={() =>
              s.run("preferences", async () => {
                if (scope !== "current") {
                  await api("preferences", { scope, patch: s.override });
                  const result = await api(
                    `preferences?store=${encodeURIComponent(s.p.store)}&category=${encodeURIComponent(s.p.category)}`,
                  );
                  s.setPrefs(result.profile);
                  s.setOverride({});
                }
                s.notify(
                  scope === "current"
                    ? "已套用本次商品風格。"
                    : "偏好已儲存，之後產生文案會沿用。",
                );
              })
            }
          >
            套用偏好
          </button>
          <button
            className="secondary"
            disabled={!!s.busy}
            onClick={() =>
              s.run("preferences", async () => {
                if (scope !== "current")
                  await api("preferences", { scope, reset: true });
                s.setOverride({});
                const result = await api(
                  `preferences?store=${encodeURIComponent(s.p.store)}&category=${encodeURIComponent(s.p.category)}`,
                );
                s.setPrefs(result.profile);
                s.notify("已重設此範圍的偏好與學習紀錄。");
              })
            }
          >
            重設此範圍
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
