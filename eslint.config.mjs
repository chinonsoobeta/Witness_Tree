import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "dist/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored, unmodified maplibre-gl worker distribution. Byte-identical to
    // the installed package and proven so by check:maplibre-worker-asset.
    "public/maplibre/**",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      /*
       * Two accessibility checkers disagree about one element, and only one of
       * them is right about it.
       *
       * A table wider than its column has to scroll, and a mouse can scroll it
       * but a keyboard cannot reach it. axe-core's scrollable-region-focusable
       * rule therefore requires the scroll container to be focusable, which
       * means tabindex="0" on a div, named and given role="region" so a screen
       * reader announces what the reader has just landed in.
       *
       * jsx-a11y's default list of roles that may carry a tabindex holds only
       * tabpanel, so it reports the correct fix as a defect. Adding region to
       * that list is the narrowest possible allowance: every other
       * non-interactive element still fails, and dropping either the role or
       * the accessible name puts the element back in breach.
       */
      "jsx-a11y/no-noninteractive-tabindex": ["error", { tags: [], roles: ["tabpanel", "region"], allowExpressionValues: true }],
    },
  },
]);

export default eslintConfig;
