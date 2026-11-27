import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      // The app, plus the Hubby coming soon page at /waitlist/ (see vite.waitlist.config.ts to publish it alone).
      input: {
        main: path.resolve(__dirname, "index.html"),
        waitlist: path.resolve(__dirname, "waitlist/index.html"),
      },
    },
  },
});
