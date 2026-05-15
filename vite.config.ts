import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ["DESKTOP-H55EU4J", "desktop-h55eu4j", "DESKTOP-H55EU4J.local", "desktop-h55eu4j.local"],
    proxy: {
      "/api": "http://127.0.0.1:3333"
    }
  }
});
