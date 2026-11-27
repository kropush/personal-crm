import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";

import { withTemporaryPostgres } from "./temporary-postgres";

async function main() {
  const vitestCli = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
  await withTemporaryPostgres("postgres", async ({ port, password }) => {
    const vitest = spawn(process.execPath, [vitestCli, "run", ...process.argv.slice(2)], {
      env: {
        ...process.env,
        CRM_TEST_POSTGRES_PORT: String(port),
        CRM_TEST_POSTGRES_PASSWORD: password,
      },
      stdio: "inherit",
    });
    const [exitCode] = await once(vitest, "exit");
    process.exitCode = exitCode ?? 1;
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
