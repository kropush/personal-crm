import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const host = "127.0.0.1";

function docker(...args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

export async function withTemporaryMailpit(
  run: (mailpit: { webUrl: string; smtpPort: number }) => Promise<void>,
) {
  const container = docker(
    "run",
    "--detach",
    "--rm",
    "--publish",
    `${host}::1025`,
    "--publish",
    `${host}::8025`,
    "axllent/mailpit:v1.34.0",
  );
  try {
    const publishedPort = (port: number) =>
      Number(docker("port", container, `${port}/tcp`).split(":").at(-1));
    const smtpPort = publishedPort(1025);
    const webPort = publishedPort(8025);
    if (!smtpPort || !webPort) throw new Error("Docker did not publish the Mailpit ports");

    const webUrl = `http://${host}:${webPort}`;
    const deadline = Date.now() + 30_000;
    for (;;) {
      const response = await fetch(`${webUrl}/readyz`, { signal: AbortSignal.timeout(1000) }).catch(
        () => null,
      );
      if (response?.ok) break;
      if (Date.now() >= deadline) throw new Error("Mailpit did not become ready");
      await setTimeout(250);
    }

    await run({ webUrl, smtpPort });
  } finally {
    docker("stop", "--time", "2", container);
  }
}
