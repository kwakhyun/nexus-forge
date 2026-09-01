import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = dirname(fileURLToPath(import.meta.url));
const streamServerDirectory = resolve(webDirectory, "../stream-server");
const webPort = Number(process.env.NEXUS_E2E_PORT ?? 4174);
if (!Number.isInteger(webPort) || webPort < 1_024 || webPort > 65_535) {
  throw new Error("NEXUS_E2E_PORT must be an integer between 1024 and 65535");
}
const webBaseUrl = `http://127.0.0.1:${webPort}`;

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
    baseURL: webBaseUrl,
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
      command: `npm run dev -- --host 0.0.0.0 --port ${webPort} --strictPort`,
      cwd: webDirectory,
      url: `${webBaseUrl}/overview`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
