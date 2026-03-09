import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "generate-404",
      closeBundle() {
        // Copy index.html to 404.html after build
        fs.copyFileSync("dist/index.html", "dist/404.html");
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Marmots Web Chat",
        short_name: "Marmots Web Chat",
        description: "An example chat app using marmot-ts",
        theme_color: "#ffffff",
        background_color: "#000000",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32" },
          { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
          { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
          {
            src: "/icon-192-maskable.png",
            type: "image/png",
            sizes: "192x192",
            purpose: "maskable",
          },
          {
            src: "/icon-512-maskable.png",
            type: "image/png",
            sizes: "512x512",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
