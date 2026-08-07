// Adapted from santifer/jobber (MIT) — see /NOTICE.md.
// Source: modes/_shared.md § Posting Legitimacy (Block G)
//
// Assesses whether a posting is likely real and active. This is deliberately
// NOT folded into the 1-5 global score — it's a separate, qualitative signal
// so a well-matched posting that also looks like a ghost job doesn't get its
// concern diluted into a single number.

import { z } from "zod";

export const LEGITIMACY_TIERS = ["high_confidence", "proceed_with_caution", "suspicious"] as const;
export type LegitimacyTier = (typeof LEGITIMACY_TIERS)[number];

export const LEGITIMACY_LABELS: Record<LegitimacyTier, string> = {
  high_confidence: "High Confidence",
  proceed_with_caution: "Proceed with Caution",
  suspicious: "Suspicious",
};

export type SignalReliability = "high" | "medium" | "low";

export interface LegitimacySignal {
  id: string;
  label: string;
  reliability: SignalReliability;
  /** null = no data available for this signal on this posting. */
  value: "positive" | "negative" | null;
}

/** Canonical signal catalogue, weighted by reliability — matches the source
 * table. Callers populate `value` per-posting; scorePosting() below applies
 * the weights. */
export const LEGITIMACY_SIGNAL_CATALOGUE: Omit<LegitimacySignal, "value">[] = [
  { id: "posting_age", label: "Posting age", reliability: "high" },
  { id: "apply_button_active", label: "Apply button active", reliability: "high" },
  { id: "tech_specificity", label: "Tech specificity in the JD", reliability: "medium" },
  { id: "requirements_realism", label: "Requirements realism", reliability: "medium" },
  { id: "recent_layoff_news", label: "Recent layoff news", reliability: "medium" },
  { id: "reposting_pattern", label: "Reposting pattern", reliability: "medium" },
  { id: "salary_transparency", label: "Salary transparency", reliability: "low" },
  { id: "role_company_fit", label: "Role–company fit", reliability: "low" },
];

const RELIABILITY_WEIGHT: Record<SignalReliability, number> = { high: 3, medium: 2, low: 1 };

/**
 * Weighted legitimacy score in [-1, 1] from populated signals (signals with
 * `value: null` are excluded, not counted as neutral — absence of data isn't
 * evidence). Positive → high_confidence, near zero / mixed →
 * proceed_with_caution, negative → suspicious.
 */
export function scorePosting(signals: LegitimacySignal[]): {
  tier: LegitimacyTier;
  weightedScore: number;
} {
  const scored = signals.filter((s) => s.value !== null);
  if (scored.length === 0) return { tier: "proceed_with_caution", weightedScore: 0 };

  const totalWeight = scored.reduce((sum, s) => sum + RELIABILITY_WEIGHT[s.reliability], 0);
  const weightedSum = scored.reduce((sum, s) => {
    const sign = s.value === "positive" ? 1 : -1;
    return sum + sign * RELIABILITY_WEIGHT[s.reliability];
  }, 0);
  const weightedScore = weightedSum / totalWeight;

  let tier: LegitimacyTier;
  if (weightedScore >= 0.4) tier = "high_confidence";
  else if (weightedScore >= -0.2) tier = "proceed_with_caution";
  else tier = "suspicious";

  return { tier, weightedScore };
}

/** Mandatory framing rule from the source rubric: legitimacy signals are
 * presented as neutral information, never as accusations, and every UI that
 * renders them must surface a legitimate-explanation caveat alongside a
 * concerning signal. */
export const LEGITIMACY_FRAMING_NOTE =
  "These signals help you prioritize time on active openings — they are not " +
  "an accusation of dishonesty. Concerning signals often have legitimate " +
  "explanations (backfilled roles, evergreen pipelines, seasonal hiring).";

export const legitimacyTierSchema = z.enum(LEGITIMACY_TIERS);
