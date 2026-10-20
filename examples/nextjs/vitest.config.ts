import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // `server-only` throws outside Next's server bundle, so tests use an empty stand-in.
    alias: { "server-only": path.resolve(__dirname, "test/server-only.ts") },
  },
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
