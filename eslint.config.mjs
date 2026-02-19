import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [".next/**", "storybook-static/**", "playwright-report/**", "test-results/**"]
  },
  ...nextCoreWebVitals,
  ...nextTypeScript
];

export default config;
