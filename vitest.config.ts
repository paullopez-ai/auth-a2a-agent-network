import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // MOCK_LLM is forced on for the whole suite: tests must never call real Claude.
    env: {
      MOCK_LLM: "true",
    },
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@shared": new URL("./src/shared", import.meta.url).pathname,
      "@provider": new URL("./src/agents/provider", import.meta.url).pathname,
      "@payer": new URL("./src/agents/payer", import.meta.url).pathname,
    },
  },
});
