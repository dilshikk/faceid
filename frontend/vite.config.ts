import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // `npm run dev`: forward API calls to the local backend so the session
    // cookie stays same-origin.
    proxy: { "/api": "http://127.0.0.1:8081" },
  },
});
