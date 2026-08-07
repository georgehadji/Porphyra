"use client";

import { Button } from "@porphyra/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useVault } from "@/lib/vault/VaultContext";
import { createVaultItem, listVaultItems } from "@/lib/vault/items";

export default function CvPage() {
  const vault = useVault();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vault.isUnlocked) {
      setStatus("idle");
      return;
    }
    (async () => {
      try {
        const items = await listVaultItems("cv");
        if (items.length > 0) {
          const latest = items[0];
          if (latest) setText(await vault.decrypt({ ciphertext: latest.ciphertext, iv: latest.iv }));
        }
        setStatus("idle");
      } catch {
        setError("Couldn't load your saved CV.");
        setStatus("error");
      }
    })();
    // vault.decrypt is stable per-unlock (see VaultContext's useCallback deps on dekKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.isUnlocked]);

  async function handleSave() {
    setStatus("saving");
    setError(null);
    try {
      const encrypted = await vault.encrypt(text);
      await createVaultItem({ type: "cv", ...encrypted });
      setStatus("idle");
    } catch {
      setError("Couldn't save — try again.");
      setStatus("error");
    }
  }

  if (!vault.isUnlocked) {
    return (
      <main style={{ maxWidth: "40rem", margin: "4rem auto", padding: "0 1.5rem" }}>
        <p>
          Your vault is locked in this tab. <Link href="/login">Log in</Link> to unlock it.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "40rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/">&larr; Back</Link>
      </p>
      <h1 style={{ fontFamily: "var(--p-font-display)" }}>Your CV</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Encrypted before it leaves this browser — plain text for now (paste from anywhere);
        structured import and PDF export are on the roadmap, not built yet.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={20}
        placeholder="Paste your CV here..."
        style={{
          width: "100%",
          fontFamily: "var(--p-font-mono)",
          fontSize: "0.85rem",
          padding: "1rem",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--p-radius-md)",
          background: "var(--color-surface)",
          color: "var(--color-foreground)",
        }}
      />
      {error && <p style={{ color: "var(--color-danger-text)" }}>{error}</p>}
      <div style={{ marginTop: "1rem" }}>
        <Button variant="primary" onClick={handleSave} isLoading={status === "saving"}>
          Save CV
        </Button>
      </div>
    </main>
  );
}
