import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export const testPostgresPort = Number(process.env.CRM_TEST_POSTGRES_PORT);

export async function openTestDatabase() {
  const connection = {
    host: "127.0.0.1",
    port: testPostgresPort,
    user: "postgres",
    database: "postgres",
  };
  const admin = new Pool(connection);
  const database = `crm_test_${randomUUID().replaceAll("-", "")}`;

  try {
    await admin.query(`CREATE DATABASE "${database}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }

  const pool = new Pool({ ...connection, database });
  return {
    db: drizzle({ client: pool }),
    pool,
    async close() {
      await pool.end();
      try {
        await admin.query(`DROP DATABASE "${database}"`);
      } finally {
        await admin.end();
      }
    },
  };
}
