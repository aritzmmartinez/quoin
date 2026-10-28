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

/**
 * Nothing reads a date in the process's own zone: Docker runs in UTC, the
 * author's machine in Madrid, and the same instant would land on two days.
 * A zone is always named, and core/calendar is where days are assigned.
 */
const LOCAL_TIME = [
  {
    selector:
      "CallExpression[callee.property.name=/^(get|set)(FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)$/]",
    message:
      "Local-time getters and setters read the process's zone. Use the UTC variant, or core/calendar with an explicit zone.",
  },
  {
    selector:
      "CallExpression[callee.property.name=/^(getTimezoneOffset|toLocaleDateString|toLocaleTimeString|toDateString|toTimeString)$/]",
    message:
      "This reads the process's zone. Format through createFormat(locale, zone).",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length>1]",
    message:
      "new Date(y, m, d…) builds local time. Use Date.UTC, or startOfDay(date, zone).",
  },
  {
    selector:
      "NewExpression[callee.property.name='DateTimeFormat']:not(:has(Property[key.name='timeZone']))",
    message:
      "An Intl.DateTimeFormat without timeZone formats in the process's zone. Name the zone.",
  },
];

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
    files: ["app/**/*.{ts,tsx}", "scripts/**/*.ts"],
    ignores: ["app/core/calendar/**"],
    rules: { "no-restricted-syntax": ["error", ...LOCAL_TIME] },
  },
  {
    // A backup's file name is read by a person restoring it, on their own
    // clock; it is a label, not a date anything is assigned to.
    files: ["scripts/lib/backup-names.ts", "scripts/lib/backup-names.test.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

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
