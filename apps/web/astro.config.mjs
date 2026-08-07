import { defineConfig } from "astro/config";

// Fully static output — see the plan's "Why two frameworks": the marketing
// surface has no server runtime, which is what lets Caddy sit in front of
// it with the strictest possible CSP (infra/caddy/Caddyfile).
export default defineConfig({
  output: "static",
  site: "https://porphyra.example", // TODO: update once the domain is chosen
  compressHTML: true,
});
