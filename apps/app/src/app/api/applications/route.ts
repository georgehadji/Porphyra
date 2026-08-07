import { applications } from "@porphyra/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const createApplicationSchema = z.object({
  companyBlindIndex: z.string().min(1),
  roleBlindIndex: z.string().min(1),
  companyCiphertext: z.string().min(1),
  companyIv: z.string().min(1),
  roleCiphertext: z.string().min(1),
  roleIv: z.string().min(1),
  reportItemId: z.string().uuid().optional(),
  score: z.number().min(0).max(5).optional(),
  legitimacyTier: z.enum(["high_confidence", "proceed_with_caution", "suspicious"]).optional(),
  atsVendor: z.string().optional(),
  sourcePortal: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const parsed = createApplicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid application.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [application] = await db
    .insert(applications)
    .values({
      userId: session.user.id,
      ...parsed.data,
      score: parsed.data.score?.toFixed(2),
    })
    .returning();

  return NextResponse.json(application, { status: 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.userId, session.user.id))
    .orderBy(desc(applications.createdAt));

  return NextResponse.json(rows);
}
