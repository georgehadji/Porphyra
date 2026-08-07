"use client";

import {
  APPLICATION_STATES,
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  LEGITIMACY_LABELS,
  STATE_TRANSITIONS,
  type ApplicationStateId,
  type EvaluationReport,
  scoreBand,
  stateLabel,
} from "@porphyra/core";
import {
  Badge,
  Button,
  Card,
  LEGITIMACY_BADGE_TONE,
  SCORE_BAND_BADGE_TONE,
  STATE_BADGE_TONE,
} from "@porphyra/ui";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useVault } from "@/lib/vault/VaultContext";

interface ApplicationDetail {
  id: string;
  state: ApplicationStateId;
  score: string | null;
  legitimacyTier: string | null;
  reportItemId: string | null;
  companyCiphertext: string;
  companyIv: string;
  roleCiphertext: string;
  roleIv: string;
}

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const vault = useVault();
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (!vault.isUnlocked) return;
    (async () => {
      try {
        const response = await fetch(`/api/applications/${id}`);
        if (!response.ok) throw new Error("Not found.");
        const app: ApplicationDetail = await response.json();
        setApplication(app);
        setCompany(await vault.decrypt({ ciphertext: app.companyCiphertext, iv: app.companyIv }));
        setRole(await vault.decrypt({ ciphertext: app.roleCiphertext, iv: app.roleIv }));

        if (app.reportItemId) {
          const itemResponse = await fetch(`/api/vault/items/${app.reportItemId}`);
          if (itemResponse.ok) {
            const item = await itemResponse.json();
            const reportJson = await vault.decrypt({ ciphertext: item.ciphertext, iv: item.iv });
            setReport(JSON.parse(reportJson));
          }
        }
      } catch {
        setError("Couldn't load this application.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.isUnlocked, id]);

  async function handleTransition(target: ApplicationStateId) {
    setIsTransitioning(true);
    setError(null);
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: target }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "Couldn't update status.");
      }
      const updated = await response.json();
      setApplication(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update status.");
    } finally {
      setIsTransitioning(false);
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

  if (error && !application) {
    return (
      <main style={{ maxWidth: "40rem", margin: "4rem auto", padding: "0 1.5rem" }}>
        <p style={{ color: "var(--color-danger-text)" }}>{error}</p>
      </main>
    );
  }

  if (!application) {
    return (
      <main style={{ maxWidth: "40rem", margin: "4rem auto", padding: "0 1.5rem" }}>
        <p style={{ color: "var(--color-muted)" }}>Loading...</p>
      </main>
    );
  }

  const nextStates = STATE_TRANSITIONS[application.state];
  const band = application.score ? scoreBand(Number(application.score)) : null;

  return (
    <main style={{ maxWidth: "40rem", margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/pipeline">&larr; Back to pipeline</Link>
      </p>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontFamily: "var(--p-font-display)", margin: 0 }}>{role}</h1>
            <p style={{ color: "var(--color-muted)", margin: "0.25rem 0 0" }}>{company}</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {band && (
              <Badge tone={SCORE_BAND_BADGE_TONE[band]}>{Number(application.score).toFixed(1)}/5</Badge>
            )}
            <Badge tone={STATE_BADGE_TONE[application.state]}>{stateLabel(application.state)}</Badge>
          </div>
        </div>

        {application.legitimacyTier && (
          <p style={{ marginTop: "1rem" }}>
            Posting legitimacy:{" "}
            <Badge tone={LEGITIMACY_BADGE_TONE[application.legitimacyTier as keyof typeof LEGITIMACY_BADGE_TONE]}>
              {LEGITIMACY_LABELS[application.legitimacyTier as keyof typeof LEGITIMACY_LABELS]}
            </Badge>
          </p>
        )}

        {nextStates.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
            {nextStates.map((target) => (
              <Button
                key={target}
                variant="secondary"
                onClick={() => handleTransition(target)}
                disabled={isTransitioning}
              >
                Mark as {APPLICATION_STATES.find((s) => s.id === target)?.label}
              </Button>
            ))}
          </div>
        )}
        {error && <p style={{ color: "var(--color-danger-text)", marginTop: "0.75rem" }}>{error}</p>}
      </Card>

      {report && (
        <Card style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontFamily: "var(--p-font-display)", marginTop: 0 }}>Evaluation report</h2>

          <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1.5rem" }}>
            {DIMENSION_KEYS.map((key) => {
              const dim = report.dimensions[key];
              if (!dim) return null;
              return (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <span>{DIMENSION_LABELS[key]}</span>
                  <span style={{ fontWeight: 600 }}>{dim.score.toFixed(1)}/5</span>
                </div>
              );
            })}
          </div>

          {report.topStrengths.length > 0 && (
            <>
              <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Top strengths</p>
              <ul>
                {report.topStrengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {report.softGaps.length > 0 && (
            <>
              <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Gaps</p>
              <ul>
                {report.softGaps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {report.hardStops.length > 0 && (
            <>
              <p style={{ fontWeight: 600, marginBottom: "0.25rem", color: "var(--color-danger-text)" }}>
                Hard stops
              </p>
              <ul>
                {report.hardStops.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {report.nextAction && (
            <p style={{ marginTop: "1rem", fontStyle: "italic", color: "var(--color-muted)" }}>
              {report.nextAction}
            </p>
          )}
        </Card>
      )}
    </main>
  );
}
