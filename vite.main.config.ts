import path from "node:path"
import { defineConfig } from "vite"

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      external: [
        "electron",
        "simple-git",
        "@trpc/server",
        "zod",
        "@parcel/watcher",
        "electron-squirrel-startup",
      ],
      output: {
        format: "cjs",
      },
    },
    commonjsOptions: {
      ignoreDynamicRequires: false,
    },
  },
})
