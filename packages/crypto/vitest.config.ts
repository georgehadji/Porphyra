import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // Node 20+ ships a spec-compliant globalThis.crypto
    include: ["src/**/*.test.ts"],
    testTimeout: 20_000, // Argon2id at full cost is intentionally slow
  },
});
