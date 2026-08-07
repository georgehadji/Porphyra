import { describe, expect, it } from "vitest";
import { aesDecryptText, aesEncryptText, importAesKey, unwrapRawKey, wrapRawKey } from "./aes";
import { computeBlindIndex, normalizeForIndex } from "./blindIndex";
import { deriveKeyMaterial, generateSalt, MASTER_KEY_PARAMS } from "./kdf";
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
      const mk = await importAesKey(mkRaw, false);

      const dek = generateDek();
      const wrappedDek = await wrapRawKey(mk, dek);

      // Simulate a later session: only the wrapped DEK + salt are persisted.
      const unwrappedDekRaw = await unwrapRawKey(mk, wrappedDek);
      expect(new Uint8Array(unwrappedDekRaw)).toEqual(dek);

      const dekKey = await importAesKey(unwrappedDekRaw, false);
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
      const mk = await importAesKey(mkRaw, false);
      const dek = generateDek();
      const wrappedDek = await wrapRawKey(mk, dek);

      const wrongMkRaw = await deriveKeyMaterial("wrong password", salt, MASTER_KEY_PARAMS);
      const wrongMk = await importAesKey(wrongMkRaw, false);

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

describe("no plaintext leakage in the encrypted payload shape", () => {
  it("ciphertext and iv are both base64, never contain the source text", async () => {
    const dek = generateDek();
    const key = await importAesKey(dek, false);
    const secret = "sk-ant-do-not-leak-this-1234567890";
    const encrypted = await aesEncryptText(key, secret);
    expect(encrypted.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(encrypted.iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(encrypted.ciphertext).not.toContain("sk-ant");
  });
});
