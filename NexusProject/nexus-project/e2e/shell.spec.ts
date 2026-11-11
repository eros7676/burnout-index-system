import { test, expect } from "@playwright/test";
import { demo, menu } from "./demo";

test("Ingreso: elegir RR. HH. abre el resumen con todo el menú", async ({ page }) => {
  await demo(page, null);
  await page.goto("/");
  await page.getByRole("button", { name: /^RR\. HH\./ }).click();
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

test("Accesibilidad: texto, contraste y fondo se aplican, sobreviven a una recarga y se restablecen", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await page.goto("/home");
  const html = page.locator("html");
  await page.getByRole("button", { name: "Accesibilidad" }).click();
  const panel = page.getByRole("dialog", { name: "Accesibilidad" });
  await panel
    .getByRole("group", { name: "Tamaño del texto" })
    .getByRole("radio", { name: "Muy grande" })
    .check();
  await panel
    .getByRole("group", { name: "Contraste" })
    .getByRole("radio", { name: "Alto" })
    .check();
  await panel
    .getByRole("group", { name: "Fondo" })
    .getByRole("radio", { name: "Oscuro" })
    .check();
  await expect(html).toHaveAttribute("data-texto", "muy-grande");
  await expect(html).toHaveAttribute("data-contraste", "alto");
  await expect(html).toHaveAttribute("data-fondo", "oscuro");
  expect(await html.evaluate((e) => getComputedStyle(e).fontSize)).toBe("24px");

  // The head script restores the choice before the first paint, and the panel shows it.
  await page.reload();
  await expect(html).toHaveAttribute("data-fondo", "oscuro");
  await page.getByRole("button", { name: "Accesibilidad" }).click();
  await expect(panel.getByRole("radio", { name: "Oscuro" })).toBeChecked();
  await expect(
    page.getByRole("heading", { level: 1, name: "Resumen" }),
  ).toBeVisible();

  await panel.getByRole("button", { name: "Restablecer" }).click();
  for (const atributo of ["data-texto", "data-contraste", "data-fondo"])
    await expect(html).not.toHaveAttribute(atributo, /.+/);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("Accesibilidad: también está en el ingreso", async ({ page }) => {
  await demo(page, null);
  await page.goto("/");
  await page.getByRole("button", { name: "Accesibilidad" }).click();
  await page
    .getByRole("dialog", { name: "Accesibilidad" })
    .getByRole("radio", { name: "Grande", exact: true })
    .check();
  await expect(page.locator("html")).toHaveAttribute("data-texto", "grande");
});
