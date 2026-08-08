import { admins } from "@porphyra/db";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

/** Returns the session if the current user is an admin, null otherwise —
 * a single check that covers both "signed in" and "authorized" so every
 * /api/admin/* route needs exactly one guard clause. */
export async function requireAdminSession() {
  const session = await getSession();
  if (!session) return null;

  const row = await db.query.admins.findFirst({ where: eq(admins.userId, session.user.id) });
  return row ? session : null;
}
