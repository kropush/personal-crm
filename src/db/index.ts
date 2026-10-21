import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseConfig } from "./config";
import * as schema from "./schema";

function createDb() {
  return drizzle({ client: new Pool(getDatabaseConfig()), schema });
}

// Reuse one pool across hot reloads in development, otherwise every reload
// would open new connections until Postgres runs out of them.
const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof createDb>;
};

// Created on the first query rather than on import: `next build` in CI loads
// this module without database settings
export function getDb() {
  globalForDb.db ??= createDb();
  return globalForDb.db;
}
