"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings2 } from "lucide-react";
import { api, type Studio } from "../useStudio";
export function Settings({ s }: { s: Studio }) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  if (s.settings.shared) return <div className="actions"><span className="field-help">{s.settings.configured ? "共用 AI 已啟用" : "等待管理者啟用 AI"}</span><button className="secondary" disabled={!!s.busy} onClick={async()=>{if(s.dirty && !window.confirm("尚有未儲存的編輯。登出會離開此測試空間，確定已匯出需要的資料？"))return;await api("logout",{});window.location.assign("/login")}}>登出</button></div>;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="secondary">
          <Settings2 size={16} />
          服務設定
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>服務設定</DialogTitle>
          <DialogDescription>
            金鑰加密保存在你的帳戶下，只由後端呼叫 OpenAI 使用。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void s.run("settings", async () => {
              const result = await api<{ configured: boolean; model: string }>(
                "settings",
                { key: key || undefined, model: model || s.settings.model },
              );
              s.setSettings({...result, shared:false});
              setKey("");
              s.notify("服務設定已儲存。");
            });
          }}
        >
          <p className="status-message">
            OpenAI：
            {s.settings.configured ? "已設定金鑰（尚未驗證連線）" : "尚未設定"}
          </p>
          <label>
            OpenAI API Key
            <input
              type="password"
              autoComplete="new-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                s.settings.configured ? "輸入新金鑰可替換，留空保留" : "sk-…"
              }
            />
          </label>
          <label>
            模型
            <input
              value={model || s.settings.model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4.1-mini"
            />
            <span className="field-help">
              使用支援圖片輸入與 Structured Outputs 的模型。
            </span>
          </label>
          <div className="notice">
            使用 AI 辨識或文案時，商品資料及選取的照片會傳送至
            OpenAI，費用由此金鑰所屬帳戶計算。
          </div>
          <div className="actions">
            <button className="primary" disabled={!!s.busy}>
              儲存設定
            </button>
            {s.settings.configured && (
              <button
                type="button"
                className="secondary"
                disabled={!!s.busy}
                onClick={() =>
                  s.run("settings", async () => {
                    s.setSettings(
                      await api<{ configured: boolean; shared: boolean; model: string }>(
                        "settings",
                        { model: s.settings.model, remove: true },
                      ),
                    );
                    setKey("");
                    s.notify("已移除 OpenAI 金鑰。");
                  })
                }
              >
                移除金鑰
              </button>
            )}
          </div>
        </form>
        <hr />
        <h3>BigGo 商品搜尋</h3>
        <p className="status-message">
          使用 BigGo MCP 開源專案相同的 TW 商品搜尋 API。此搜尋不需 OpenAI
          金鑰。
        </p>
        <a
          className="text-button"
          href="https://github.com/Funmula-Corp/BigGo-MCP-Server"
          target="_blank"
          rel="noreferrer"
        >
          查看 BigGo MCP 專案
        </a>
      </DialogContent>
    </Dialog>
  );
}
