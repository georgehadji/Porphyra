// Adapted from santifer/jobber (MIT) — see /NOTICE.md.
// Source: modes/_shared.md § Scoring System
//
// Note on scope: the original rubric's archetype table (AI Platform/LLMOps,
// Agentic/Automation, etc.) was one person's specific job-search taxonomy —
// not portable to a product serving job seekers across every field. Porphyra
// replaces it with a per-user `targetProfile` (packages/core/src/profile.ts)
// that a user or a segment (designers, nurses, developers, ...) defines, and
// the dimension names/logic below stay domain-agnostic.

import { z } from "zod";

/** The six scored dimensions a report persists (matches DIMENSION_KEYS in
 * the source's lib/report-schema.mjs). `global` is NOT one of these — it's a
 * holistic judgment computed from all six, never a plain average (see
 * scoreBand and the culture-screen capping rule below for why arithmetic
 * alone is insufficient). */
export const DIMENSION_KEYS = [
  "cv_match",
  "north_star",
  "comp",
  "cultural",
  "red_flags",
  "growth",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  cv_match: "Profile match",
  north_star: "Target alignment",
  comp: "Compensation",
  cultural: "Cultural signals",
  red_flags: "Red flags",
  growth: "Growth trajectory",
};

export const dimensionScoreSchema = z.object({
  score: z.number().min(0).max(5),
  note: z.string().optional(),
});
export type DimensionScore = z.infer<typeof dimensionScoreSchema>;

export const dimensionsSchema = z.record(z.enum(DIMENSION_KEYS), dimensionScoreSchema);
export type Dimensions = z.infer<typeof dimensionsSchema>;

export type ScoreBand = "strong" | "good" | "decent" | "weak";

/**
 * Score interpretation bands (1–5 scale).
 *   4.5+       → strong match, recommend applying immediately
 *   4.0–4.4    → good match, worth applying
 *   3.5–3.9    → decent but not ideal, apply only for a specific reason
 *   below 3.5  → recommend against applying
 */
export function scoreBand(globalScore: number): ScoreBand {
  if (globalScore >= 4.5) return "strong";
  if (globalScore >= 4.0) return "good";
  if (globalScore >= 3.5) return "decent";
  return "weak";
}

export const SCORE_BAND_COPY: Record<ScoreBand, { label: string; recommendation: string }> = {
  strong: { label: "Strong match", recommendation: "Recommend applying immediately." },
  good: { label: "Good match", recommendation: "Worth applying." },
  decent: {
    label: "Decent match",
    recommendation: "Apply only if you have a specific reason to.",
  },
  weak: {
    label: "Below threshold",
    recommendation: "Recommend against applying — see the report for why.",
  },
};

/** Below this, the product's ethical-use stance is to actively discourage
 * applying, not merely to omit encouragement. */
export const DISCOURAGE_APPLY_THRESHOLD = 4.0;

export interface CultureScreenRequirement {
  id: string;
  label: string;
}

export type CultureScreenEvidence = "positive" | "contradicted" | "absent";

/**
 * Cultural-signals scoring, ported verbatim from the source rubric:
 *
 * 1. If most requirements have positive evidence → 4–5.
 * 2. If some have positive evidence and none are contradicted → 3.
 * 3. If evidence CONTRADICTS a requirement → cap at 2, and the caller MUST
 *    surface an explicit warning — a strong overall score must never quietly
 *    absorb a bad culture fit.
 * 4. If no evidence exists for any requirement → 3 by default, unless the
 *    caller opts into `deprioritizeIfAbsent`, in which case cap at 2.
 * 5. A role scoring 4.5+ overall but ≤2 on cultural signals must carry the
 *    explicit warning below, regardless of how it got there.
 */
export function scoreCulturalSignals(
  evidence: CultureScreenEvidence[],
  options: { deprioritizeIfAbsent?: boolean } = {},
): { score: number; capped: boolean } {
  if (evidence.length === 0) {
    return { score: 3, capped: false }; // no requirements configured — neutral
  }
  const contradicted = evidence.some((e) => e === "contradicted");
  if (contradicted) return { score: 2, capped: true };

  const positive = evidence.filter((e) => e === "positive").length;
  const allAbsent = evidence.every((e) => e === "absent");
  if (allAbsent) {
    return options.deprioritizeIfAbsent ? { score: 2, capped: true } : { score: 3, capped: false };
  }
  if (positive > evidence.length / 2) return { score: 4.5, capped: false };
  if (positive > 0) return { score: 3, capped: false };
  return { score: 3, capped: false };
}

export const HIGH_SCORE_LOW_CULTURE_WARNING =
  "High technical fit, unconfirmed or poor culture fit — verify before applying.";

/** True when a report needs the mandatory high-score/low-culture warning. */
export function needsCultureWarning(globalScore: number, culturalScore: number): boolean {
  return globalScore >= 4.5 && culturalScore <= 2;
}
