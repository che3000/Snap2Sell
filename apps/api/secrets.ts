import { AppError } from "../../packages/shared/http";
async function key() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!secret || secret.length !== 64)
    throw new AppError("金鑰保管服務尚未設定。", 503);
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(secret.match(/../g)!, (h) => parseInt(h, 16)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(value: string, owner: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) },
    await key(),
    new TextEncoder().encode(value),
  );
  return JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  });
}
export async function unseal(value: string, owner: string) {
  const { iv, data } = JSON.parse(value);
  const bytes = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(iv),
      additionalData: new TextEncoder().encode(owner),
    },
    await key(),
    new Uint8Array(data),
  );
  return new TextDecoder().decode(bytes);
}
