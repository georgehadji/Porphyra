import pino from "pino";

// Structured JSON to stdout — this is what makes infra/observability's
// Promtail scrape config actually useful; a plain console.error string
// gives Loki a blob to full-text-search, not fields to filter/alert on.
//
// IMPORTANT — the same rule as everywhere else request data flows through
// this codebase: never log a request body, a decrypted CV/JD/report, or
// any vault plaintext. Pino's default serializers don't do this for you;
// every call site is responsible for passing only structural fields
// (IDs, event names, error messages), the same discipline already
// documented on /api/evaluate's own route.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  // Pretty-printing in dev only — Promtail/Loki want raw JSON in prod, a
  // human wants columns and colors locally. pino-pretty is a devDependency
  // for exactly this reason.
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});
