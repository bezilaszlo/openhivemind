import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    host: process.env.VITE_HOST ?? "127.0.0.1",
    proxy: { "/api": process.env.VITE_API_PROXY ?? "http://localhost:3000" },
  },
});
