import { defineConfig } from "vite";
import { ffmpeg } from "./ffmpeg";

export default defineConfig({
  base: "./",
  plugins: [ffmpeg()],
  build: {
    outDir: "./dist",
    assetsDir: ".",
    rollupOptions: {
      //
    },
  },
});
