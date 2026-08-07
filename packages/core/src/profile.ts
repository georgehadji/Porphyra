// New to Porphyra — no upstream equivalent.
//
// The source project hardcoded one person's AI-engineering job archetypes
// (see the note atop scoring.ts). Porphyra serves job seekers in every
// field, so "what am I even targeting" has to be data the user or a segment
// site defines, not a fixed enum baked into the scorer.

import { z } from "zod";

export const targetProfileSchema = z.object({
  /** e.g. "Senior Product Designer", "ICU Registered Nurse", "Backend Engineer". */
  roleTitles: z.array(z.string().min(1)).min(1),
  /** Free-text signals the evaluator should weigh toward "north_star" fit —
   * keywords, responsibilities, team shape, seniority signals. Deliberately
   * unstructured: the range of fields this needs to cover (nursing shift
   * patterns vs. engineering tech stacks) doesn't fit one fixed schema. */
  signals: z.array(z.string().min(1)).default([]),
  seniority: z
    .enum(["entry", "mid", "senior", "staff_or_lead", "manager", "executive"])
    .optional(),
  remotePreference: z.enum(["remote_only", "remote_first", "hybrid_ok", "onsite_ok"]).optional(),
  /** ISO 3166-1 alpha-2 country codes, or "any". Feeds work-authorization
   * and timezone-overlap checks — never used to fabricate an authorization
   * claim the user hasn't confirmed. */
  eligibleCountries: z.array(z.string()).default(["any"]),
});
export type TargetProfile = z.infer<typeof targetProfileSchema>;

/** Structural culture-fit requirements a user or segment can configure —
 * feeds scoreCulturalSignals() in scoring.ts. */
export const cultureScreenSchema = z.object({
  require: z.array(z.string().min(1)).default([]),
  deprioritizeIfAbsent: z.boolean().default(false),
});
export type CultureScreen = z.infer<typeof cultureScreenSchema>;
