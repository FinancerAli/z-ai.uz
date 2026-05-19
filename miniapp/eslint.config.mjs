import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Accessibility (WCAG AA basics) — Task 28
  // `eslint-config-next` already registers the `jsx-a11y` plugin and a
  // small subset of rules. We extend the rule set to the recommended
  // configuration, with a few Telegram Mini App tweaks (mobile-only,
  // button-first navigation).
  {
    rules: {
      ...jsxA11y.configs.recommended.rules,
      // Mini Apps mostly use <button> for navigation — anchors are rare
      // and validated by Telegram openTelegramLink. Disable the rule
      // because it produces false positives on internal navigation.
      "jsx-a11y/anchor-is-valid": "off",
      // The next.js client app uses motion.button + custom roles in a few
      // animated places — keep these as warnings instead of hard errors so
      // they show up but don't block CI.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
    },
  },
]);

export default eslintConfig;
