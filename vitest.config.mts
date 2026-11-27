import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  resolve: { tsconfigPaths: true },
  test: {
    allowOnly: false,
    exclude: [...configDefaults.exclude, "**/.next/**"],
    reporters: [
      "default",
      {
        onTestRunEnd(modules) {
          const skipped = modules.flatMap((module) => [
            ...module.children.allTests("skipped"),
            ...Array.from(module.children.allSuites()).filter(
              (suite) => suite.children.size === 0 && suite.state() === "skipped",
            ),
          ]);
          if (skipped.length === 0) return;

          console.error("Skipped tests or suites:");
          for (const task of skipped) {
            console.error(`- ${task.module.relativeModuleId} > ${task.fullName}`);
          }
          process.exitCode = 1;
        },
      },
    ],
  },
});
