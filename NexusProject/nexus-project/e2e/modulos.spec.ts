import { test, expect } from "@playwright/test";
import type { MisDatosDTO } from "../src/shared/contracts";
import {
  alerta,
  api,
  celda,
  datos,
  demo,
  menu,
  sinDesbordeHorizontal,
} from "./demo";

// The read-only modules: Reglas del índice and Mis datos. Auditoría has its own spec (auditoria.spec.ts).

test("Reglas: un Team Lead las lee en palabras, sin controles para editarlas", async ({
  page,
}) => {
  await demo(page, "demo-tl-01");
  await page.goto("/home");
  await menu(page).getByRole("link", { name: "Reglas del índice" }).click();
  await expect(page).toHaveURL(/\/rules-config$/);
  await expect(
    page.getByText("Versión v1, vigente desde el 5 ene 2026."),
  ).toBeVisible();
  const factores = page.getByRole("region", { name: "Factores del índice" });
  for (const [factor, umbral, peso] of [
    ["Horas extra", "8 h", "30 %"],
    ["Días seguidos sin descanso", "6 días", "30 %"],
    ["Carga de tareas", "0,35", "25 %"],
    ["Vacaciones pendientes", "10 días", "15 %"],
  ]) {
    await expect(await celda(factores, factor, "Umbral")).toHaveText(umbral);
    await expect(await celda(factores, factor, "Peso en el índice")).toHaveText(
      peso,
    );
  }
  const main = page.getByRole("main");
  await expect(main).toContainText("Índice menor a 40.");
  await expect(main).toContainText(
    "Índice de 70 o más dos semanas seguidas, con al menos 2 factores superados en las dos.",
  );
  await expect(
    page.getByRole("region", { name: "Versiones de las reglas" }),
  ).toContainText("Vigente");
  // Read-only: no field, no action, no codes or raw values.
  for (const rol of [
    "textbox",
    "spinbutton",
    "slider",
    "checkbox",
    "radio",
    "combobox",
    "button",
  ] as const)
    await expect(main.getByRole(rol)).toHaveCount(0);
  // innerText and :visible: Next keeps the previous route mounted but hidden.
  await expect(main.locator("form:visible")).toHaveCount(0);
  await expect(main).not.toContainText(/\b(HE|DS|CT|VP)\b|0\.3|0\.35/, {
    useInnerText: true,
  });
});

test("Mis datos: el empleado ve sus semanas con horas y tareas, y ningún índice ni nivel", async ({
  page,
}) => {
  await demo(page, "demo-empleado");
  const lecturas: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (datos(url)) lecturas.push(url.pathname);
  });
  const misDatos: MisDatosDTO = {
    nombre: "Persona ficticia 001",
    equipo: "Célula ficticia 1",
    semanas: [
      {
        periodStart: "2026-10-12",
        periodEnd: "2026-10-18",
        horasExtra: 16,
        diasConsecutivosSinDescanso: 16,
        tareasActivas: 10,
        tareasPendientes: 7,
        tareasVencidas: 5,
        vacacionesPendientesDias: 14,
        horasTrabajadas: 56,
        diasDesdeUltimasVacaciones: 127,
      },
      {
        periodStart: "2026-10-05",
        periodEnd: "2026-10-11",
        horasExtra: 7.5,
        diasConsecutivosSinDescanso: 1,
        tareasActivas: 12,
        tareasPendientes: 8,
        tareasVencidas: 0,
        vacacionesPendientesDias: 14,
        horasTrabajadas: null,
        diasDesdeUltimasVacaciones: 120,
      },
    ],
  };
  let falla = true;
  await page.route(api("/api/mis-datos"), (route) =>
    falla ? route.abort() : route.fulfill({ json: misDatos }),
  );
  await page.goto("/my-data");
  await expect(alerta(page)).toContainText("No se pudo conectar");
  falla = false;
  await alerta(page).getByRole("button", { name: "Reintentar" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Persona ficticia 001" }),
  ).toBeVisible();
  const tabla = page.getByRole("region", { name: "Sus datos por semana" });
  await expect(
    tabla
      .getByRole("row")
      .filter({ hasText: "12–18 oct 2026" })
      .getByRole("cell"),
  ).toHaveText(["56 h", "16 h", "16 días", "10", "7", "5", "14 días"]);
  await expect(
    tabla
      .getByRole("row")
      .filter({ hasText: "5–11 oct 2026" })
      .getByRole("cell"),
  ).toHaveText(["—", "7,5 h", "1 día", "12", "8", "0", "14 días"]);
  await expect(
    page.getByRole("table", { name: "Horas por semana" }),
  ).toContainText("56 h");

  // RF10: nothing on the page states an index or a level, not even the shell.
  await expect(menu(page).getByRole("link")).toHaveText(["Mis datos"]);
  await expect(page.locator("[data-nivel]")).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: /índice|nivel/i }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /\b(Bajo|Medio|Alto|Incompleto|Desactualizado)\b|Sin evaluación|\d+,\d\d(?! h)/,
  );
  await expect(page.getByRole("link", { name: "Cómo se calcula" })).toHaveCount(
    0,
  );
  // The weeks and the tasks are two reads of the session's own person; nothing else is asked.
  expect([...new Set(lecturas)].sort()).toEqual([
    "/api/mis-datos",
    "/api/mis-datos/tareas",
  ]);
});

test("Módulos de lectura: en pantalla angosta no desbordan la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [usuario, ruta, tabla] of [
    ["demo-tl-01", "/rules-config", "Factores del índice"],
    ["demo-empleado", "/my-data", "Sus datos por semana"],
  ] as const) {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await demo(page, usuario);
    await page.goto(ruta);
    await expect(page.getByRole("region", { name: tabla })).toBeVisible();
    await sinDesbordeHorizontal(page);
  }
});
