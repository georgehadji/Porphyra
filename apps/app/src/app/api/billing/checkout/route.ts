import { subscriptions } from "@porphyra/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getStripe, proPriceId } from "@/lib/stripe";

// Creates (or reuses) a Stripe customer for this account, then a Checkout
// Session for the Pro subscription. The subscriptions row this writes is
// intentionally incomplete (tier stays "free") until the webhook confirms
// payment — never flip a user to Pro from this route, only from a verified
// webhook event. See /api/billing/webhook.

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sign in first." }, { status: 401 });

  const stripe = getStripe();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  let subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, session.user.id),
  });

  if (!subscription) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: { userId: session.user.id },
    });
    [subscription] = await db
      .insert(subscriptions)
      .values({ userId: session.user.id, stripeCustomerId: customer.id, tier: "free" })
      .returning();
  }
  if (!subscription) {
    return NextResponse.json({ message: "Couldn't set up billing." }, { status: 500 });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: subscription.stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: proPriceId(), quantity: 1 }],
    success_url: `${appUrl}/settings/billing?checkout=success`,
    cancel_url: `${appUrl}/settings/billing?checkout=cancelled`,
    // Ties the webhook's checkout.session.completed event back to a user
    // without relying solely on the customer ID round-trip.
    client_reference_id: session.user.id,
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ message: "Couldn't start checkout." }, { status: 500 });
  }
  return NextResponse.json({ url: checkoutSession.url });
}
