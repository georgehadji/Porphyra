import { aiJobs, events, subscriptions, user } from "@porphyra/db";
import { count, countDistinct, desc, eq, inArray, sum } from "drizzle-orm";
import { db } from "@/lib/db";

// Shared by the /api/admin/analytics route (for anything that wants JSON —
// future automation, a status check) and the /admin/analytics server
// component directly (no reason to round-trip through its own API from the
// same server). Every query here reads structural facts (event names,
// counts, costs) — never vault content, which this table structurally
// cannot contain (see events' schema comment and lib/analytics.ts).

const FUNNEL_EVENTS = [
  "vault_bootstrapped",
  "application_created",
  "checkout_started",
  "subscription_upgraded",
] as const;

export interface AnalyticsSummary {
  totalUsers: number;
  proSubscribers: number;
  funnel: Record<(typeof FUNNEL_EVENTS)[number], number>;
  adoption: { name: string; occurrences: number; users: number }[];
  costByUser: { userId: string; email: string; totalCostUsd: string | null; evaluations: number }[];
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const [totalUsersRow] = await db.select({ n: count() }).from(user);
  const [proSubscribersRow] = await db
    .select({ n: count() })
    .from(subscriptions)
    .where(eq(subscriptions.tier, "pro"));

  // inArray(), not a raw `sql`ANY(${array})`` template — the latter
  // compiles to `= ANY(($1, $2, ...))`, which Postgres parses as a row
  // constructor, not an array, and rejects (`op ANY/ALL (array) requires
  // array on right side`). Caught offline via .toSQL() before this ever
  // touched a live database — see packages/db's git history for the
  // one-off script that surfaced it.
  const funnelRows = await db
    .select({ name: events.name, users: countDistinct(events.userId) })
    .from(events)
    .where(inArray(events.name, [...FUNNEL_EVENTS]))
    .groupBy(events.name);
  const funnel = Object.fromEntries(FUNNEL_EVENTS.map((name) => [name, 0])) as AnalyticsSummary["funnel"];
  for (const row of funnelRows) {
    if ((FUNNEL_EVENTS as readonly string[]).includes(row.name)) {
      funnel[row.name as (typeof FUNNEL_EVENTS)[number]] = row.users;
    }
  }

  const adoption = await db
    .select({ name: events.name, occurrences: count(), users: countDistinct(events.userId) })
    .from(events)
    .groupBy(events.name)
    .orderBy(desc(count()));

  const costByUser = await db
    .select({
      userId: aiJobs.userId,
      email: user.email,
      totalCostUsd: sum(aiJobs.costUsd),
      evaluations: count(),
    })
    .from(aiJobs)
    .innerJoin(user, eq(user.id, aiJobs.userId))
    .where(eq(aiJobs.status, "completed"))
    .groupBy(aiJobs.userId, user.email)
    .orderBy(desc(sum(aiJobs.costUsd)))
    .limit(20);

  return {
    totalUsers: totalUsersRow?.n ?? 0,
    proSubscribers: proSubscribersRow?.n ?? 0,
    funnel,
    adoption,
    costByUser,
  };
}
