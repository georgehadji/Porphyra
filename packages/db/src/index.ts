import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

/**
 * Server-only. Never import this file from a browser bundle — it opens a
 * real Postgres connection from `DATABASE_URL`. App code should import a
 * cached singleton from apps/app/src/lib/db.ts, not call this directly per
 * request.
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
