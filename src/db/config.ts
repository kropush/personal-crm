// Connection settings are built from the same POSTGRES_* variables that
// compose.yaml uses, so .env stays the single source of truth for the database.
export function getDatabaseConfig() {
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT } =
    process.env;

  if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    throw new Error(
      "Database is not configured: set POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB in .env",
    );
  }

  return {
    // compose.yaml publishes Postgres on the IPv4 loopback only
    host: "127.0.0.1",
    port: Number(POSTGRES_PORT || 5432),
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: POSTGRES_DB,
  };
}
