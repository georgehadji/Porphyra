"use client";

import { aesDecryptText, aesEncryptText, type EncryptedPayload } from "@porphyra/crypto";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

interface VaultContextValue {
  isUnlocked: boolean;
  /** Set right after signup (bootstrapVault) or login (unlockVault). */
  unlock: (dekKey: CryptoKey) => void;
  /** Clears the in-memory key. Call on explicit logout and on session
   * expiry — never rely on garbage collection alone for something this
   * sensitive. */
  lock: () => void;
  encrypt: (plaintext: string) => Promise<EncryptedPayload>;
  decrypt: (payload: EncryptedPayload) => Promise<string>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

/**
 * Holds the unwrapped Data Encryption Key in memory ONLY — not
 * localStorage, not IndexedDB, not a cookie. A page refresh clears it by
 * design: the user re-derives it from their password (fast — the
 * server-side auth check happens first and gates the vault fetch) rather
 * than the app persisting a decryption key across reloads. Persisting the
 * non-extractable CryptoKey itself via IndexedDB is a legitimate future
 * refinement (same origin, same non-extractable guarantees) but adds real
 * complexity for a v1 — see the plan's Phase 3 scope before building it.
 */
export function VaultProvider({ children }: { children: ReactNode }) {
  const [dekKey, setDekKey] = useState<CryptoKey | null>(null);

  const unlock = useCallback((key: CryptoKey) => setDekKey(key), []);
  const lock = useCallback(() => setDekKey(null), []);

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

  const value = useMemo(
    () => ({ isUnlocked: dekKey !== null, unlock, lock, encrypt, decrypt }),
    [dekKey, unlock, lock, encrypt, decrypt],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within a VaultProvider.");
  return ctx;
}
