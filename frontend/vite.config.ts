import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.join(__dirname, "src"),
    },
    // onnxruntime-web's default export condition bundles its own ~26MB WASM
    // binary as a build asset. The on-device neural voice (lib/neuralVoice.ts)
    // always points env.wasm.wasmPaths at an external URL instead, so that
    // binary would just be dead weight shipped in the iOS app — this condition
    // switches its resolution to the variant that expects the WASM to be
    // loaded externally, matching how it's actually used here.
    conditions: ["onnxruntime-web-use-extern-wasm"],
  },
});
