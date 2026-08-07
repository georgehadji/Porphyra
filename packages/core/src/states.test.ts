import { describe, expect, it } from "vitest";
import { isValidTransition, STATE_TRANSITIONS, TERMINAL_STATES } from "./states";

describe("isValidTransition", () => {
  it("allows a legal forward move", () => {
    expect(isValidTransition("evaluated", "applied")).toBe(true);
  });

  it("rejects an illegal move (rejected -> interview)", () => {
    expect(isValidTransition("rejected", "interview")).toBe(false);
  });

  it("allows a same-state no-op", () => {
    expect(isValidTransition("applied", "applied")).toBe(true);
  });

  it("treats rejected, discarded and hired as terminal", () => {
    expect(TERMINAL_STATES.has("rejected")).toBe(true);
    expect(TERMINAL_STATES.has("discarded")).toBe(true);
    expect(TERMINAL_STATES.has("hired")).toBe(true);
    expect(TERMINAL_STATES.has("applied")).toBe(false);
  });

  it("every state referenced in transitions is a defined state", () => {
    const ids = Object.keys(STATE_TRANSITIONS);
    for (const [, targets] of Object.entries(STATE_TRANSITIONS)) {
      for (const t of targets) {
        expect(ids).toContain(t);
      }
    }
  });
});
