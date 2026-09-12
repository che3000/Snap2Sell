import { env } from "cloudflare:workers";
import { AppError } from "../../packages/shared/http";
export function db() {
  if (!env.DB) throw new AppError("資料庫暫時無法使用，請稍後再試。", 503);
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new AppError("圖片儲存暫時無法使用。", 503);
  return env.BUCKET;
}
export function owner(request: Request) {
  const id = request.headers.get("oai-authenticated-user-id");
  if (!id) throw new AppError("請先登入後再操作。", 401);
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new AppError("不允許跨網站操作。", 403);
  }
  return id;
}
