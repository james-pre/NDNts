import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.t.ts",
    ],
    watch: false,
    threads: false,
    testTimeout: 30000,
    globalSetup: "./setup-webpack.ts",
    // isolate: false,
  },
});