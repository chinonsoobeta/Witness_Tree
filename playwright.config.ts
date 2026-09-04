import { defineConfig } from "@playwright/test";

const evidenceDirectory = `outputs/playwright/${new Date().toISOString().replaceAll(":", "-")}`;

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: `${evidenceDirectory}/artifacts`,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 2,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["json", { outputFile: `${evidenceDirectory}/results.json` }]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [375, 768, 1280].flatMap((width) => (["light", "dark"] as const).map((colorScheme) => ({
    name: `${width}-${colorScheme}`, use: { viewport: { width, height: 812 }, colorScheme },
  }))),
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/en",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
