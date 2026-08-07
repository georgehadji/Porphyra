import { scoreBand, SCORE_BAND_COPY } from "@porphyra/core";
import { Badge, Button, Card } from "@porphyra/ui";

// Placeholder home — proves the app can import @porphyra/core (domain
// logic) and @porphyra/ui (component library) end to end. Real routes
// (/onboarding, /, /jobs, /pipeline, ...) land in Phase 2/3 per the plan's
// Content plan.
export default function Home() {
  const sampleScore = 4.6;
  const band = scoreBand(sampleScore);

  return (
    <main style={{ maxWidth: 480, margin: "6rem auto", padding: "0 1.5rem" }}>
      <Card>
        <p style={{ margin: 0, color: "var(--color-muted)" }}>Foundation smoke test</p>
        <h1 style={{ fontFamily: "var(--p-font-display)", margin: "0.5rem 0" }}>
          Porphyra app shell
        </h1>
        <p>
          Sample score {sampleScore.toFixed(1)}/5 →{" "}
          <Badge tone={band === "strong" ? "success" : "brand"}>
            {SCORE_BAND_COPY[band].label}
          </Badge>
        </p>
        <Button variant="primary">Continue to onboarding</Button>
      </Card>
    </main>
  );
}
