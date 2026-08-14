import { createDb, type Db } from "@porphyra/db";

// A single long-lived process, unlike apps/app's Next.js routes (which get
// re-imported per hot reload / per serverless invocation and need the
// globalThis-caching dance in apps/app/src/lib/db.ts) — one connection
// pool for the lifetime of this worker is exactly what's wanted here, no
// extra caching layer needed.
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://porphyra:porphyra@localhost:55432/porphyra";

export const db: Db = createDb(DATABASE_URL);
