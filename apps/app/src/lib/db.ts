import { type Db, createDb } from "@porphyra/db";

// Lazily initialized and cached across hot reloads in dev / warm
// container invocations in prod. Deliberately NOT a module-level
// `export const db = createDb(...)` — that runs at import time, and Next.js
// imports every route module during `next build` to collect its exported
// HTTP methods, which would open a real Postgres connection (and fail the
// build outright if DATABASE_URL isn't set, which it correctly isn't in a
// bare CI checkout) just from being imported, before any request ever
// happens. getDb() defers both the env read and the connection to the
// first actual call.
const globalForDb = globalThis as unknown as { porphyraDb?: Db };

export function getDb(): Db {
  if (globalForDb.porphyraDb) return globalForDb.porphyraDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — copy .env.example to .env and fill in a real connection string.",
    );
  }

  const instance = createDb(url);
  if (process.env.NODE_ENV !== "production") {
    globalForDb.porphyraDb = instance;
  }
  return instance;
}
