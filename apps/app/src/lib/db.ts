import { type Db, createDb } from "@porphyra/db";

// Cached across hot reloads in dev / warm container invocations in prod.
//
// Falls back to the same local-dev default as packages/db/drizzle.config.ts
// when DATABASE_URL is unset, rather than throwing. That's deliberate:
// `postgres()` (the driver createDb wraps) never opens a TCP connection at
// construction — only on the first query — so this stays side-effect-free
// even when Next.js imports every route/auth module during `next build` to
// collect exported HTTP methods (which is exactly what broke here once
// already — see git history on this file). A genuinely missing
// DATABASE_URL in production still fails loudly, just at the first real
// query instead of at import time, with an actual connection-refused error
// pointing at the fallback host — clear enough to diagnose.
const globalForDb = globalThis as unknown as { porphyraDb?: Db };

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://porphyra:porphyra@localhost:55432/porphyra";

export const db: Db = globalForDb.porphyraDb ?? createDb(DATABASE_URL);

if (process.env.NODE_ENV !== "production") {
  globalForDb.porphyraDb = db;
}
