import { describe, expect, it } from "vitest";
import {
  needsCultureWarning,
  scoreBand,
  scoreCulturalSignals,
} from "./scoring";

describe("scoreBand", () => {
  it.each([
    [4.5, "strong"],
    [4.7, "strong"],
    [4.0, "good"],
    [4.4, "good"],
    [3.5, "decent"],
    [3.9, "decent"],
    [3.4, "weak"],
    [1.0, "weak"],
  ] as const)("maps %s -> %s", (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });
});

describe("scoreCulturalSignals", () => {
  it("caps at 2 when any requirement is contradicted, even amid positives", () => {
    const result = scoreCulturalSignals(["positive", "positive", "contradicted"]);
    expect(result).toEqual({ score: 2, capped: true });
  });

  it("scores 4.5 when most requirements have positive evidence", () => {
    const result = scoreCulturalSignals(["positive", "positive", "absent"]);
    expect(result.score).toBe(4.5);
    expect(result.capped).toBe(false);
  });

  it("defaults absent-all to 3, uncapped, unless deprioritizeIfAbsent is set", () => {
    expect(scoreCulturalSignals(["absent", "absent"])).toEqual({ score: 3, capped: false });
    expect(
      scoreCulturalSignals(["absent", "absent"], { deprioritizeIfAbsent: true }),
    ).toEqual({ score: 2, capped: true });
  });

  it("returns a neutral 3 when no requirements are configured at all", () => {
    expect(scoreCulturalSignals([])).toEqual({ score: 3, capped: false });
  });
});

describe("needsCultureWarning", () => {
  it("flags a high global score paired with poor culture fit", () => {
    expect(needsCultureWarning(4.6, 2)).toBe(true);
    expect(needsCultureWarning(4.6, 3)).toBe(false);
    expect(needsCultureWarning(4.4, 1)).toBe(false);
  });
});
