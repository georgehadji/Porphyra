import { subscriptions, usageCounters } from "@porphyra/db";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";

/** Provisional — matches the pricing page's copy (apps/web/src/pages/pricing.astro).
 * No real billing decision has been finalized (that's Phase 4); this is the
 * enforcement point to update once it is. */
const FREE_MONTHLY_EVALUATIONS = 5;

function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface QuotaStatus {
  allowed: boolean;
  used: number;
  limit: number | null; // null = unlimited
}

export async function checkEvaluationQuota(userId: string): Promise<QuotaStatus> {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });
  const tier = subscription?.tier ?? "free";

  if (tier === "pro") {
    return { allowed: true, used: 0, limit: null };
  }

  const periodStart = currentPeriodStart();
  const counter = await db.query.usageCounters.findFirst({
    where: and(eq(usageCounters.userId, userId), eq(usageCounters.periodStart, periodStart)),
  });
  const used = counter?.evaluationsUsed ?? 0;

  return { allowed: used < FREE_MONTHLY_EVALUATIONS, used, limit: FREE_MONTHLY_EVALUATIONS };
}

/** Called only after a successful evaluation — a failed AI call shouldn't
 * burn the user's quota. */
export async function recordEvaluationUsage(userId: string, costUsd: number): Promise<void> {
  const periodStart = currentPeriodStart();
  const existing = await db.query.usageCounters.findFirst({
    where: and(eq(usageCounters.userId, userId), eq(usageCounters.periodStart, periodStart)),
  });

  if (existing) {
    await db
      .update(usageCounters)
      .set({
        evaluationsUsed: existing.evaluationsUsed + 1,
        aiCostUsd: (Number(existing.aiCostUsd) + costUsd).toFixed(4),
      })
      .where(eq(usageCounters.id, existing.id));
  } else {
    await db.insert(usageCounters).values({
      userId,
      periodStart,
      evaluationsUsed: 1,
      aiCostUsd: costUsd.toFixed(4),
    });
  }
}
