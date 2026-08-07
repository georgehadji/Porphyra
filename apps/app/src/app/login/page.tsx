"use client";

import { deriveAuthVerifier } from "@porphyra/crypto";
import { Button, Input } from "@porphyra/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient, signIn } from "@/lib/auth-client";
import { bootstrapVault } from "@/lib/vault/bootstrap";
import { useVault } from "@/lib/vault/VaultContext";
import { RecoveryKeyReveal } from "@/lib/vault/RecoveryKeyReveal";
import { unlockVault, type VaultKeysResponse } from "@/lib/vault/unlock";

type Phase = "credentials" | "twoFactor" | "recoveryReveal";

export default function LoginPage() {
  const router = useRouter();
  const vault = useVault();

  const [phase, setPhase] = useState<Phase>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // kept only in memory, only as long as this flow needs it
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState<string | null>(null);

  /** Shared by both the plain sign-in success path and the post-2FA path:
   * fetch the wrapped vault keys, bootstrap a new vault if this account
   * doesn't have one yet (first login after signup), or unlock the
   * existing one. */
  async function completeLoginWithVault() {
    const keysResponse = await fetch("/api/vault/keys");

    if (keysResponse.status === 404) {
      const { payload, recoveryMnemonic: mnemonic, dekKey } = await bootstrapVault(password);
      const bootstrapResponse = await fetch("/api/vault/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!bootstrapResponse.ok) {
        throw new Error("Couldn't finish setting up your vault — try logging in again.");
      }
      vault.unlock(dekKey);
      setRecoveryMnemonic(mnemonic);
      setPhase("recoveryReveal");
      return;
    }

    if (!keysResponse.ok) {
      throw new Error("Couldn't load your vault — try again shortly.");
    }

    const keys: VaultKeysResponse = await keysResponse.json();
    let dekKey: CryptoKey;
    try {
      dekKey = await unlockVault(password, keys);
    } catch {
      throw new Error("That password doesn't match your vault — check for typos.");
    }
    vault.unlock(dekKey);
    router.push("/");
  }

  async function handleCredentialsSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const verifier = await deriveAuthVerifier(password, email);
      // Detecting a 2FA challenge only works reliably through the
      // onSuccess callback's `context.data` — the plain awaited return
      // value's inferred type doesn't carry the twoFactor plugin's
      // augmentation in this better-auth version (confirmed against the
      // library's own docs, which use exactly this callback shape for the
      // same check).
      let needsTwoFactor = false;
      const { error: signInError } = await signIn.email(
        { email, password: verifier },
        {
          onSuccess: (context) => {
            if (context.data?.twoFactorRedirect) needsTwoFactor = true;
          },
        },
      );

      if (signInError) {
        setError(signInError.message ?? "Couldn't log in — check your email and password.");
        return;
      }
      if (needsTwoFactor) {
        setPhase("twoFactor");
        return;
      }
      await completeLoginWithVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again shortly.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTwoFactorSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { error: verifyError } = await authClient.twoFactor.verifyTotp({
        code: twoFactorCode,
      });
      if (verifyError) {
        setError(verifyError.message ?? "That code didn't work — check your authenticator app.");
        return;
      }
      await completeLoginWithVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again shortly.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (phase === "recoveryReveal" && recoveryMnemonic) {
    return (
      <RecoveryKeyReveal
        mnemonic={recoveryMnemonic}
        onAcknowledged={() => {
          setPassword(""); // last point this is held anywhere — clear it now
          router.push("/");
        }}
      />
    );
  }

  if (phase === "twoFactor") {
    return (
      <main className="auth-page">
        <h1>Two-factor code</h1>
        <p>Enter the 6-digit code from your authenticator app.</p>
        <form onSubmit={handleTwoFactorSubmit} className="auth-form">
          <Input
            label="Code"
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Verify
          </Button>
        </form>
        <style jsx>{`
          .auth-page { max-width: 24rem; margin: 4rem auto; padding: 0 1.5rem; }
          h1 { font-family: var(--p-font-display); color: var(--p-porphyra-900); }
          p { color: var(--color-muted); }
          .auth-form { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem; }
          .auth-error { color: var(--color-danger-text); font-size: 0.9rem; margin: 0; }
        `}</style>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <h1>Log in</h1>
      <form onSubmit={handleCredentialsSubmit} className="auth-form">
        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          Log in
        </Button>
      </form>
      <p className="auth-switch">
        Don't have an account? <Link href="/signup">Sign up</Link>
      </p>

      <style jsx>{`
        .auth-page { max-width: 24rem; margin: 4rem auto; padding: 0 1.5rem; }
        h1 { font-family: var(--p-font-display); color: var(--p-porphyra-900); }
        .auth-form { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem; }
        .auth-error { color: var(--color-danger-text); font-size: 0.9rem; margin: 0; }
        .auth-switch { margin-top: 1.5rem; font-size: 0.9rem; color: var(--color-muted); }
      `}</style>
    </main>
  );
}
