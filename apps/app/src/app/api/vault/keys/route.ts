import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Fetched once per session, right after login — see the login page's flow.
// This is exactly why encSalt doesn't need to be known BEFORE
// authentication (see packages/crypto/src/kdf.ts's comment on
// deriveAuthVerifierSalt): the client derives the Master Key using encSalt
// only after it already has a session, using the real password it still
// holds in memory from the same login form submission.

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Sign in first." }, { status: 401 });
  }

  const keys = await db.query.userKeys.findFirst({
    where: (fields, { eq }) => eq(fields.userId, session.user.id),
  });

  if (!keys) {
    // Distinct from "wrong password" — this account authenticated fine but
    // never finished vault bootstrap (e.g. dropped connection mid-signup).
    // The client should route back into the bootstrap flow, not treat this
    // as a decryption failure.
    return NextResponse.json({ message: "No vault found for this account." }, { status: 404 });
  }

  return NextResponse.json({
    wrappedDek: { ciphertext: keys.wrappedDekCiphertext, iv: keys.wrappedDekIv },
    encSalt: keys.encSalt,
    recoveryWrappedDek: {
      ciphertext: keys.recoveryWrappedDekCiphertext,
      iv: keys.recoveryWrappedDekIv,
    },
    kdfParams: keys.kdfParams,
  });
}
