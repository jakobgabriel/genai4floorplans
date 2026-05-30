import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ENV } from "./env.ts";

// AES-256-GCM encryption for AI provider keys at rest. The master key comes from
// MASTER_ENC_KEY (base64 32 bytes). Ciphertext/iv/tag are stored separately
// (Bytes columns); decryption happens only in-memory at request time.

function masterKey(): Buffer {
  const key = Buffer.from(ENV.masterEncKey, "base64");
  if (key.length !== 32) throw new Error("MASTER_ENC_KEY must decode to 32 bytes");
  return key;
}

// Stored as Prisma `Bytes` columns, which map to Uint8Array<ArrayBuffer>.
export interface SealedSecret {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  tag: Uint8Array<ArrayBuffer>;
}

// Copy bytes into a fresh, plain-ArrayBuffer-backed Uint8Array so the type is
// exactly Uint8Array<ArrayBuffer> (what Prisma's Bytes expects), independent of
// whether the source Buffer is backed by a SharedArrayBuffer/pool.
function toBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(src.byteLength));
  out.set(src);
  return out;
}

export function encryptSecret(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: toBytes(ciphertext), iv: toBytes(iv), tag: toBytes(tag) };
}

export function decryptSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), sealed.iv);
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
}
