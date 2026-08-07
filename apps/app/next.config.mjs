import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pinned to the MONOREPO root (not this app's own directory): pnpm's
  // symlinked node_modules/.pnpm store lives there, and Turbopack refuses to
  // resolve or compile anything outside whatever root it's given. Pinning to
  // apps/app itself (the pattern used by a single-lockfile Next app) makes
  // `next build` fail with "Could not find the Next.js package" — it can no
  // longer see through the pnpm workspace symlinks up to the real package.
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
  // Nonce-based CSP is set per-request in middleware (Phase 2, once auth
  // exists to key rate limiting off) — see infra/caddy/Caddyfile's comment
  // on why the app owns its own CSP header instead of Caddy.
  output: "standalone", // small, self-contained production image for infra/docker-compose.prod.yml
};

export default nextConfig;
