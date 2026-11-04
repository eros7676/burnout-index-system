import { test, expect } from "@playwright/test";
import { demo, menu } from "./demo";

test("Ingreso: elegir RRHH abre el resumen con todo el menú", async ({ page }) => {
  await demo(page, null);
  await page.goto("/");
  await page.getByRole("button", { name: /^RRHH/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
  for (const seccion of ["Resumen", "Personas", "Equipos", "Alertas", "Importar datos", "Reglas del índice", "Auditoría"])
    await expect(menu(page).getByRole("link", { name: seccion })).toBeVisible();
  await expect(menu(page).getByRole("link", { name: "Resumen" })).toHaveAttribute("aria-current", "page");
});

test("Shell: el aviso de demo y de no diagnóstico aparece una sola vez", async ({ page }) => {
  await demo(page, "demo-rrhh");
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
  await expect(page.getByText("no es un diagnóstico")).toHaveCount(1);
  await expect(page.getByLabel("Usuario de demostración")).toHaveValue("demo-rrhh");
});

test("Shell: el empleado solo ve Mis datos y no entra al resumen", async ({ page }) => {
  await demo(page, "demo-empleado");
  await page.goto("/home");
  await expect(page).toHaveURL(/\/my-data$/);
  await expect(menu(page).getByRole("link")).toHaveText(["Mis datos"]);
});

test("Shell: el Team Lead no ve Equipos, Importar ni Auditoría", async ({ page }) => {
  await demo(page, "demo-tl-01");
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
  for (const oculta of ["Equipos", "Importar datos", "Auditoría"])
    await expect(menu(page).getByRole("link", { name: oculta })).toHaveCount(0);
  await page.goto("/teams");
  await expect(page).toHaveURL(/\/home$/);
});

test("Shell: sin sesión, una pantalla interna vuelve al ingreso", async ({ page }) => {
  await demo(page, null);
  await page.goto("/employees");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Seleccione un perfil para ingresar" })).toBeVisible();
});

test("Shell: cambiar de usuario desde la franja de demo", async ({ page }) => {
  await demo(page, "demo-rrhh");
  await page.goto("/home");
  await page.getByLabel("Usuario de demostración").selectOption("demo-empleado");
  await expect(page).toHaveURL(/\/my-data$/);
  await expect(page.getByLabel("Usuario de demostración")).toHaveValue("demo-empleado");
});
