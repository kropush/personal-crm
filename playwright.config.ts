import { defineConfig } from "@playwright/test";

if (process.env.CRM_E2E !== "1") {
  throw new Error("Run pnpm test:e2e to start the isolated test database first.");
}

const baseURL = process.env.CRM_APP_URL;
const demoURL = process.env.CRM_E2E_DEMO_URL;
const demoDatabase = process.env.CRM_E2E_DEMO_DB;
if (!demoURL || !demoDatabase) throw new Error("Run pnpm test:e2e to prepare the demo database.");

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: ".next/e2e-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: "retain-on-failure" },
  webServer: [
    {
      command: "pnpm build && pnpm start --port 3100",
      url: `${baseURL}/health`,
      timeout: 120_000,
    },
    {
      command: "pnpm start --port 3101",
      url: `${demoURL}/health`,
      env: { CRM_APP_URL: demoURL, POSTGRES_DB: demoDatabase },
      timeout: 30_000,
    },
  ],
});
