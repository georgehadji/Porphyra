// Adapted from santifer/jobber (MIT) — see /NOTICE.md.
// Source: templates/states.yml
//
// Canonical application lifecycle states + their legal forward transitions.
// This is the single source of truth for both the API (which validates every
// status write against `transitions`) and the UI (which uses it to grey out
// invalid actions instead of letting a user reach an invalid state).

export const APPLICATION_STATES = [
  {
    id: "evaluated",
    label: "Evaluated",
    description: "Offer evaluated with a report, pending decision",
    group: "evaluated",
  },
  {
    id: "applied",
    label: "Applied",
    description: "Application submitted",
    group: "applied",
  },
  {
    id: "responded",
    label: "Responded",
    description: "Company has responded (not yet interview)",
    group: "responded",
  },
  {
    id: "interview",
    label: "Interview",
    description: "Active interview process",
    group: "interview",
  },
  {
    id: "offer",
    label: "Offer",
    description: "Offer received",
    group: "offer",
  },
  {
    id: "rejected",
    label: "Rejected",
    description: "Rejected by the company",
    group: "rejected",
  },
  {
    id: "discarded",
    label: "Discarded",
    description: "Discarded by the candidate, or the posting closed",
    group: "discarded",
  },
  {
    id: "skip",
    label: "Skip",
    description: "Doesn't fit — don't apply",
    group: "skip",
  },
  {
    id: "hired",
    label: "Hired",
    description: "Offer accepted — job landed",
    group: "hired",
  },
] as const;

export type ApplicationStateId = (typeof APPLICATION_STATES)[number]["id"];

/**
 * Legal forward transitions, keyed by source state → allowed target states.
 *
 * The lifecycle is a DAG: evaluated → applied → responded → interview →
 * offer → hired, with any live state able to fail (rejected/discarded) or be
 * shelved (skip). A state with an EMPTY list is TERMINAL — the write path
 * must refuse any change out of it without an explicit, audited override.
 * Live states allow backward moves too (e.g. applied → evaluated is a
 * correction, not a new event) so those are not gated here.
 */
export const STATE_TRANSITIONS: Record<ApplicationStateId, ApplicationStateId[]> = {
  evaluated: ["applied", "responded", "rejected", "discarded", "skip"],
  applied: ["responded", "interview", "rejected", "discarded", "skip"],
  responded: ["interview", "rejected", "discarded", "skip"],
  interview: ["offer", "rejected", "discarded", "hired"],
  offer: ["hired", "rejected", "discarded"],
  rejected: [],
  discarded: [],
  skip: ["evaluated", "discarded"],
  hired: [],
};

export const TERMINAL_STATES: ReadonlySet<ApplicationStateId> = new Set(
  (Object.entries(STATE_TRANSITIONS) as [ApplicationStateId, ApplicationStateId[]][])
    .filter(([, targets]) => targets.length === 0)
    .map(([id]) => id),
);

export function isValidTransition(
  from: ApplicationStateId,
  to: ApplicationStateId,
): boolean {
  if (from === to) return true;
  return STATE_TRANSITIONS[from].includes(to);
}

export function stateLabel(id: ApplicationStateId): string {
  const state = APPLICATION_STATES.find((s) => s.id === id);
  if (!state) throw new Error(`Unknown application state: ${id}`);
  return state.label;
}
