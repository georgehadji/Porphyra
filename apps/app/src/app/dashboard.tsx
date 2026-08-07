"use client";

import { Button, Card } from "@porphyra/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { useVault } from "@/lib/vault/VaultContext";

interface DashboardProps {
  userName: string;
  userEmail: string;
}

export function Dashboard({ userName, userEmail }: DashboardProps) {
  const router = useRouter();
  const vault = useVault();

  async function handleSignOut() {
    vault.lock();
    await signOut();
    router.push("/login");
  }

  return (
    <main style={{ maxWidth: "32rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <Card>
        <p style={{ margin: 0, color: "var(--color-muted)" }}>Signed in as</p>
        <h1 style={{ fontFamily: "var(--p-font-display)", margin: "0.25rem 0 1rem" }}>
          {userName}
        </h1>
        <p style={{ color: "var(--color-muted)" }}>{userEmail}</p>

        <p style={{ marginTop: "1.5rem" }}>
          Vault: {vault.isUnlocked ? "🔓 unlocked in this tab" : "🔒 locked — log in again to unlock"}
        </p>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
          <Link href="/pipeline">
            <Button variant="primary">Pipeline</Button>
          </Link>
          <Link href="/evaluate">
            <Button variant="secondary">Evaluate a posting</Button>
          </Link>
          <Link href="/cv">
            <Button variant="secondary">Your CV</Button>
          </Link>
          <Link href="/settings/security">
            <Button variant="secondary">Security settings</Button>
          </Link>
          <Link href="/settings/billing">
            <Button variant="secondary">Billing</Button>
          </Link>
          <Button variant="ghost" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </Card>
    </main>
  );
}
