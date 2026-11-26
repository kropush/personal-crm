import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  resolve: { tsconfigPaths: true },
  test: { exclude: [...configDefaults.exclude, "**/.next/**"] },
});
