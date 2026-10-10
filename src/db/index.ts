import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseConfig } from "./config";
import * as schema from "./schema";

// Reuse one pool across hot reloads in development, otherwise every reload
// would open new connections until Postgres runs out of them.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool = globalForDb.pgPool ?? new Pool(getDatabaseConfig());

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle({ client: pool, schema });
