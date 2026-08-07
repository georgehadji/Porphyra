// Maps @porphyra/core domain enums to Badge tones, so the pipeline table,
// job detail page and admin views render states/scores/legitimacy tiers
// consistently instead of each screen inventing its own color mapping.

import type { ApplicationStateId, LegitimacyTier, ScoreBand } from "@porphyra/core";
import type { BadgeProps } from "./components/Badge";

export const STATE_BADGE_TONE: Record<ApplicationStateId, NonNullable<BadgeProps["tone"]>> = {
  evaluated: "neutral",
  applied: "brand",
  responded: "brand",
  interview: "warning",
  offer: "success",
  hired: "success",
  rejected: "danger",
  discarded: "neutral",
  skip: "neutral",
};

export const SCORE_BAND_BADGE_TONE: Record<ScoreBand, NonNullable<BadgeProps["tone"]>> = {
  strong: "success",
  good: "brand",
  decent: "warning",
  weak: "danger",
};

export const LEGITIMACY_BADGE_TONE: Record<LegitimacyTier, NonNullable<BadgeProps["tone"]>> = {
  high_confidence: "success",
  proceed_with_caution: "warning",
  suspicious: "danger",
};
