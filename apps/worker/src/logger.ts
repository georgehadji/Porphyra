import pino from "pino";

// Mirrors apps/app/src/lib/logger.ts's own rule: structured JSON to stdout
// for Promtail/Loki (infra/docker-compose.observability.yml), never a
// request body, decrypted CV/JD/report, or any other vault plaintext — the
// job payload this worker processes carries exactly that plaintext (see
// packages/ai/src/queue.ts's EvaluateJobPayload), so every log call site
// below passes only structural fields (job/user IDs, token counts,
// status), never the payload itself.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  // Conditionally spread rather than a ternary-to-undefined — under
  // exactOptionalPropertyTypes (tsconfig.base.json), pino's LoggerOptions
  // rejects `transport: undefined` explicitly; omitting the key entirely
  // in production satisfies it the same way apps/app's own logger.ts
  // avoids the issue by relying on its (looser) Next.js tsconfig.
  ...(process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});
