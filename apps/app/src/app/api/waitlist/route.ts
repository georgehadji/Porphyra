import { waitlistEntries } from "@porphyra/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";

// POSTed to cross-origin from apps/web's static WaitlistForm — see that
// component's comment for why the marketing site can't handle this itself.

const RATE_LIMIT = 5; // requests
const RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes, per IP

const waitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  consent: z.literal(true),
  // Honeypot: a real submitter never sees or fills this field (see
  // WaitlistForm.astro's `.hp` CSS). A non-empty value means a bot filled
  // every field blindly — reject with the SAME shape as a normal 429/200 so
  // the bot can't distinguish "caught" from "rate limited" or "accepted".
  company_website: z.string().max(0).optional().or(z.literal("")),
});

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = process.env.MARKETING_URL ?? "http://localhost:4321";
  // Echo the origin back ONLY when it's the configured marketing site —
  // omitting the header for anything else (rather than always sending
  // `allowed`, which would make the check a no-op) is what actually causes
  // the browser to block a cross-origin read from an unexpected origin.
  if (origin !== allowed) return { "Access-Control-Allow-Methods": "POST, OPTIONS" };
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  const ip = clientIpFrom(request.headers);

  const { allowed } = checkRateLimit(`waitlist:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { message: "Too many attempts — try again in a few minutes." },
      { status: 429, headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400, headers });
  }

  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const message =
      firstIssue?.path[0] === "consent"
        ? "Please check the consent box to join the waitlist."
        : (firstIssue?.message ?? "Invalid submission.");
    return NextResponse.json({ message }, { status: 400, headers });
  }
  if (parsed.data.company_website) {
    // Silently succeed for the bot's benefit, but never write the row.
    return NextResponse.json({ ok: true }, { status: 200, headers });
  }

  try {
    await db
      .insert(waitlistEntries)
      .values({
        email: parsed.data.email,
        consentedAt: new Date(),
        source: request.headers.get("referer") ?? undefined,
      })
      .onConflictDoNothing(); // already on the list — treat as success, not an error
  } catch (error) {
    console.error("waitlist insert failed", error);
    return NextResponse.json(
      { message: "Something went wrong — try again shortly." },
      { status: 500, headers },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200, headers });
}
