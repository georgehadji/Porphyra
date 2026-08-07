import { vaultItems } from "@porphyra/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const { id } = await params;
  const item = await db.query.vaultItems.findFirst({
    // Ownership check baked into the WHERE, not a separate step after
    // fetching — a row that exists but belongs to someone else returns the
    // same 404 as a row that doesn't exist at all, never a 403 that would
    // confirm the ID's existence to a user who shouldn't see it.
    where: and(eq(vaultItems.id, id), eq(vaultItems.userId, session.user.id)),
  });

  if (!item) return NextResponse.json({ message: "Not found." }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const { id } = await params;
  const deleted = await db
    .delete(vaultItems)
    .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, session.user.id)))
    .returning({ id: vaultItems.id });

  if (deleted.length === 0) return NextResponse.json({ message: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
