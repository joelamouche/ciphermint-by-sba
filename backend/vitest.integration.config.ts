import { defineConfig } from "vitest/config";
import { resolve } from "path";
import dotenv from "dotenv";

// Load .env file explicitly
dotenv.config({ path: resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 120000, // 2 minutes for integration tests
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
