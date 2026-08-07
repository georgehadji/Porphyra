// Adapted from santifer/jobber (MIT) — see /NOTICE.md.
// Source: modes/oferta.md (the interactive evaluation mode prompt)
//
// SCAFFOLD — the interface contract is locked here in Phase 0 so the queue
// worker (Phase 3) and the consented-AI vault flow (Phase 2, see the plan's
// Encryption design § Consented AI path) can be built against a stable
// shape. The full A–F + G evaluation prompt itself is ported and tuned in
// Phase 3, where it can be evaluated against real reports.

import type { TargetProfile } from "@porphyra/core";

export interface EvaluateInput {
  /** Decrypted client-side, sent for this one request only — see the vault
   * item lifecycle in the plan's Encryption design section. Never persisted
   * server-side as plaintext. */
  cvPlaintext: string;
  jdPlaintext: string;
  jdUrl?: string;
  targetProfile: TargetProfile;
}

/** Structured-output request: the model must return JSON matching
 * `evaluationReportSchema` from @porphyra/core, not free-form markdown —
 * unlike the source CLI, there is no terminal to render prose into. */
export function buildEvaluatePrompt(_input: EvaluateInput): string {
  throw new Error(
    "buildEvaluatePrompt is a Phase 3 stub — port modes/oferta.md's A–F + G " +
      "structure here, targeting evaluationReportSchema as strict JSON output.",
  );
}
