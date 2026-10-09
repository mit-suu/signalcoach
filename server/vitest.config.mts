import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000, // first run downloads the mongod binary
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      MONGODB_URI: "mongodb://placeholder", // replaced by the in-memory server in test/setup
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
      LLM_PROVIDER: "mock",
    },
  },
});
