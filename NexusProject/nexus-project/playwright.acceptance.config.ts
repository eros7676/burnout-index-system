import { defineConfig } from "@playwright/test";

const database = process.env.TEST_DATABASE_URL;
if (
  !database ||
  !/^mysql:\/\/[^/]+\/[A-Za-z0-9_]+_test(?:\?.*)?$/.test(database)
) {
  throw new Error(
    "T16 exige TEST_DATABASE_URL MySQL aislada, migrada, con nombre terminado en _test.",
  );
}

export default defineConfig({
  testDir: "./acceptance",
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results/acceptance",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/t16-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3116",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: {
        browserName: "chromium",
        ...(process.env.T16_CHROME_PATH
          ? { launchOptions: { executablePath: process.env.T16_CHROME_PATH } }
          : { channel: "chrome" }),
      },
    },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3116",
    url: "http://127.0.0.1:3116/importaciones",
    reuseExistingServer: false,
    env: { DATABASE_URL: database },
  },
});
