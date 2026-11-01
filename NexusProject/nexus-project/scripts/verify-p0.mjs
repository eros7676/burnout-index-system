import { spawnSync } from "node:child_process";

const value = process.env.TEST_DATABASE_URL;
if (!value || !/^mysql:\/\/[^/]+\/[A-Za-z0-9_]+_test(?:\?.*)?$/.test(value)) {
  throw new Error(
    "verify:p0 exige TEST_DATABASE_URL de una base MySQL exclusiva migrable, con nombre terminado en _test.",
  );
}
// Nunca usa DATABASE_URL de la aplicación ni sigue si un paso falla.
for (const command of [
  "db:generate",
  "db:deploy",
  "db:seed",
  "lint",
  "typecheck",
  "test",
  "build",
  "db:validate",
  "db:test",
  "db:test:http",
  "test:ui",
  "test:acceptance",
]) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "run", command],
    {
      env: { ...process.env, DATABASE_URL: value },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
