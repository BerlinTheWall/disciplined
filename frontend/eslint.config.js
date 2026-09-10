import js from "@eslint/js";
import pluginPrettier from "eslint-plugin-prettier/recommended";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Build output and native shells. `android/` and `ios/` hold generated
  // Capacitor/Gradle assets (native-bridge.js and friends) that are not ours to
  // lint; `vendor/` is third-party, `_shots/` is screenshot scratch.
  globalIgnores(["dist", "android", "ios", "vendor", "_shots", "public"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      pluginPrettier, // eslint-plugin-prettier/recommended handles everything
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The Vite entry point renders into the DOM rather than exporting a
    // component, so react-refresh's export rule has nothing to bind to here.
    files: ["src/main.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
]);
