// Argon2id key derivation — the only place a user's password is ever
// touched. Runs entirely client-side; the raw password never leaves the
// browser (see the plan's Encryption design § Key hierarchy).
//
// Phase 2 TODO (auth flow, not a crypto-primitive concern): the login screen
// needs `saltAuth` *before* the user is authenticated, which means a
// pre-login endpoint that returns a user's stored salt for a given email —
// standard practice (same shape as SRP/OPAQUE-style flows), but it's wiring,
// not covered by this package.

import { argon2id } from "hash-wasm";
import { randomBytes } from "./encoding";

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
