import { APPLICATION_STATES, isValidTransition } from "@porphyra/core";
import { applications } from "@porphyra/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const STATE_IDS = APPLICATION_STATES.map((s) => s.id) as [string, ...string[]];
const patchSchema = z.object({ state: z.enum(STATE_IDS) });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const { id } = await params;
  const application = await db.query.applications.findFirst({
    where: and(eq(applications.id, id), eq(applications.userId, session.user.id)),
  });
  if (!application) return NextResponse.json({ message: "Not found." }, { status: 404 });
  return NextResponse.json(application);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid status." }, { status: 400 });
  }

  const existing = await db.query.applications.findFirst({
    where: and(eq(applications.id, id), eq(applications.userId, session.user.id)),
  });
  if (!existing) return NextResponse.json({ message: "Not found." }, { status: 404 });

  const targetState = parsed.data.state as (typeof STATE_IDS)[number];
  if (!isValidTransition(existing.state, targetState as never)) {
    return NextResponse.json(
      { message: `Can't move from "${existing.state}" to "${targetState}".` },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(applications)
    .set({
      state: targetState as never,
      updatedAt: new Date(),
      appliedAt: targetState === "applied" && !existing.appliedAt ? new Date() : existing.appliedAt,
    })
    .where(eq(applications.id, id))
    .returning();

  return NextResponse.json(updated);
}
