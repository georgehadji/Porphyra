import { vaultItems } from "@porphyra/db";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Generic CRUD for encrypted content — CV, evaluation reports, cover
// letters, notes. The server only ever sees ciphertext + an opaque blind
// index; see packages/crypto for what produces both client-side.

const VAULT_ITEM_TYPES = [
  "cv",
  "report",
  "cover_letter",
  "interview_note",
  "contact",
  "jd",
  "provider_key",
] as const;

const createItemSchema = z.object({
  type: z.enum(VAULT_ITEM_TYPES),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  blindIndex: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const parsed = createItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid vault item.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [item] = await db
    .insert(vaultItems)
    .values({ userId: session.user.id, ...parsed.data })
    .returning({ id: vaultItems.id, createdAt: vaultItems.createdAt });

  return NextResponse.json(item, { status: 201 });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const typeParam = new URL(request.url).searchParams.get("type");
  const typeFilter = VAULT_ITEM_TYPES.find((t) => t === typeParam);
  if (typeParam && !typeFilter) {
    return NextResponse.json({ message: `Unknown type "${typeParam}".` }, { status: 400 });
  }

  const items = await db
    .select()
    .from(vaultItems)
    .where(
      typeFilter
        ? and(eq(vaultItems.userId, session.user.id), eq(vaultItems.type, typeFilter))
        : eq(vaultItems.userId, session.user.id),
    )
    .orderBy(desc(vaultItems.createdAt));

  return NextResponse.json(items);
}
