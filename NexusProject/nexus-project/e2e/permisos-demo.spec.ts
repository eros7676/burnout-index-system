import { test, expect } from "@playwright/test";
test("T15a: selección real de usuario y empleado sin acceso a resultados", async ({
  page,
}) => {
  expect((await page.request.get("/api/evaluaciones")).status()).toBe(401);
  await page.goto("/");
  await page.getByRole("button", { name: /^Empleado/ }).click();
  await expect(page).toHaveURL(/\/my-data$/);
  await expect(page.getByLabel("Usuario de demostración")).toHaveValue(
    "demo-empleado",
  );
  expect((await page.request.get("/api/alertas")).status()).toBe(403);
  expect((await page.request.get("/api/personas")).status()).toBe(403);
  expect((await page.request.post("/api/importaciones/validar")).status()).toBe(
    403,
  );
});
test("T15a: Team Lead no puede consultar equipo ajeno por HTTP real", async ({
  page,
}) => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requiere seed MySQL aislado.");
  await page.request.post("/api/demo/sesion", {
    data: { userId: "demo-tl-01" },
  });
  expect(
    (await page.request.get("/api/evaluaciones?teamId=EQ-02")).status(),
  ).toBe(403);
  expect(
    (await page.request.get("/api/resumen?employeeId=EMP-002")).status(),
  ).toBe(403);
  expect((await page.request.get("/api/personas?teamId=EQ-02")).status()).toBe(
    403,
  );
  expect((await page.request.get("/api/alertas?teamId=EQ-01")).status()).toBe(
    200,
  );
  expect((await page.request.get("/api/auditoria")).status()).toBe(403);
});
