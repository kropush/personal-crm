import { defineConfig } from "@playwright/test";

if (process.env.CRM_E2E !== "1") {
  throw new Error("Run pnpm test:e2e to start the isolated test database first.");
}

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: ".next/e2e-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: `${baseURL}/health`,
    timeout: 120_000,
  },
});
