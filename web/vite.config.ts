import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // the Zama SDK ships wasm + workers; esbuild pre-bundling breaks its asset URLs
  optimizeDeps: { exclude: ["@zama-fhe/sdk", "@zama-fhe/react-sdk"] },
});
