"use client";

import { deriveAuthVerifier } from "@porphyra/crypto";
import { Button, Card, Input } from "@porphyra/ui";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";

type Phase = "idle" | "enrolling" | "confirming";

/**
 * TOTP enable/disable. Deliberately asks for the real password again on
 * both actions — Better Auth requires it server-side regardless, and
 * re-prompting is the right call anyway: this changes what can log in as
 * this account, which deserves the same friction as a real security
 * decision, not a one-click toggle.
 */
export default function SecuritySettingsPage() {
  const { data: session, refetch } = useSession();
  const [phase, setPhase] = useState<Phase>("idle");
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const twoFactorEnabled = Boolean(session?.user && "twoFactorEnabled" in session.user && session.user.twoFactorEnabled);

  async function handleEnableStart(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!session?.user.email) {
      setError("Session expired — reload and try again.");
      return;
    }
    setIsSubmitting(true);
    try {
      // Better Auth's stored credential is the DERIVED verifier, never the
      // real password — same rule as signup/login (see kdf.ts). Passing
      // the raw password here fails with "Invalid password" even though
      // it's correct, because it's being compared against the wrong thing.
      const verifier = await deriveAuthVerifier(password, session.user.email);
      const { data, error: enableError } = await authClient.twoFactor.enable({
        password: verifier,
        issuer: "Porphyra",
      });
      if (enableError || !data) {
        setError(enableError?.message ?? "Couldn't start 2FA setup — check your password.");
        return;
      }
      setTotpUri(data.totpURI);
      setBackupCodes(data.backupCodes);
      setPhase("confirming");
    } finally {
      setIsSubmitting(false);
      setPassword("");
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code });
      if (verifyError) {
        setError(verifyError.message ?? "That code didn't match — check your authenticator app.");
        return;
      }
      await refetch();
      setPhase("idle");
      setTotpUri(null);
      setCode("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDisable(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!session?.user.email) {
      setError("Session expired — reload and try again.");
      return;
    }
    setIsSubmitting(true);
    try {
      const verifier = await deriveAuthVerifier(password, session.user.email);
      const { error: disableError } = await authClient.twoFactor.disable({ password: verifier });
      if (disableError) {
        setError(disableError.message ?? "Couldn't disable 2FA — check your password.");
        return;
      }
      await refetch();
      setPhase("idle");
    } finally {
      setIsSubmitting(false);
      setPassword("");
    }
  }

  return (
    <main style={{ maxWidth: "28rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/">&larr; Back</Link>
      </p>
      <Card>
        <h1 style={{ fontFamily: "var(--p-font-display)", marginTop: 0 }}>
          Two-factor authentication
        </h1>

        {phase === "confirming" && totpUri ? (
          <>
            <p style={{ color: "var(--color-muted)" }}>
              Scan this in your authenticator app, then enter the 6-digit code it shows.
            </p>
            <p
              style={{
                fontFamily: "var(--p-font-mono)",
                fontSize: "0.8rem",
                wordBreak: "break-all",
                background: "var(--color-surface-sunken)",
                padding: "0.75rem",
                borderRadius: "var(--p-radius-md)",
              }}
            >
              {totpUri}
            </p>
            {backupCodes && (
              <>
                <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Backup codes</p>
                <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
                  Save these somewhere safe — each works once if you lose access to your
                  authenticator app.
                </p>
                <pre
                  style={{
                    fontFamily: "var(--p-font-mono)",
                    fontSize: "0.85rem",
                    background: "var(--color-surface-sunken)",
                    padding: "0.75rem",
                    borderRadius: "var(--p-radius-md)",
                  }}
                >
                  {backupCodes.join("\n")}
                </pre>
              </>
            )}
            <form onSubmit={handleConfirm} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <Input
                label="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                required
              />
              {error && <p style={{ color: "var(--color-danger-text)", margin: 0 }}>{error}</p>}
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Confirm and enable
              </Button>
            </form>
          </>
        ) : twoFactorEnabled ? (
          <form onSubmit={handleDisable} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ color: "var(--color-success-text)" }}>2FA is enabled on your account.</p>
            <Input
              label="Confirm your password to disable"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && <p style={{ color: "var(--color-danger-text)", margin: 0 }}>{error}</p>}
            <Button type="submit" variant="danger" isLoading={isSubmitting}>
              Disable 2FA
            </Button>
          </form>
        ) : (
          <form onSubmit={handleEnableStart} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ color: "var(--color-muted)" }}>
              Not enabled yet. Confirm your password to start setup.
            </p>
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && <p style={{ color: "var(--color-danger-text)", margin: 0 }}>{error}</p>}
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Set up 2FA
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
