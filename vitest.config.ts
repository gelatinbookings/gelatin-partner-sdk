import { defineConfig } from "vitest/config";

// The Next.js example has its own dependencies and tests (examples/nextjs).
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
