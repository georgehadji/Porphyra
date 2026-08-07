// Argon2id key derivation — the only place a user's password is ever
// touched. Runs entirely client-side; the raw password never leaves the
// browser (see the plan's Encryption design § Key hierarchy).

import { argon2id } from "hash-wasm";
import { bytesToBase64, randomBytes, toArrayBuffer } from "./encoding";

export interface KdfParams {
  algo: "argon2id";
  memoryKb: number;
  iterations: number;
  parallelism: number;
  hashLengthBytes: number;
}

/** Master Key params — deliberately expensive; this key only runs at
 * login/unlock, not per-request. 64 MiB / t=3 / p=1 is OWASP's current
 * Argon2id baseline for a browser-side KDF. */
export const MASTER_KEY_PARAMS: KdfParams = {
  algo: "argon2id",
  memoryKb: 64 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLengthBytes: 32,
};

/** Auth-verifier params — same cost as the Master Key. Using a cheaper
 * profile here would leak that the auth verifier is easier to brute-force
 * than the encryption key, which defeats the point of deriving it from the
 * same password. Better Auth re-hashes this value again server-side with
 * its own KDF before storing it, so the cost is paid once client-side and
 * once server-side, not twice server-side. */
export const AUTH_VERIFIER_PARAMS: KdfParams = MASTER_KEY_PARAMS;

export function generateSalt(): Uint8Array {
  return randomBytes(16);
}

/**
 * The Master Key's salt (`encSalt`, stored in `user_keys`) is random and
 * only needed AFTER login succeeds — the client fetches it from an
 * authenticated endpoint once it has a session, then derives the Master Key
 * to unwrap the DEK. It never gates login itself.
 *
 * The auth verifier's salt has a different constraint: the client needs it
 * BEFORE authenticating, to derive the value it sends as "the password".
 * Rather than adding a pre-login lookup endpoint (an extra round trip and
 * an email-enumeration surface — a differing response time or error shape
 * for "unknown email" vs "wrong password" leaks account existence), this
 * salt is derived deterministically from the email itself via HKDF. It
 * doesn't need secrecy or randomness: its only job is domain-separating the
 * auth verifier from the Master Key derivation (different salt -> unrelated
 * output, even though both start from the same password), not adding
 * brute-force cost — Argon2id's own cost parameters do that job.
 */
export async function deriveAuthVerifierSalt(email: string): Promise<Uint8Array> {
  const normalized = email.trim().toLowerCase();
  const ikm = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(normalized)),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(new Uint8Array(0)),
      info: toArrayBuffer(new TextEncoder().encode("porphyra-auth-verifier-salt-v1")),
    },
    ikm,
    128, // 16 bytes — same size as generateSalt()'s random salts
  );
  return new Uint8Array(bits);
}

/**
 * The value sent to Better Auth as "the password" at signup and login.
 * Base64-encoded so it's a plain string Better Auth can hash with its own
 * algorithm — see apps/app/src/lib/auth.ts's comment on why this is safe:
 * this is NOT the user's real password, and this server-side value alone
 * can never unlock the vault (that needs the Master Key, derived with a
 * different salt from the real password — see MASTER_KEY_PARAMS above).
 */
export async function deriveAuthVerifier(password: string, email: string): Promise<string> {
  const salt = await deriveAuthVerifierSalt(email);
  const bytes = await deriveKeyMaterial(password, salt, AUTH_VERIFIER_PARAMS);
  return bytesToBase64(bytes);
}

/**
 * Derive raw key material from a password + salt. Callers decide what the
 * output bytes become (a wrapping key, an auth verifier, etc.) — this
 * function has no opinion beyond "run Argon2id with these params".
 */
export async function deriveKeyMaterial(
  password: string,
  salt: Uint8Array,
  params: KdfParams = MASTER_KEY_PARAMS,
): Promise<Uint8Array> {
  const hash = await argon2id({
    password,
    salt,
    memorySize: params.memoryKb,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: params.hashLengthBytes,
    outputType: "binary",
  });
  return hash;
}
