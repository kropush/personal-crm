import { defineConfig } from "drizzle-kit";

import { getDatabaseConfig } from "./src/db/config";

// drizzle-kit runs outside of Next.js, so .env has to be loaded explicitly
process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { ...getDatabaseConfig(), ssl: false },
});
