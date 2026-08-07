"use client";

import { deriveAuthVerifier } from "@porphyra/crypto";
import { Button, Input } from "@porphyra/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { signUp } from "@/lib/auth-client";
import { checkPasswordStrength } from "@/lib/vault/passwordStrength";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      setError(strength.message ?? "Choose a stronger password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      // The real password never leaves the browser — this is a derived
      // verifier, not the password itself. See packages/crypto/src/kdf.ts.
      const verifier = await deriveAuthVerifier(password, email);
      const { error: signUpError } = await signUp.email({ email, password: verifier, name });

      if (signUpError) {
        setError(signUpError.message ?? "Couldn't create your account — try again.");
        return;
      }

      // Vault bootstrap happens on first login, not here — see login/page.tsx's
      // comment for why (it sidesteps whether Better Auth issues a session
      // immediately or only after email verification, uniformly).
      setDone(true);
    } catch {
      setError("Something went wrong — try again shortly.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="auth-page">
        <h1>Check your email</h1>
        <p>
          We sent a verification link to <strong>{email}</strong>. Verify it, then{" "}
          <Link href="/login">log in</Link> to finish setting up your encrypted vault.
        </p>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <h1>Create your account</h1>
      <form onSubmit={handleSubmit} className="auth-form">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
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
          autoComplete="new-password"
          hint="At least 12 characters. This unlocks your encrypted vault — we never see it."
          required
        />
        <Input
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link href="/login">Log in</Link>
      </p>

      <style jsx>{`
        .auth-page {
          max-width: 24rem;
          margin: 4rem auto;
          padding: 0 1.5rem;
        }
        h1 {
          font-family: var(--p-font-display);
          color: var(--p-porphyra-900);
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-top: 1.5rem;
        }
        .auth-error {
          color: var(--color-danger-text);
          font-size: 0.9rem;
          margin: 0;
        }
        .auth-switch {
          margin-top: 1.5rem;
          font-size: 0.9rem;
          color: var(--color-muted);
        }
      `}</style>
    </main>
  );
}
