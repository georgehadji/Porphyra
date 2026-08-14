// Atomic free-tier evaluation quota — lives beside the schema it operates
// on rather than in apps/app's lib layer, specifically so apps/worker (the
// AI job consumer, see packages/ai/src/queue.ts) can call
// recordEvaluationCost/releaseEvaluationSlot without importing anything
// Next.js-specific from apps/app. Parametrized by `Db` rather than a
// singleton import — each caller (apps/app, apps/worker) owns its own
// cached connection (see their respective src/lib/db.ts /src/db.ts) and
// passes it in.

import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import { subscriptions, usageCounters } from "./schema";

/** Matches the pricing page's copy (apps/web/src/pages/pricing.astro). */
export const FREE_MONTHLY_EVALUATIONS = 5;

function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface QuotaStatus {
  allowed: boolean;
  used: number;
  limit: number | null; // null = unlimited
}

/**
 * Atomically reserves one evaluation slot against the free-tier monthly
 * quota. Replaces the old checkEvaluationQuota (read) + recordEvaluationUsage
 * (write) pair, which raced under concurrent requests from the same user:
 * two requests could both read "under quota" before either wrote its
 * increment, letting both through.
 *
 * This is a single `INSERT ... ON CONFLICT (user_id, period_start) DO UPDATE
 * ... WHERE evaluations_used < limit`, atomic because usage_counters'
 * UNIQUE(user_id, period_start) constraint (./schema.ts) lets Postgres
 * serialize concurrent writers to the same row — there's no window between
 * "check" and "write" for a race to live in.
 *
 * Call this BEFORE the AI call, not after — the point is to avoid spending
 * AI cost on a request that's already over quota. Pair with
 * `releaseEvaluationSlot` if the AI call then fails (a failed call must
 * never burn quota) or `recordEvaluationCost` once it succeeds.
 */
export async function tryReserveEvaluationSlot(db: Db, userId: string): Promise<QuotaStatus> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });
  if ((subscription?.tier ?? "free") === "pro") {
    return { allowed: true, used: 0, limit: null };
  }

  const periodStart = currentPeriodStart();
  const [row] = await db
    .insert(usageCounters)
    .values({ userId, periodStart, evaluationsUsed: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.periodStart],
      set: { evaluationsUsed: sql`${usageCounters.evaluationsUsed} + 1` },
      where: sql`${usageCounters.evaluationsUsed} < ${FREE_MONTHLY_EVALUATIONS}`,
    })
    .returning({ evaluationsUsed: usageCounters.evaluationsUsed });

  if (row) {
    return { allowed: true, used: row.evaluationsUsed, limit: FREE_MONTHLY_EVALUATIONS };
  }

  // The WHERE clause rejected the write — quota's already spent. A plain
  // read here is fine: quota is exhausted either way, this value is only
  // for the error message, not a security-relevant decision.
  const existing = await db.query.usageCounters.findFirst({
    where: and(eq(usageCounters.userId, userId), eq(usageCounters.periodStart, periodStart)),
  });
  return {
    allowed: false,
    used: existing?.evaluationsUsed ?? FREE_MONTHLY_EVALUATIONS,
    limit: FREE_MONTHLY_EVALUATIONS,
  };
}

/**
 * Attaches an evaluation's real cost to the slot `tryReserveEvaluationSlot`
 * already reserved. Call only after the AI call succeeds. Pro users are
 * never gated by `tryReserveEvaluationSlot` (it returns early without
 * writing a row for them) but still get cost tracked here — this is what
 * feeds the admin cost-by-user dashboard regardless of tier.
 */
export async function recordEvaluationCost(db: Db, userId: string, costUsd: number): Promise<void> {
  const periodStart = currentPeriodStart();
  await db
    .insert(usageCounters)
    .values({ userId, periodStart, evaluationsUsed: 0, aiCostUsd: costUsd.toFixed(4) })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.periodStart],
      set: { aiCostUsd: sql`${usageCounters.aiCostUsd} + ${costUsd}` },
    });
}

/**
 * Undoes a reservation made by `tryReserveEvaluationSlot` when the AI call
 * that followed it failed — a failed call must never burn the user's
 * quota. `GREATEST(..., 0)` guards against ever going negative if this
 * somehow ran twice for the same reservation.
 */
export async function releaseEvaluationSlot(db: Db, userId: string): Promise<void> {
  const periodStart = currentPeriodStart();
  await db
    .update(usageCounters)
    .set({ evaluationsUsed: sql`GREATEST(${usageCounters.evaluationsUsed} - 1, 0)` })
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.periodStart, periodStart)));
}
