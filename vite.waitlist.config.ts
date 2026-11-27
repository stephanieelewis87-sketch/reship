import { defineConfig } from "vite";
import path from "path";

// Builds only the Hubby coming soon page into dist-waitlist/, as its own index.html, with none of the app in it.
// Publish that folder on the public domain while the app itself stays private.
export default defineConfig({
  root: path.resolve(__dirname, "waitlist"),
  envDir: __dirname,
  publicDir: false,
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist-waitlist"),
    emptyOutDir: true,
  },
});
