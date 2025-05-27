import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron', 'simple-git', '@trpc/server', 'zod', '@parcel/watcher', 'electron-squirrel-startup'],
      output: {
        format: 'cjs'
      }
    }
  }
});
