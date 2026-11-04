import { test, expect } from "@playwright/test";
import { demo } from "./demo";
import { organizacion } from "./organizacion-mocks";

// D12 (DESIGN.md): every chart mark has a readout on hover, keyboard and tap, and a tooltip
// follows WCAG 2.2 SC 1.4.13 — Escape dismisses it without moving the pointer or focus.

const burbuja = (page: import("@playwright/test").Page) =>
  page.locator("[data-burbuja]");

test("D12: el índice por semana se recorre con el teclado y se lee en voz alta", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  await page.goto("/employees/EMP-001");
  const grafico = page.getByRole("group", { name: /^Índice por semana/ });
  await expect(grafico).toBeVisible();

  // One tab stop: focusing the chart opens the latest week; arrows move, Escape hides.
  await grafico.focus();
  await expect(burbuja(page)).toBeVisible();
  await page.keyboard.press("Home");
  await expect(burbuja(page)).toContainText("Índice");
  await expect(grafico.locator("[aria-live]")).not.toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(burbuja(page)).toHaveCount(0);
  await expect(grafico).toBeFocused();
});

test("D12: un nivel explica su regla al pasar el cursor, sin cambiar el texto de la celda", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  await page.goto("/employees/EMP-001");
  const grafico = page.getByRole("group", { name: /^Índice por semana/ });
  await expect(grafico).toBeVisible();

  // Hover a week's slot: the readout names the week; moving away closes it.
  const semana = grafico.locator("[data-actual]").first();
  await semana.hover();
  await expect(burbuja(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(burbuja(page)).toHaveCount(0);

  const tag = page.getByText("Alto", { exact: true }).first();
  await tag.hover();
  await expect(burbuja(page)).toContainText("dos semanas seguidas");
  await page.keyboard.press("Escape");
  await expect(burbuja(page)).toHaveCount(0);
});
