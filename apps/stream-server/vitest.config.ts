import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 2,
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
