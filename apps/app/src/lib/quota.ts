// Thin binding of @porphyra/db's quota functions to this app's cached `db`
// singleton — the actual logic lives in packages/db/src/quota.ts,
// parametrized by `Db`, so apps/worker can call the same functions against
// its own connection without importing anything Next.js-specific from here.

import * as dbQuota from "@porphyra/db";
import { db } from "@/lib/db";

export type QuotaStatus = dbQuota.QuotaStatus;

export function tryReserveEvaluationSlot(userId: string): Promise<QuotaStatus> {
  return dbQuota.tryReserveEvaluationSlot(db, userId);
}

export function recordEvaluationCost(userId: string, costUsd: number): Promise<void> {
  return dbQuota.recordEvaluationCost(db, userId, costUsd);
}

export function releaseEvaluationSlot(userId: string): Promise<void> {
  return dbQuota.releaseEvaluationSlot(db, userId);
}
