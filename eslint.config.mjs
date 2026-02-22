import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".next/**",
      "storybook-static/**",
      "test-results/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/stories/**",
      "**/*.d.ts",
    ],
  },
  {
    files: ["src/features/boards/components/realtime-canvas/**/*.{ts,tsx}"],
    rules: {
      "max-lines": [
        "error",
        {
          max: 800,
          skipBlankLines: false,
          skipComments: false,
        },
      ],
      "max-lines-per-function": [
        "error",
        {
          max: 700,
          skipBlankLines: false,
          skipComments: false,
        },
      ],
    },
  },
];

export default config;
