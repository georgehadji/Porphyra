import { events } from "@porphyra/db";
import { db } from "./db";
import { logger } from "./logger";

// Deliberately duplicated from apps/app/src/lib/analytics.ts rather than
// imported — that file lives under a Next.js app's src/lib, which isn't a
// shared workspace package, and extracting one ~10-line function into its
// own package for two call sites isn't worth the indirection yet (YAGNI;
// revisit if a third consumer of `track()` shows up). Same invariant as
// the original: `props` must never contain vault content — every call
// site here passes only structural facts.

type EventName = "evaluation_completed" | "evaluation_failed";

export async function track(
  userId: string,
  name: EventName,
  props: Record<string, string | number | boolean> = {},
): Promise<void> {
  try {
    await db.insert(events).values({ userId, name, props });
  } catch (error) {
    logger.error({ event: name, err: error }, "analytics track() failed");
  }
}
