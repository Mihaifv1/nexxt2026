import { assert } from "../domain.ts";
async function keyFrom(secret: string) {
  assert(
    /^[a-f0-9]{64}$/i.test(secret),
    "ENCRYPTION_NOT_CONFIGURED",
    "Cheia de criptare a profilurilor nu este configurată.",
    503,
  );
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(secret.match(/../g)!.map((x) => parseInt(x, 16))),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
function encode(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function decode(s: string) {
  return Uint8Array.from(atob(s), (x) => x.charCodeAt(0));
}
export async function encrypt(data: unknown, secret: string, owner: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) },
    await keyFrom(secret),
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return JSON.stringify({
    v: 1,
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(encrypted)),
  });
}
export async function decrypt<T>(
  data: string,
  secret: string,
  owner: string,
): Promise<T> {
  const e = JSON.parse(data);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(e.iv),
      additionalData: new TextEncoder().encode(owner),
    },
    await keyFrom(secret),
    decode(e.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
