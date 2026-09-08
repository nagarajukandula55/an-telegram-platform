// @ts-check
const tseslint = require("typescript-eslint");

/**
 * Repo-wide lint pass — deliberately light-touch: catches real mistakes
 * (unused vars, floating promises aren't checked here since that needs
 * type info per-project) without requiring every package to wire up its
 * own tsconfig project reference. Runs in CI (see .github/workflows/ci.yml)
 * but does not fail the build on warnings, only on errors.
 */
module.exports = tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/release/**",
      "**/resources/**",
      "apps/desktop/build.js",
    ],
  },
  ...tseslint.configs.recommended,
  {
    linterOptions: {
      // Several files carry `eslint-disable-next-line no-console` etc. from
      // before this config existed, for a rule this config doesn't enable —
      // not worth churning every one of those just to silence this.
      reportUnusedDisableDirectives: false,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      // main.ts/worker's index.ts intentionally use require("dotenv").config()
      // as their literal first statement (see PLAN.md) so env vars load
      // before any other import runs; apps/desktop is plain CommonJS.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
