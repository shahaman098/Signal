import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["apps/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["apps/api/src/**"],
    },
  },
});
