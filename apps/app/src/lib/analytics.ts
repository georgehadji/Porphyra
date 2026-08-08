import { events } from "@porphyra/db";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// Behavioural analytics only — see the plan's E2EE-vs-analytics resolution
// and events' own schema comment. `props` must NEVER contain vault
// content (CV text, JD text, report content, company/role names) — every
// call site below passes only structural facts (counts, IDs, state names),
// never anything that was ever inside an encrypt()/decrypt() call.
//
// Tracked server-side only, from routes that already have a confirmed
// session — deliberately not a generic client-facing /api/analytics/track
// endpoint. That would need its own auth/validation surface for
// comparatively low value; every event that matters for the funnel already
// happens inside an authenticated API route.

type EventName =
  | "vault_bootstrapped"
  | "evaluation_completed"
  | "evaluation_quota_exceeded"
  | "application_created"
  | "application_state_changed"
  | "checkout_started"
  | "subscription_upgraded";

export async function track(
  userId: string,
  name: EventName,
  props: Record<string, string | number | boolean> = {},
): Promise<void> {
  try {
    await db.insert(events).values({ userId, name, props });
  } catch (error) {
    // Analytics must never break the request it's attached to.
    logger.error({ event: name, err: error }, "analytics track() failed");
  }
}
