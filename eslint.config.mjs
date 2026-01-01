import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "README.md",
      ".github/**",
    ],
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Design consistency rules
      "no-restricted-syntax": [
        "error",
        {
          "selector": "Literal[value=/^#[0-9a-fA-F]{3,6}$/]",
          "message": "Use CSS custom properties instead of hardcoded hex colors. Example: use 'var(--primary)' instead of '#0969da'"
        },
        {
          "selector": "Literal[value=/^rgb\\(/]",
          "message": "Use CSS custom properties instead of hardcoded rgb colors. Example: use 'var(--background)' instead of 'rgb(255, 255, 255)'"
        },
        {
          "selector": "Literal[value=/^rgba\\(/]",
          "message": "Use CSS custom properties instead of hardcoded rgba colors. Example: use 'var(--overlay)' instead of 'rgba(0, 0, 0, 0.1)'"
        }
      ],
      // Prevent hardcoded spacing values - temporarily disabled
      "no-restricted-imports": "off",
      // Temporarily disable strict formatting rules for existing code
      "camelcase": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "quotes": "off",
      "semi": "off",
      "comma-dangle": "off",
      "indent": "off",
      "max-len": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];

export default eslintConfig;
