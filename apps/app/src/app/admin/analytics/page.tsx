import { Card } from "@porphyra/ui";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/admin";
import { getAnalyticsSummary } from "@/lib/adminAnalytics";

const FUNNEL_LABELS: Record<string, string> = {
  vault_bootstrapped: "Activated (vault set up)",
  application_created: "Evaluated a posting",
  checkout_started: "Started checkout",
  subscription_upgraded: "Upgraded to Pro",
};

export default async function AdminAnalyticsPage() {
  const session = await requireAdminSession();
  // 404, not a "not authorized" page — same reasoning as the ownership
  // checks in the vault/applications API routes: don't confirm to a
  // non-admin that this route even exists.
  if (!session) notFound();

  const summary = await getAnalyticsSummary();
  const funnelStages = Object.entries(summary.funnel);

  return (
    <main style={{ maxWidth: "56rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ fontFamily: "var(--p-font-display)" }}>Analytics</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <Card>
          <p style={{ margin: 0, color: "var(--color-muted)" }}>Total users</p>
          <p style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>{summary.totalUsers}</p>
        </Card>
        <Card>
          <p style={{ margin: 0, color: "var(--color-muted)" }}>Pro subscribers</p>
          <p style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>{summary.proSubscribers}</p>
        </Card>
      </div>

      <Card style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontFamily: "var(--p-font-display)", marginTop: 0 }}>Activation funnel</h2>
        <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
          Distinct users who reached each stage — not necessarily sequential per user, but a
          rough read on where the drop-off is.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {funnelStages.map(([name, userCount]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{FUNNEL_LABELS[name] ?? name}</span>
              <strong>{userCount}</strong>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontFamily: "var(--p-font-display)", marginTop: 0 }}>Feature adoption</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
              <th>Event</th>
              <th>Occurrences</th>
              <th>Unique users</th>
            </tr>
          </thead>
          <tbody>
            {summary.adoption.map((row) => (
              <tr key={row.name} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.4rem 0" }}>{row.name}</td>
                <td>{row.occurrences}</td>
                <td>{row.users}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 style={{ fontFamily: "var(--p-font-display)", marginTop: 0 }}>AI cost by user (top 20)</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
              <th>User</th>
              <th>Evaluations</th>
              <th>Total cost (USD)</th>
            </tr>
          </thead>
          <tbody>
            {summary.costByUser.map((row) => (
              <tr key={row.userId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.4rem 0" }}>{row.email}</td>
                <td>{row.evaluations}</td>
                <td>${Number(row.totalCostUsd ?? 0).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
