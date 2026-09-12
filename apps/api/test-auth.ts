import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { AppError } from "../../packages/shared/http";
const COOKIE = "snap2sell_test_session";
export const testLoginEnabled = () => !!process.env.TEST_LOGIN_USERNAME;
function equal(a: string, b: string) {
  const hash = (s: string) => createHmac("sha256", "snap2sell-compare").update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}
function sign(payload: string) {
  const secret = process.env.TEST_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new AppError("測試登入尚未完成設定。", 503);
  return createHmac("sha256", secret).update(payload + ":" + process.env.TEST_LOGIN_PASSWORD).digest("base64url");
}
export function sessionOwner(cookie: string | null): string | null {
  if (!testLoginEnabled()) return null;
  const value = cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!value) return null;
  const [id, expiry, signature, extra] = value.split(".");
  if (extra || !/^[a-f0-9-]{36}$/.test(id || "") || !/^\d+$/.test(expiry || "") || Number(expiry) < Date.now() || !signature) return null;
  if (!equal(sign(id + "." + expiry), signature)) return null;
  return "test:" + id;
}
export function loginCookie(username: string, password: string, secure: boolean): string {
  if (!testLoginEnabled() || !process.env.TEST_LOGIN_PASSWORD) throw new AppError("測試登入尚未完成設定。",503);
  if (!equal(username, process.env.TEST_LOGIN_USERNAME!) || !equal(password, process.env.TEST_LOGIN_PASSWORD)) throw new AppError("帳號或密碼不正確。",401);
  const payload = randomUUID() + "." + (Date.now() + 7 * 86400000);
  return `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure ? "; Secure" : ""}`;
}
export function logoutCookie(secure: boolean) {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}
