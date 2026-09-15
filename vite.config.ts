import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      // Register the service worker automatically and refresh silently
      // whenever a new build ships.
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "SIP Game",
        short_name: "SIP",
        description: "Student Induction Program game",
        theme_color: "#0b0b16",
        background_color: "#0b0b16",
        // `fullscreen` = no browser chrome when installed. Browsers that
        // don't honour it (Safari) fall back to `standalone` automatically.
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        orientation: "landscape",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Precache all the shipped assets so the game boots offline once
        // it's been loaded a first time. GLB and JPG textures are big;
        // caching them saves the second-launch reload.
        globPatterns: ["**/*.{js,css,html,png,jpg,svg,glb,gltf,woff2}"],
        globIgnores: ["**/node_modules/**", "sw.js", "workbox-*.js"],
        // three.js chunks are >2MB; bump the default 2MB size limit.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
