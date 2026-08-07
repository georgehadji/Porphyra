import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Server-side session read for API routes and server components. Returns
 * `null` rather than throwing when unauthenticated — callers decide whether
 * that's a 401, a redirect, or an optional feature. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
