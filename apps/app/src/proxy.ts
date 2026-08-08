import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Per-request nonce-based CSP — the gap flagged in next.config.mjs since
// Phase 2 ("Caddy enforces the baseline headers; the app owns its own CSP
// because only app code knows the per-request nonce"). Next.js can't
// inline a static nonce into next.config.mjs since it has to be fresh on
// every request; middleware is the documented place to generate one and
// attach it both to the outgoing response header and to the request (so
// Server Components can read it back via headers() and put it on any
// inline <script> they render).

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'", // React inline styles (style={{}}) — no safe alternative without a CSS-in-JS nonce plumbing pass
    "img-src 'self' data: https:", // https: for OAuth provider avatars (Google/GitHub profile images)
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  // Skip static assets and Next's own internals — no reason to run crypto
  // and rebuild headers for a hashed JS chunk that doesn't execute inline
  // scripts anyway.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
