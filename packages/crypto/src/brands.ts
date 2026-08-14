// Nominal typing for the four distinct keys in this codebase's key
// hierarchy. Every one of them is a plain WebCrypto `CryptoKey` at
// runtime — structurally identical, which means nothing at the type level
// stopped a future call site from passing the index key into
// aesEncryptText() (silently producing ciphertext nobody can ever decrypt)
// or the DEK into computeBlindIndex() (compiles fine, quietly defeats the
// entire reason these keys are kept separate — see keys.ts's own comment
// on why blind-index blast radius must stay contained to "server can test
// guesses," never "server can decrypt"). Key separation only does its job
// if misuse is impossible, not just discouraged by a comment.
//
// The branding is compile-time only (the `unique symbol` field is never
// actually present on a real CryptoKey at runtime) — this changes nothing
// about how these values behave, only what TypeScript will let you pass
// where. See docs/ARCHITECTURE_UPLIFT_PLAN.md §4.1.

declare const brand: unique symbol;

/** A `CryptoKey` tagged with which role it plays in the key hierarchy — a
 * `Branded<CryptoKey, "Dek">` and a `Branded<CryptoKey, "IndexKey">` are
 * different types even though both wrap a `CryptoKey` at runtime. */
export type Branded<T, B extends string> = T & { readonly [brand]: B };

/** Argon2id-derived from the password + `encSalt` — wraps/unwraps the DEK.
 * Never used for anything else. */
export type MasterKeyHandle = Branded<CryptoKey, "MasterKey">;

/** The Data Encryption Key — encrypts/decrypts vault content
 * (AES-256-GCM). Never used to compute a blind index. */
export type DekHandle = Branded<CryptoKey, "Dek">;

/** HKDF-derived from the raw DEK (see keys.ts's deriveIndexKey) — computes
 * HMAC blind indexes only. Cannot decrypt anything even if it leaked,
 * which is the entire point of deriving it separately from the DEK. */
export type IndexKeyHandle = Branded<CryptoKey, "IndexKey">;

/** Wraps/unwraps the DEK via the 24-word recovery mnemonic. Never used for
 * anything else. */
export type RecoveryKeyHandle = Branded<CryptoKey, "RecoveryKey">;

/** Any key AES-GCM operations (aesEncrypt / aesDecrypt / wrapRawKey /
 * unwrapRawKey) accept — every branded key EXCEPT IndexKeyHandle, which is
 * HMAC-only and structurally cannot appear here. */
export type AesCapableKey = MasterKeyHandle | DekHandle | RecoveryKeyHandle;

/** Casts a freshly-imported `CryptoKey` to a specific branded handle. This
 * is the ONLY place in the crypto package that should ever need an
 * `as` — every other module imports a key already through one of these
 * brands and never needs to re-cast it. Centralizing the cast here means
 * a future audit only has to check one function's call sites, not every
 * `importAesKey` result across the codebase. */
export function brandKey<B extends string>(key: CryptoKey): Branded<CryptoKey, B> {
  return key as Branded<CryptoKey, B>;
}
