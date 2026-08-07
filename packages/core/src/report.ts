// Adapted from santifer/jobber (MIT) — see /NOTICE.md.
// Source: lib/report-schema.mjs, lib/score-summary.mjs
//
// The source parsed a `## Machine Summary` YAML fence out of a markdown
// report with a regex, because the CLI's evaluator output IS a markdown
// file. Porphyra's evaluator returns structured JSON directly (see
// packages/ai), so this is the same contract expressed as a Zod schema
// instead of a fence-and-regex parser — the validation rules are preserved.

import { z } from "zod";
import { dimensionsSchema } from "./scoring";
import { legitimacyTierSchema } from "./legitimacy";

export const evaluationReportSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  /** Global 0-5 score — a holistic judgment, not an arithmetic mean of
   * `dimensions` (see scoring.ts). */
  score: z.number().min(0).max(5),
  legitimacyTier: legitimacyTierSchema,
  dimensions: dimensionsSchema,
  hardStops: z.array(z.string()).default([]),
  softGaps: z.array(z.string()).default([]),
  topStrengths: z.array(z.string()).default([]),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  nextAction: z.string().optional(),
  /** Never auto-filled — the user confirms this explicitly; a missing value
   * must never be silently treated as "eligible". */
  workAuthConfirmed: z.boolean().optional(),
  discardReasons: z.array(z.string()).default([]),
  /** Present when the application came through an agency/recruiter. */
  via: z.string().optional(),
  companyConfidential: z.boolean().default(false),
  advertisedComp: z.string().optional(),
  riskSummary: z.string().optional(),
  /** Set when the JD or scan flags a genuinely different requisition at the
   * same company under a near-identical title — disambiguates dedup. */
  requisitionId: z.string().optional(),
});
export type EvaluationReport = z.infer<typeof evaluationReportSchema>;

/** Validation problems as human-readable strings — mirrors the tolerant
 * contract of the source's validateReportSummary (never throws; callers
 * decide how to surface an empty-vs-non-empty problem list). */
export function validateEvaluationReport(candidate: unknown): string[] {
  const result = evaluationReportSchema.safeParse(candidate);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}
