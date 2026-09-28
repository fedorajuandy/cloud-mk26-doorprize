import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:6339",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/test-server.ts",
    url: "http://127.0.0.1:6339/login",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
