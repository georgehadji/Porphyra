// Data Encryption Key + Recovery Key generation, and the blind-index sub-key
// derivation. See the plan's Encryption design § Key hierarchy for the
// full picture — this is the part below the password/Argon2id layer.

import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { brandKey, type IndexKeyHandle } from "./brands";
import { randomBytes, toArrayBuffer } from "./encoding";

const DEK_LENGTH_BYTES = 32; // AES-256

export function generateDek(): Uint8Array {
  return randomBytes(DEK_LENGTH_BYTES);
}

/** A recovery key IS a BIP39 entropy source — generating one directly gives
 * us the mnemonic for free instead of a separate encode step. `raw` is
 * derived FROM the mnemonic (not drawn independently) so the two always
 * represent the same bytes — RECOVERY_KEY_LENGTH_BYTES stays as
 * documentation of the resulting entropy size, not an input to this
 * function. */
export function generateRecoveryKey(): { raw: Uint8Array; mnemonic: string } {
  const mnemonic = generateMnemonic(wordlist, 256); // 256 bits entropy -> 24 words
  return { raw: mnemonicToEntropy(mnemonic, wordlist), mnemonic };
}

export function mnemonicToRecoveryKey(mnemonic: string): Uint8Array {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error("That recovery phrase doesn't check out — check for typos or a missing word.");
  }
  return mnemonicToEntropy(mnemonic, wordlist);
}

/**
 * Derive the blind-index sub-key from the DEK via HKDF-SHA256. This is
 * DELIBERATELY a different key than the DEK itself (standard key
 * separation): the index key only ever produces HMACs the server stores and
 * searches on, so if it were ever somehow exposed, it leaks the ability to
 * test guesses against known plaintext (e.g. "is this application at
 * Google?") — not the ability to decrypt anything. Keeping it separate from
 * the DEK means that blast radius can never include vault content.
 */
export async function deriveIndexKey(dekRaw: Uint8Array): Promise<IndexKeyHandle> {
  const ikm = await crypto.subtle.importKey("raw", toArrayBuffer(dekRaw), "HKDF", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(new Uint8Array(0)),
      info: toArrayBuffer(new TextEncoder().encode("porphyra-blind-index-v1")),
    },
    ikm,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  return brandKey<"IndexKey">(key);
}
