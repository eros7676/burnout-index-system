import { defineConfig } from "@playwright/test";

if (
  process.env.TEST_DATABASE_URL &&
  !/^mysql:\/\/[^/]+\/[A-Za-z0-9_]+_test(?:\?.*)?$/.test(
    process.env.TEST_DATABASE_URL,
  )
) {
  throw new Error(
    "TEST_DATABASE_URL debe ser una base MySQL cuyo nombre termine en _test.",
  );
}
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3106",
    trace: "retain-on-failure",
    // The suite runs with reduced motion: no spec waits for a tween.
    contextOptions: { reducedMotion: "reduce" },
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3106",
    url: "http://127.0.0.1:3106/importaciones",
    reuseExistingServer: false,
    env: process.env.TEST_DATABASE_URL
      ? { DATABASE_URL: process.env.TEST_DATABASE_URL }
      : {},
  },
});
