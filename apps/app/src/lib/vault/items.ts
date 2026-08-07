"use client";

// Thin client-side wrapper over the vault-items API — every call here
// encrypts before sending or decrypts after receiving; nothing plaintext
// ever crosses these functions' network boundary except through
// /api/evaluate's one consented request (see that route's own comment).

export type VaultItemType =
  | "cv"
  | "report"
  | "cover_letter"
  | "interview_note"
  | "contact"
  | "jd"
  | "provider_key";

export interface VaultItemRow {
  id: string;
  type: VaultItemType;
  ciphertext: string;
  iv: string;
  blindIndex: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createVaultItem(input: {
  type: VaultItemType;
  ciphertext: string;
  iv: string;
  blindIndex?: string;
}): Promise<{ id: string }> {
  const response = await fetch("/api/vault/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Couldn't save to your vault.");
  return response.json();
}

export async function listVaultItems(type?: VaultItemType): Promise<VaultItemRow[]> {
  const url = type ? `/api/vault/items?type=${type}` : "/api/vault/items";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Couldn't load your vault.");
  return response.json();
}

export async function getVaultItem(id: string): Promise<VaultItemRow> {
  const response = await fetch(`/api/vault/items/${id}`);
  if (!response.ok) throw new Error("Couldn't find that item.");
  return response.json();
}
