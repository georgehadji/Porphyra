"use client";

import { scoreBand, stateLabel } from "@porphyra/core";
import type { ApplicationStateId } from "@porphyra/core";
import { Badge, Card, SCORE_BAND_BADGE_TONE, STATE_BADGE_TONE } from "@porphyra/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useVault } from "@/lib/vault/VaultContext";

interface ApplicationRow {
  id: string;
  state: ApplicationStateId;
  score: string | null;
  companyCiphertext: string;
  companyIv: string;
  roleCiphertext: string;
  roleIv: string;
  createdAt: string;
}

interface DecryptedRow extends ApplicationRow {
  company: string;
  role: string;
}

export default function PipelinePage() {
  const vault = useVault();
  const [rows, setRows] = useState<DecryptedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vault.isUnlocked) return;
    (async () => {
      try {
        const response = await fetch("/api/applications");
        if (!response.ok) throw new Error("Couldn't load your pipeline.");
        const applications: ApplicationRow[] = await response.json();
        const decrypted = await Promise.all(
          applications.map(async (a) => ({
            ...a,
            company: await vault.decrypt({ ciphertext: a.companyCiphertext, iv: a.companyIv }),
            role: await vault.decrypt({ ciphertext: a.roleCiphertext, iv: a.roleIv }),
          })),
        );
        setRows(decrypted);
      } catch {
        setError("Couldn't load your pipeline.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.isUnlocked]);

  if (!vault.isUnlocked) {
    return (
      <main style={{ maxWidth: "48rem", margin: "4rem auto", padding: "0 1.5rem" }}>
        <p>
          Your vault is locked in this tab. <Link href="/login">Log in</Link> to unlock it.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "48rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/">&larr; Back</Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "var(--p-font-display)", margin: 0 }}>Your pipeline</h1>
        <Link href="/evaluate">
          <span style={{ color: "var(--color-brand-text)", fontWeight: 600 }}>+ Evaluate a posting</span>
        </Link>
      </div>

      {error && <p style={{ color: "var(--color-danger-text)" }}>{error}</p>}
      {rows === null && !error && <p style={{ color: "var(--color-muted)" }}>Loading...</p>}
      {rows?.length === 0 && (
        <p style={{ color: "var(--color-muted)" }}>
          Nothing here yet — <Link href="/evaluate">evaluate your first posting</Link>.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {rows?.map((row) => (
          <Link key={row.id} href={`/pipeline/${row.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{row.role}</p>
                  <p style={{ margin: 0, color: "var(--color-muted)" }}>{row.company}</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {row.score && (
                    <Badge tone={SCORE_BAND_BADGE_TONE[scoreBand(Number(row.score))]}>
                      {Number(row.score).toFixed(1)}/5
                    </Badge>
                  )}
                  <Badge tone={STATE_BADGE_TONE[row.state]}>{stateLabel(row.state)}</Badge>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
