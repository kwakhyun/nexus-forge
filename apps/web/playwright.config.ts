import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = dirname(fileURLToPath(import.meta.url));
const streamServerDirectory = resolve(webDirectory, "../stream-server");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  // Retain retries for diagnostics, but never deploy a run that needed one to pass.
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1024 } },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: streamServerDirectory,
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --host 0.0.0.0 --port 4174 --strictPort",
      cwd: webDirectory,
      url: "http://127.0.0.1:4174/overview",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
