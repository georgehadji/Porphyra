import Stripe from "stripe";

// Lazy singleton — same reasoning as src/lib/db.ts and src/lib/auth.ts:
// Next.js imports every route module during `next build` to collect its
// exported HTTP methods, and constructing Stripe eagerly at module scope
// with an unset STRIPE_SECRET_KEY would crash that step, not just a real
// request. getStripe() defers the env read to first actual use.
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set — see .env.example.");
  }
  cached = new Stripe(key);
  return cached;
}

export function proPriceId(): string {
  const id = process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (!id) throw new Error("STRIPE_PRICE_PRO_MONTHLY is not set — see .env.example.");
  return id;
}
