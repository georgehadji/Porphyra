import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";

// Social providers are opt-in per-deployment: only registered when both env
// vars for a given provider are set, so an incomplete .env doesn't crash
// auth.ts at import time (which — see db.ts's comment — Next.js touches
// during `next build`'s route collection, not just at request time).
const socialProviders: NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]> = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  appName: "Porphyra",
  database: drizzleAdapter(db, { provider: "pg" }),
  // Falls back to an obviously-fake dev secret rather than leaving this
  // undefined — same build-time-import reasoning as db.ts. Production
  // deploys MUST set a real BETTER_AUTH_SECRET (32+ random bytes); nothing
  // here enforces that at runtime yet — add a startup assertion for
  // NODE_ENV === "production" before Phase 6 hardening ships.
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-insecure-secret-do-not-use-in-production",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: [process.env.MARKETING_URL ?? "http://localhost:4321"],

  // IMPORTANT — read before touching this: the value Better Auth calls
  // "the password" here is NEVER the user's real password. The client (see
  // packages/crypto/src/kdf.ts's deriveAuthVerifier) derives it from the
  // password via Argon2id, salted deterministically from the email (so the
  // client can compute it before authenticating, with no pre-login lookup
  // round trip — see that function's comment for why), so this server
  // never sees, stores, or could ever reconstruct the value that unlocks
  // the user's vault (the Master Key uses a DIFFERENT, randomly-generated
  // salt — see MASTER_KEY_PARAMS). Better Auth then hashes THIS derived
  // verifier again with its own algorithm before storing it. This comment
  // exists so nobody "simplifies" this into taking a plain password.
  //
  // minPasswordLength is effectively decorative here — the verifier Better
  // Auth actually receives is always a fixed-length base64 string
  // (32 raw bytes), never the user's real password, so this can't enforce
  // real password strength. That enforcement has to happen client-side,
  // on the real password, before it's ever derived — see the signup form
  // (apps/app/src/app/signup/page.tsx) for where that check lives.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Porphyra password",
        text:
          `Reset your password: ${url}\n\n` +
          "If you didn't request this, ignore this email — your account is safe. " +
          "Note: resetting your password does NOT recover your vault if you've also " +
          "lost your recovery key — see porphyra.example/security for why.",
      });
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your Porphyra email",
        text: `Verify your email to finish creating your account: ${url}`,
      });
    },
  },

  socialProviders,

  // twoFactor MUST come before nextCookies — nextCookies has to be last so
  // it sees every other plugin's Set-Cookie headers (Better Auth's own
  // documented ordering requirement).
  plugins: [twoFactor({ issuer: "Porphyra" }), nextCookies()],

  // Built-in rate limiting — separate from, and in addition to, the
  // per-route limiter in src/lib/rateLimit.ts (that one covers unauthenticated
  // routes like /api/waitlist; this covers the auth surface itself).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },

  advanced: {
    // Every cookie Better Auth sets carries these regardless of route —
    // belt-and-suspenders with the Caddy-level headers in infra/caddy/Caddyfile.
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

export type Session = typeof auth.$Infer.Session;
