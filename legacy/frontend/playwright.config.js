import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "*.spec.js",
  workers: 1,
  use: { baseURL: "http://localhost:4173", headless: true },
  webServer: [
    { command: "node test/e2e/server.js", port: 6239 },
    {
      command: "npm run dev -- --host localhost --port 4173",
      port: 4173,
      env: { VITE_API_URL: "http://localhost:6239/api" },
    },
  ],
});
