"use client";

import {
  brandKey,
  bytesToBase64,
  type DekHandle,
  deriveIndexKey,
  deriveKeyMaterial,
  type EncryptedPayload,
  generateDek,
  generateRecoveryKey,
  generateSalt,
  type IndexKeyHandle,
  importAesKey,
  type KdfParams,
  MASTER_KEY_PARAMS,
  wrapRawKey,
} from "@porphyra/crypto";

export interface VaultBootstrapResult {
  /** POSTed to /api/vault/bootstrap verbatim. */
  payload: {
    wrappedDek: EncryptedPayload;
    encSalt: string;
    recoveryWrappedDek: EncryptedPayload;
    kdfParams: KdfParams;
  };
  /** Shown to the user exactly once — see the mandatory acknowledgement
   * step in signup/page.tsx. Never sent to the server, never persisted. */
  recoveryMnemonic: string;
  /** The unwrapped DEK, ready to use immediately post-signup so the user
   * isn't asked to log in again right after registering. */
  dekKey: DekHandle;
  /** Derived from the same DEK via HKDF — see VaultContext's comment on
   * why this always travels paired with dekKey, never generated separately. */
  indexKey: IndexKeyHandle;
}

/**
 * Runs entirely client-side, right after Better Auth confirms account
 * creation. Generates a fresh DEK, wraps it under a Master Key derived
 * from the user's real password, and again under a freshly-generated
 * recovery key — see the plan's Encryption design § Key hierarchy.
 */
export async function bootstrapVault(password: string): Promise<VaultBootstrapResult> {
  const encSalt = generateSalt();
  const mkRaw = await deriveKeyMaterial(password, encSalt, MASTER_KEY_PARAMS);
  const masterKey = brandKey<"MasterKey">(await importAesKey(mkRaw, false));

  const dekRaw = generateDek();
  const wrappedDek = await wrapRawKey(masterKey, dekRaw);

  const { raw: recoveryKeyRaw, mnemonic } = generateRecoveryKey();
  const recoveryKey = brandKey<"RecoveryKey">(await importAesKey(recoveryKeyRaw, false));
  const recoveryWrappedDek = await wrapRawKey(recoveryKey, dekRaw);

  const dekKey = brandKey<"Dek">(await importAesKey(dekRaw, false));
  const indexKey = await deriveIndexKey(dekRaw);

  return {
    payload: {
      wrappedDek,
      encSalt: bytesToBase64(encSalt),
      recoveryWrappedDek,
      kdfParams: MASTER_KEY_PARAMS,
    },
    recoveryMnemonic: mnemonic,
    dekKey,
    indexKey,
  };
}
