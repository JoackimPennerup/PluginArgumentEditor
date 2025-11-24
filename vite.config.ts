import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // File watching inside containers and some VMs can miss native FS events;
    // fall back to polling so Vite reloads consistently during development.
    watch: {
      usePolling: true
    }
  },
  build: {
    target: "es2020"
  }
});
