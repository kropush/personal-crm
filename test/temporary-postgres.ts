import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { Pool } from "pg";

type PostgresConnection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

function docker(args: string[], env = process.env) {
  return execFileSync("docker", args, { encoding: "utf8", env }).trim();
}

async function waitForPostgres(connection: PostgresConnection) {
  const pool = new Pool({ ...connection, connectionTimeoutMillis: 1_000 });
  const deadline = Date.now() + 30_000;
  try {
    for (;;) {
      try {
        await pool.query("select 1");
        return;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await setTimeout(500);
      }
    }
  } finally {
    await pool.end();
  }
}

export async function withTemporaryPostgres(
  database: string,
  run: (connection: PostgresConnection) => Promise<void>,
) {
  const host = "127.0.0.1";
  const user = "postgres";
  const password = randomUUID();
  const container = docker(
    [
      "run",
      "--detach",
      "--rm",
      "--tmpfs",
      "/var/lib/postgresql",
      "--publish",
      `${host}::5432`,
      "--env",
      "POSTGRES_USER",
      "--env",
      "POSTGRES_PASSWORD",
      "--env",
      "POSTGRES_DB",
      "postgres:18",
    ],
    {
      ...process.env,
      POSTGRES_USER: user,
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: database,
    },
  );

  try {
    const port = Number(docker(["port", container, "5432/tcp"]).split(":").at(-1));
    if (!port) throw new Error("Docker did not publish a port for the test database.");

    const connection = { host, port, user, password, database };
    await waitForPostgres(connection);
    await run(connection);
  } finally {
    docker(["stop", "--time", "2", container]);
  }
}
