"use client";

import { Button, Card } from "@porphyra/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useVault } from "@/lib/vault/VaultContext";
import { createVaultItem, listVaultItems } from "@/lib/vault/items";

export default function EvaluatePage() {
  const router = useRouter();
  const vault = useVault();
  const [hasCv, setHasCv] = useState<boolean | null>(null);
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [roleTitles, setRoleTitles] = useState("");
  const [status, setStatus] = useState<"idle" | "evaluating" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vault.isUnlocked) return;
    listVaultItems("cv")
      .then((items) => setHasCv(items.length > 0))
      .catch(() => setHasCv(false));
  }, [vault.isUnlocked]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("evaluating");
    try {
      const cvItems = await listVaultItems("cv");
      const latestCv = cvItems[0];
      if (!latestCv) throw new Error("Save a CV first.");
      const cvPlaintext = await vault.decrypt({ ciphertext: latestCv.ciphertext, iv: latestCv.iv });

      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvPlaintext,
          jdPlaintext: jdText,
          jdUrl: jdUrl || undefined,
          targetProfile: {
            roleTitles: roleTitles
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            signals: [],
            eligibleCountries: ["any"],
          },
        }),
      });

      if (response.status === 402) {
        const body = await response.json();
        throw new Error(body.message ?? "You've hit your evaluation limit this month.");
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "Evaluation failed.");
      }

      const { report } = await response.json();

      const reportEncrypted = await vault.encrypt(JSON.stringify(report));
      const reportItem = await createVaultItem({ type: "report", ...reportEncrypted });

      const companyEncrypted = await vault.encrypt(company);
      const roleEncrypted = await vault.encrypt(role);

      const applicationResponse = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyBlindIndex: await vault.blindIndex(company),
          roleBlindIndex: await vault.blindIndex(role),
          companyCiphertext: companyEncrypted.ciphertext,
          companyIv: companyEncrypted.iv,
          roleCiphertext: roleEncrypted.ciphertext,
          roleIv: roleEncrypted.iv,
          reportItemId: reportItem.id,
          score: report.score,
          legitimacyTier: report.legitimacyTier,
        }),
      });
      if (!applicationResponse.ok) throw new Error("Evaluated, but couldn't save to your pipeline.");
      const application = await applicationResponse.json();

      router.push(`/pipeline/${application.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("idle");
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

  if (hasCv === false) {
    return (
      <main style={{ maxWidth: "40rem", margin: "4rem auto", padding: "0 1.5rem" }}>
        <p>
          <Link href="/cv">Save a CV</Link> first — an evaluation needs something to match the
          posting against.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "36rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/">&larr; Back</Link>
      </p>
      <Card>
        <h1 style={{ fontFamily: "var(--p-font-display)", marginTop: 0 }}>Evaluate a posting</h1>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <label>
            Company
            <input value={company} onChange={(e) => setCompany(e.target.value)} required style={inputStyle} />
          </label>
          <label>
            Role title
            <input value={role} onChange={(e) => setRole(e.target.value)} required style={inputStyle} />
          </label>
          <label>
            Posting URL (optional)
            <input value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Job description text
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={10}
              required
              style={{ ...inputStyle, fontFamily: "var(--p-font-mono)", fontSize: "0.85rem" }}
            />
          </label>
          <label>
            Your target role titles (comma-separated — what you're aiming for)
            <input
              value={roleTitles}
              onChange={(e) => setRoleTitles(e.target.value)}
              placeholder="e.g. Senior Product Designer, Design Lead"
              required
              style={inputStyle}
            />
          </label>
          {error && <p style={{ color: "var(--color-danger-text)", margin: 0 }}>{error}</p>}
          <Button type="submit" variant="primary" isLoading={status === "evaluating"}>
            Evaluate
          </Button>
        </form>
      </Card>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: "0.25rem",
  padding: "0.6rem 0.75rem",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--p-radius-md)",
  background: "var(--color-surface)",
  color: "var(--color-foreground)",
  boxSizing: "border-box",
};
