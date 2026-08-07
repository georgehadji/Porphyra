// AES-256-GCM over the Web Crypto API. Every encrypt call gets a fresh
// random 96-bit IV — GCM's security guarantee depends entirely on never
// reusing (key, IV); this module makes reuse structurally impossible by
// generating the IV inside encrypt() rather than accepting one as a param.

import {
  base64ToBytes,
  bytesToBase64,
  bytesToText,
  randomBytes,
  textToBytes,
  toArrayBuffer,
} from "./encoding";

const IV_LENGTH_BYTES = 12; // 96-bit, the size AES-GCM is designed for

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64
}

/**
 * Import raw key bytes as an AES-GCM CryptoKey. `extractable: false` by
 * default and should stay that way for any key that represents unwrapped
 * user secrets (the Master Key, an unwrapped DEK) — non-extractable keys
 * can be used for encrypt/decrypt but can never be read back out or
 * serialized, which is what keeps a compromised page from exfiltrating them
 * via a debugger or a supply-chain-poisoned dependency reading memory.
 */
export async function importAesKey(
  rawBytes: Uint8Array,
  extractable = false,
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(rawBytes), { name: "AES-GCM" }, extractable, [
    "encrypt",
    "decrypt",
  ]);
}

export async function aesEncryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

export async function aesDecryptBytes(
  key: CryptoKey,
  payload: EncryptedPayload,
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(payload.iv)) },
    key,
    toArrayBuffer(base64ToBytes(payload.ciphertext)),
  );
  return new Uint8Array(plaintext);
}

export async function aesEncryptText(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  return aesEncryptBytes(key, textToBytes(plaintext));
}

export async function aesDecryptText(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  return bytesToText(await aesDecryptBytes(key, payload));
}

/** "Wrapping" a key here means AES-GCM-encrypting its raw bytes with another
 * key — simpler and equally sound to WebCrypto's native wrapKey/unwrapKey
 * for our case, and it lets the wrapped form travel as the same
 * {ciphertext, iv} shape as any other encrypted payload. */
export async function wrapRawKey(
  wrappingKey: CryptoKey,
  rawKeyToWrap: Uint8Array,
): Promise<EncryptedPayload> {
  return aesEncryptBytes(wrappingKey, rawKeyToWrap);
}

export async function unwrapRawKey(
  wrappingKey: CryptoKey,
  wrapped: EncryptedPayload,
): Promise<Uint8Array> {
  return aesDecryptBytes(wrappingKey, wrapped);
}
