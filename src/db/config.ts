import { existsSync } from "node:fs";

// Connection settings are built from the same POSTGRES_* variables that
// compose.yaml uses, so .env stays the single source of truth for the database.
export function getDatabaseConfig() {
  const {
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_DB,
    POSTGRES_HOST,
    POSTGRES_PORT,
  } = process.env;

  if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    throw new Error(
      "Database is not configured: set POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB in .env",
    );
  }

  return {
    // Locally compose.yaml publishes Postgres on the IPv4 loopback only;
    // on the server the containers reach it by its compose service name
    host: POSTGRES_HOST || "127.0.0.1",
    port: Number(POSTGRES_PORT || 5432),
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: POSTGRES_DB,
  };
}

// Scripts run outside of Next.js, so locally they load .env explicitly.
// In a container there is no .env: the variables come from the environment.
export function loadEnvFileIfPresent() {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
}
