import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.wasm"],
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    exclude: ["@zama-fhe/relayer-sdk"],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    port: 5173,
  },
});
