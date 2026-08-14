import { describe, expect, it } from "vitest";
import { aesDecryptText, aesEncryptText, importAesKey, unwrapRawKey, wrapRawKey } from "./aes";
import { computeBlindIndex, normalizeForIndex } from "./blindIndex";
import { brandKey } from "./brands";
import { base64ToBytes } from "./encoding";
import {
  AUTH_VERIFIER_PARAMS,
  deriveAuthVerifier,
  deriveAuthVerifierSalt,
  deriveKeyMaterial,
  generateSalt,
  MASTER_KEY_PARAMS,
} from "./kdf";
import { deriveIndexKey, generateDek, generateRecoveryKey, mnemonicToRecoveryKey } from "./keys";

// Argon2id at full memory cost (64 MiB) is slow enough in a test loop that
// the default vitest timeout can be tight on CI runners — extend it rather
// than weaken the KDF params, since the params ARE the thing under test.
const KDF_TIMEOUT_MS = 20_000;

describe("full vault lifecycle (password -> MK -> DEK -> record)", () => {
  it(
    "encrypts and decrypts a record end to end",
    async () => {
      const password = "correct horse battery staple";
      const salt = generateSalt();

      const mkRaw = await deriveKeyMaterial(password, salt, MASTER_KEY_PARAMS);
      const mk = brandKey<"MasterKey">(await importAesKey(mkRaw, false));

      const dek = generateDek();
      const wrappedDek = await wrapRawKey(mk, dek);

      // Simulate a later session: only the wrapped DEK + salt are persisted.
      const unwrappedDekRaw = await unwrapRawKey(mk, wrappedDek);
      expect(new Uint8Array(unwrappedDekRaw)).toEqual(dek);

      const dekKey = brandKey<"Dek">(await importAesKey(unwrappedDekRaw, false));
      const plaintext = "Senior Product Designer @ a company that shall not be named";
      const encrypted = await aesEncryptText(dekKey, plaintext);
      expect(encrypted.ciphertext).not.toContain(plaintext);

      const decrypted = await aesDecryptText(dekKey, encrypted);
      expect(decrypted).toBe(plaintext);
    },
    KDF_TIMEOUT_MS,
  );

  it(
    "fails to unwrap the DEK with the wrong password",
    async () => {
      const salt = generateSalt();
      const mkRaw = await deriveKeyMaterial("right password", salt, MASTER_KEY_PARAMS);
      const mk = brandKey<"MasterKey">(await importAesKey(mkRaw, false));
      const dek = generateDek();
      const wrappedDek = await wrapRawKey(mk, dek);

      const wrongMkRaw = await deriveKeyMaterial("wrong password", salt, MASTER_KEY_PARAMS);
      const wrongMk = brandKey<"MasterKey">(await importAesKey(wrongMkRaw, false));

      await expect(unwrapRawKey(wrongMk, wrappedDek)).rejects.toThrow();
    },
    KDF_TIMEOUT_MS,
  );
});

describe("recovery key path", () => {
  it("recovers the same raw key from its own mnemonic", () => {
    const { raw, mnemonic } = generateRecoveryKey();
    const recovered = mnemonicToRecoveryKey(mnemonic);
    expect(recovered).toEqual(raw);
  });

  it("rejects a mnemonic with a typo", () => {
    const { mnemonic } = generateRecoveryKey();
    const corrupted = mnemonic.replace(/^\w+/, "notarealbip39word");
    expect(() => mnemonicToRecoveryKey(corrupted)).toThrow();
  });
});

describe("blind index", () => {
  it("is deterministic and normalizes case/whitespace", async () => {
    const dek = generateDek();
    const indexKey = await deriveIndexKey(dek);
    const a = await computeBlindIndex(indexKey, "  Google  ");
    const b = await computeBlindIndex(indexKey, "google");
    expect(a).toBe(b);
  });

  it("differs across two different DEKs (no cross-user linkability)", async () => {
    const indexKeyA = await deriveIndexKey(generateDek());
    const indexKeyB = await deriveIndexKey(generateDek());
    const a = await computeBlindIndex(indexKeyA, "Google");
    const b = await computeBlindIndex(indexKeyB, "Google");
    expect(a).not.toBe(b);
  });

  it("normalizeForIndex collapses whitespace and case", () => {
    expect(normalizeForIndex("  Google  Inc  ")).toBe("google inc");
  });
});

describe("auth verifier salt (deterministic, from email)", () => {
  it(
    "is deterministic for the same email",
    async () => {
      const a = await deriveAuthVerifierSalt("user@example.com");
      const b = await deriveAuthVerifierSalt("user@example.com");
      expect(a).toEqual(b);
    },
    KDF_TIMEOUT_MS,
  );

  it("normalizes case and whitespace, same as blind indexing", async () => {
    const a = await deriveAuthVerifierSalt(" User@Example.com ");
    const b = await deriveAuthVerifierSalt("user@example.com");
    expect(a).toEqual(b);
  });

  it("differs across different emails", async () => {
    const a = await deriveAuthVerifierSalt("alice@example.com");
    const b = await deriveAuthVerifierSalt("bob@example.com");
    expect(a).not.toEqual(b);
  });
});

describe('auth verifier (what the server sees as "the password")', () => {
  it(
    "differs from the Master Key derived from the same password",
    async () => {
      const password = "correct horse battery staple";
      const email = "user@example.com";

      const verifier = await deriveAuthVerifier(password, email);

      const encSalt = generateSalt(); // a real per-signup random salt, distinct from the deterministic auth salt
      const mkRaw = await deriveKeyMaterial(password, encSalt, MASTER_KEY_PARAMS);

      // The verifier is base64 text; compare on the decoded bytes so this
      // doesn't just trivially pass because one's base64 and one isn't.
      expect(base64ToBytes(verifier)).not.toEqual(mkRaw);
    },
    KDF_TIMEOUT_MS,
  );

  it(
    "is deterministic for the same password + email (so login recomputes it identically)",
    async () => {
      const verifierA = await deriveAuthVerifier("hunter2 hunter2", "user@example.com");
      const verifierB = await deriveAuthVerifier("hunter2 hunter2", "user@example.com");
      expect(verifierA).toBe(verifierB);
    },
    KDF_TIMEOUT_MS,
  );

  it(
    "uses AUTH_VERIFIER_PARAMS' full cost, not a cheaper shortcut",
    async () => {
      expect(AUTH_VERIFIER_PARAMS.memoryKb).toBe(MASTER_KEY_PARAMS.memoryKb);
      expect(AUTH_VERIFIER_PARAMS.iterations).toBe(MASTER_KEY_PARAMS.iterations);
    },
    KDF_TIMEOUT_MS,
  );
});

describe("no plaintext leakage in the encrypted payload shape", () => {
  it("ciphertext and iv are both base64, never contain the source text", async () => {
    const dek = generateDek();
    const key = brandKey<"Dek">(await importAesKey(dek, false));
    const secret = "sk-ant-do-not-leak-this-1234567890";
    const encrypted = await aesEncryptText(key, secret);
    expect(encrypted.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(encrypted.iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(encrypted.ciphertext).not.toContain("sk-ant");
  });
});
