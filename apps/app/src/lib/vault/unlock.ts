"use client";

import {
  type EncryptedPayload,
  type KdfParams,
  base64ToBytes,
  deriveIndexKey,
  deriveKeyMaterial,
  importAesKey,
  unwrapRawKey,
} from "@porphyra/crypto";

export interface VaultKeysResponse {
  wrappedDek: EncryptedPayload;
  encSalt: string;
  recoveryWrappedDek: EncryptedPayload;
  kdfParams: KdfParams;
}

export interface UnlockedVault {
  dekKey: CryptoKey;
  indexKey: CryptoKey;
}

/**
 * Runs right after a successful login, using the real password still held
 * in memory from the same form submission (never persisted, never sent to
 * the server) and the wrapped keys fetched from GET /api/vault/keys.
 *
 * Throws if the password is wrong — AES-GCM decryption fails closed (see
 * packages/crypto's round-trip tests), so a caller can present a single
 * "incorrect password" message without the server ever having validated
 * the vault password itself (only the separate auth verifier — see
 * apps/app/src/lib/auth.ts).
 */
export async function unlockVault(password: string, keys: VaultKeysResponse): Promise<UnlockedVault> {
  const encSalt = base64ToBytes(keys.encSalt);
  const mkRaw = await deriveKeyMaterial(password, encSalt, keys.kdfParams);
  const masterKey = await importAesKey(mkRaw, false);
  const dekRaw = await unwrapRawKey(masterKey, keys.wrappedDek);
  const [dekKey, indexKey] = await Promise.all([
    importAesKey(dekRaw, false),
    deriveIndexKey(dekRaw),
  ]);
  return { dekKey, indexKey };
}

/**
 * The recovery path: unwrap the DEK with the 24-word mnemonic instead of
 * the password. Used when a user has forgotten their password but still
 * has their recovery key — see the account-recovery flow (Phase 4+).
 */
export async function unlockVaultWithRecoveryKey(
  recoveryKeyRaw: Uint8Array,
  keys: Pick<VaultKeysResponse, "recoveryWrappedDek">,
): Promise<UnlockedVault> {
  const recoveryKey = await importAesKey(recoveryKeyRaw, false);
  const dekRaw = await unwrapRawKey(recoveryKey, keys.recoveryWrappedDek);
  const [dekKey, indexKey] = await Promise.all([
    importAesKey(dekRaw, false),
    deriveIndexKey(dekRaw),
  ]);
  return { dekKey, indexKey };
}
