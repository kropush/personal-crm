import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "comma-spacing": "error",
      "eol-last": "error",
      "keyword-spacing": "error",
      "no-mixed-spaces-and-tabs": "error",
      "no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
      "no-trailing-spaces": "error",
      "object-curly-spacing": ["error", "always"],
    },
  },
  {
    // Next's built-in exemption for Open Graph images only recognizes POSIX paths.
    files: ["src/app/opengraph-image.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
