import { execSync } from "child_process";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Stamp the build with the commit it came from, so a Sentry error points at
// the exact code that produced it instead of "some version of main". Railway
// injects the SHA; a local build asks git. Neither is guaranteed (a source
// tarball has no git dir), and a missing release is not worth failing a build
// over — reporting just falls back to unversioned.
function resolveRelease(): string {
  const fromCi = process.env.VITE_RELEASE ?? process.env.RAILWAY_GIT_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.join(__dirname, "src"),
    },
  },
  test: {
    // Component tests need a DOM; the pure-logic tests do not care, and the
    // cost of jsdom for all of them is not worth splitting environments over.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Scoped to src explicitly. Vitest's default include matches *.spec.ts
    // anywhere, which swallows the Playwright suite in e2e/ and fails with
    // "Playwright Test did not expect test() to be called here".
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // `android`/`ios` hold a copy of the built web assets after `cap sync`.
    exclude: ["node_modules", "dist", "android", "ios", "vendor", "e2e"],
  },
  define: {
    // Inlined at build time rather than read from import.meta.env, so it works
    // identically in the packaged native builds where there is no .env file.
    __APP_RELEASE__: JSON.stringify(resolveRelease()),
  },
});
