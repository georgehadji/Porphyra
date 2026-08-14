// HMAC-based blind indexing — lets the server filter/dedupe on fields like
// company or role name without ever learning the plaintext value. See
// keys.ts's deriveIndexKey for why this uses a key separate from the DEK.

import type { IndexKeyHandle } from "./brands";
import { bytesToBase64, textToBytes, toArrayBuffer } from "./encoding";

/** Case/whitespace-insensitive so "Google", "google", " Google " all index
 * identically — otherwise dedup silently fails on formatting differences. */
export function normalizeForIndex(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function computeBlindIndex(indexKey: IndexKeyHandle, value: string): Promise<string> {
  const normalized = normalizeForIndex(value);
  const signature = await crypto.subtle.sign(
    "HMAC",
    indexKey,
    toArrayBuffer(textToBytes(normalized)),
  );
  return bytesToBase64(new Uint8Array(signature));
}
