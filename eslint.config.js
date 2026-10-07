import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Hexagonal architecture enforced by lint, without heavy plugins: uses the native
 * no-restricted-imports rule with per-folder overrides. Dependencies point inward:
 * app -> adapters -> core. Convention: internal imports always use the `~/...` alias.
 */
const APP_LAYER = [
  "~/routes",
  "~/routes/**",
  "~/components",
  "~/components/**",
  "~/lib",
  "~/lib/**",
  "~/root",
];
const ADAPTERS_LAYER = ["~/adapters", "~/adapters/**"];

const RECHARTS = {
  name: "recharts",
  allowTypeImports: true,
  message:
    "Recharts is imported only from a *Chart.tsx module. Name the file *Chart, or move the drawing into one.",
};
const CHART_MODULE = "**/*Chart";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      ".react-router/**",
      "node_modules/**",
      "app/adapters/persistence/generated/**", // Prisma generated client
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { paths: [RECHARTS] },
      ],
    },
  },
  {
    files: ["app/components/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [RECHARTS],
          patterns: [
            {
              group: [CHART_MODULE],
              caseSensitive: true,
              message:
                "Only a *Chart module may import another *Chart. A component wrapping a chart is a chart: name it *Chart so it stays out of the barrels.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["app/components/index.ts", "app/components/*/index.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [RECHARTS],
          patterns: [
            {
              group: [CHART_MODULE],
              caseSensitive: true,
              message:
                "A barrel never re-exports a *Chart: it would put Recharts in the chunk every route loads. Import the chart from its own module.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["app/**/*Chart.tsx"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
  },

  // core: pure domain. Must not import from adapters or app.
  {
    files: ["app/core/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [RECHARTS],
          patterns: [
            {
              group: [...ADAPTERS_LAYER, ...APP_LAYER],
              message:
                "core is pure domain: it cannot import from adapters or app. Declare a port in core/ports instead.",
            },
          ],
        },
      ],
    },
  },

  // adapters: may use core, not app (routes/components).
  {
    files: ["app/adapters/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [RECHARTS],
          patterns: [
            {
              group: APP_LAYER,
              message:
                "adapters cannot import from app. The direction is app -> adapters -> core.",
            },
          ],
        },
      ],
    },
  },
);
