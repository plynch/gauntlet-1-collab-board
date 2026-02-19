import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";

const config = [
  {
    ignores: [
      ".next/**",
      "storybook-static/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/stories/**"],
    plugins: {
      jsdoc,
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
    rules: {
      "jsdoc/require-description": "error",
      "jsdoc/require-jsdoc": [
        "error",
        {
          contexts: [
            "FunctionDeclaration",
            "MethodDefinition[kind='method']",
            "MethodDefinition[kind='constructor']",
            "VariableStatement:has(> VariableDeclarationList > VariableDeclaration[id.type='Identifier'][init.type='ArrowFunctionExpression'])",
            "VariableStatement:has(> VariableDeclarationList > VariableDeclaration[id.type='Identifier'][init.type='FunctionExpression'])",
          ],
        },
      ],
    },
  },
];

export default config;
