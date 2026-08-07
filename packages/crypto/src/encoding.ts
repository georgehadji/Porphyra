// Shared byte <-> base64/hex helpers. Uses the standard Uint8Array.fromBase64
// / toBase64 where available (Node 22+, newer browsers) and falls back to a
// manual implementation otherwise — keeps this dependency-free.

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof (bytes as unknown as { toBase64?: () => string }).toBase64 === "function") {
    return (bytes as unknown as { toBase64: () => string }).toBase64();
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // btoa exists in browsers and Node 18+.
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const Ctor = Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array };
  if (typeof Ctor.fromBase64 === "function") return Ctor.fromBase64(b64);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Copy a Uint8Array's bytes into a fresh, standalone ArrayBuffer.
 *
 * Needed for two reasons, not just to satisfy TS 5.7+'s stricter
 * `BufferSource` (which wants `ArrayBufferView<ArrayBuffer>`, and a plain
 * `Uint8Array`'s `.buffer` is typed `ArrayBufferLike`): a `Uint8Array` can
 * also be a *view* into a larger buffer with a non-zero `byteOffset` (e.g.
 * from `.subarray()`) — passing `.buffer` directly to `crypto.subtle` in
 * that case would silently include bytes outside the view. Copying avoids
 * both problems at once.
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}
