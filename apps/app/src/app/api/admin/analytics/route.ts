import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getAnalyticsSummary } from "@/lib/adminAnalytics";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ message: "Not authorized." }, { status: 403 });

  return NextResponse.json(await getAnalyticsSummary());
}
