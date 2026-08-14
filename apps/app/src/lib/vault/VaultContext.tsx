"use client";

import {
  aesDecryptText,
  aesEncryptText,
  computeBlindIndex,
  type DekHandle,
  type EncryptedPayload,
  type IndexKeyHandle,
} from "@porphyra/crypto";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

interface VaultContextValue {
  isUnlocked: boolean;
  /** Set right after signup (bootstrapVault) or login (unlockVault). Both
   * keys are derived together from the same DEK — see
   * packages/crypto/src/keys.ts's deriveIndexKey — so callers never
   * construct an indexKey any other way (a throwaway/unrelated key would
   * make blind-index dedup silently compare against nothing real). The
   * DekHandle/IndexKeyHandle types (packages/crypto/src/brands.ts) also
   * make it a compile error to pass these two arguments in the wrong
   * order or substitute one for the other. */
  unlock: (dekKey: DekHandle, indexKey: IndexKeyHandle) => void;
  /** Clears both in-memory keys. Call on explicit logout and on session
   * expiry — never rely on garbage collection alone for something this
   * sensitive. */
  lock: () => void;
  encrypt: (plaintext: string) => Promise<EncryptedPayload>;
  decrypt: (payload: EncryptedPayload) => Promise<string>;
  blindIndex: (value: string) => Promise<string>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

/**
 * Holds the unwrapped Data Encryption Key AND its derived index key in
 * memory ONLY — not localStorage, not IndexedDB, not a cookie. A page
 * refresh clears both by design: the user re-derives them from their
 * password (fast — the server-side auth check happens first and gates the
 * vault fetch) rather than the app persisting decryption keys across
 * reloads. Persisting the non-extractable CryptoKeys themselves via
 * IndexedDB is a legitimate future refinement (same origin, same
 * non-extractable guarantees) but adds real complexity for a v1 — see the
 * plan's Phase 3 scope before building it.
 */
export function VaultProvider({ children }: { children: ReactNode }) {
  const [dekKey, setDekKey] = useState<DekHandle | null>(null);
  const [indexKey, setIndexKey] = useState<IndexKeyHandle | null>(null);

  const unlock = useCallback((dek: DekHandle, index: IndexKeyHandle) => {
    setDekKey(dek);
    setIndexKey(index);
  }, []);
  const lock = useCallback(() => {
    setDekKey(null);
    setIndexKey(null);
  }, []);

  const encrypt = useCallback(
    async (plaintext: string) => {
      if (!dekKey) throw new Error("Vault is locked — call unlock() first.");
      return aesEncryptText(dekKey, plaintext);
    },
    [dekKey],
  );

  const decrypt = useCallback(
    async (payload: EncryptedPayload) => {
      if (!dekKey) throw new Error("Vault is locked — call unlock() first.");
      return aesDecryptText(dekKey, payload);
    },
    [dekKey],
  );

  const blindIndex = useCallback(
    async (value: string) => {
      if (!indexKey) throw new Error("Vault is locked — call unlock() first.");
      return computeBlindIndex(indexKey, value);
    },
    [indexKey],
  );

  const value = useMemo(
    () => ({ isUnlocked: dekKey !== null, unlock, lock, encrypt, decrypt, blindIndex }),
    [dekKey, unlock, lock, encrypt, decrypt, blindIndex],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within a VaultProvider.");
  return ctx;
}
