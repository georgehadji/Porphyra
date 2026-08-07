import { processedStripeEvents, subscriptions } from "@porphyra/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

// Stripe's webhook contract, non-negotiable:
// 1. Verify the signature against the RAW body — a parsed-then-restringified
//    body will not match, since JSON key order/whitespace isn't guaranteed
//    stable. request.text() below is what makes that possible; do not
//    change this route to read request.json() first.
// 2. Stripe does not guarantee exactly-once delivery — the same event can
//    arrive twice. processedStripeEvents makes a second delivery a no-op
//    instead of double-applying a subscription change.
// 3. Return 200 quickly. Anything else makes Stripe retry, correctly.

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ message: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return NextResponse.json({ message: `Webhook signature verification failed: ${message}` }, {
      status: 400,
    });
  }

  try {
    await db.insert(processedStripeEvents).values({ id: event.id, type: event.type });
  } catch {
    // Primary-key collision — Stripe already sent this event once and we
    // handled it. Acknowledge without reprocessing.
    return NextResponse.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object;
      const subscriptionId =
        typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : null;
      const customerId =
        typeof checkoutSession.customer === "string" ? checkoutSession.customer : null;
      if (subscriptionId && customerId) {
        const stripeSubscription = await getStripe().subscriptions.retrieve(subscriptionId);
        await upsertSubscriptionFromStripe(customerId, stripeSubscription);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const stripeSubscription = event.data.object;
      const customerId =
        typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null;
      if (customerId) {
        await upsertSubscriptionFromStripe(customerId, stripeSubscription);
      }
      break;
    }
    default:
      break; // Unhandled event types are fine to ignore — Stripe sends many we don't act on.
  }

  return NextResponse.json({ received: true });
}

async function upsertSubscriptionFromStripe(
  stripeCustomerId: string,
  stripeSubscription: Stripe.Subscription,
): Promise<void> {
  const isActive = stripeSubscription.status === "active" || stripeSubscription.status === "trialing";
  // Stripe moved current_period_end from Subscription to each
  // SubscriptionItem in the March 2025 "Basil" API version — but the
  // installed stripe SDK (17.7.0)'s own type definitions still declare it
  // on the top-level Subscription object (verified against
  // node_modules/stripe/types/Subscriptions.d.ts, not just docs/articles).
  // Whether the FIELD ACTUALLY POPULATES depends on which API version the
  // Stripe account/key defaults to, not just what the SDK types say — this
  // is a real risk to confirm against a live webhook payload before
  // launch, not something typecheck alone can settle.
  const periodEndUnix = stripeSubscription.current_period_end;

  await db
    .update(subscriptions)
    .set({
      stripeSubscriptionId: stripeSubscription.id,
      tier: isActive ? "pro" : "free",
      status: stripeSubscription.status,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId));
}
