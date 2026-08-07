"use client";

import { Button, Card } from "@porphyra/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

interface SubscriptionInfo {
  tier: "free" | "pro";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export default function BillingSettingsPage() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSubscription)
      .catch(() => setSubscription(null));
  }, []);

  async function handleUpgrade() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      if (!response.ok) throw new Error("Couldn't start checkout.");
      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setIsLoading(false);
    }
  }

  async function handleManage() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      if (!response.ok) throw new Error("Couldn't open billing portal.");
      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setIsLoading(false);
    }
  }

  const isPro = subscription?.tier === "pro";

  return (
    <main style={{ maxWidth: "28rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/">&larr; Back</Link>
      </p>
      <Card>
        <h1 style={{ fontFamily: "var(--p-font-display)", marginTop: 0 }}>Billing</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Current plan: <strong>{isPro ? "Pro" : "Free"}</strong>
          {subscription?.cancelAtPeriodEnd && " (cancels at period end)"}
        </p>
        {error && <p style={{ color: "var(--color-danger-text)" }}>{error}</p>}
        {isPro ? (
          <Button variant="secondary" onClick={handleManage} isLoading={isLoading}>
            Manage billing
          </Button>
        ) : (
          <Button variant="primary" onClick={handleUpgrade} isLoading={isLoading}>
            Upgrade to Pro
          </Button>
        )}
      </Card>
    </main>
  );
}
