// Real client-side password-strength enforcement — the ONLY place it can
// meaningfully happen, since the server only ever sees a fixed-length
// derived verifier, never the real password (see auth.ts's comment on why
// minPasswordLength there is decorative).

const MIN_LENGTH = 12;

export function checkPasswordStrength(password: string): { ok: boolean; message?: string } {
  if (password.length < MIN_LENGTH) {
    return { ok: false, message: `Use at least ${MIN_LENGTH} characters.` };
  }
  // Length-focused rather than composition rules (uppercase/digit/symbol
  // requirements) — NIST SP 800-63B's current guidance, and this vault has
  // no server-side rate-limited guessing surface for the real password at
  // all (only the derived verifier ever reaches the server).
  const commonWeak = ["password", "12345678901", "qwertyuiop12", "letmein12345"];
  if (commonWeak.some((weak) => password.toLowerCase().includes(weak))) {
    return { ok: false, message: "That's too easy to guess — try something less predictable." };
  }
  return { ok: true };
}
