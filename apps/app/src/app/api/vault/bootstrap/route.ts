import { userKeys } from "@porphyra/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Called once, right after signup — see apps/app/src/app/signup/page.tsx.
// The server never sees a raw key here, only wrapped (encrypted) ones; see
// packages/crypto for what actually produced these values client-side.

const encryptedPayloadSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
});

const kdfParamsSchema = z.object({
  algo: z.literal("argon2id"),
  memoryKb: z.number().int().positive(),
  iterations: z.number().int().positive(),
  parallelism: z.number().int().positive(),
  hashLengthBytes: z.number().int().positive(),
});

const bootstrapSchema = z.object({
  wrappedDek: encryptedPayloadSchema,
  encSalt: z.string().min(1),
  recoveryWrappedDek: encryptedPayloadSchema,
  kdfParams: kdfParamsSchema,
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  }

  const parsed = bootstrapSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid vault bootstrap payload.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // One vault per user, enforced at the DB level too (userKeys.userId is
  // unique) — this check just gives a clearer error than a raw constraint
  // violation. A user with a vault already should be rotating keys through
  // a dedicated flow (Phase 3+), not re-bootstrapping.
  const existing = await db.query.userKeys.findFirst({
    where: (fields, { eq }) => eq(fields.userId, session.user.id),
  });
  if (existing) {
    return NextResponse.json(
      { message: "This account already has a vault." },
      { status: 409 },
    );
  }

  const { wrappedDek, encSalt, recoveryWrappedDek, kdfParams } = parsed.data;

  await db.insert(userKeys).values({
    userId: session.user.id,
    wrappedDekCiphertext: wrappedDek.ciphertext,
    wrappedDekIv: wrappedDek.iv,
    encSalt,
    recoveryWrappedDekCiphertext: recoveryWrappedDek.ciphertext,
    recoveryWrappedDekIv: recoveryWrappedDek.iv,
    kdfParams,
  });

  await track(session.user.id, "vault_bootstrapped");

  return NextResponse.json({ ok: true }, { status: 201 });
}
