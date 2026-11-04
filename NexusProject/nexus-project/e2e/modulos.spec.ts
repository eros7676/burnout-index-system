import { test, expect } from "@playwright/test";
import type { MisDatosDTO } from "../src/shared/contracts";
import {
  alerta,
  api,
  datos,
  demo,
  menu,
  sinDesbordeHorizontal,
} from "./demo";

// The read-only module: Mis datos. Auditoría and Reglas del índice have their own specs
// (auditoria.spec.ts, reglas.spec.ts), narrow screen included.

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
  // The chart plots extra hours; its finding names the latest week with hours loaded.
  await expect(
    page.getByRole("table", { name: "Horas extra por semana" }),
  ).toContainText("16 h");
  await expect(page.getByText("12–18 oct 2026: 16 h extra sobre 56 h trabajadas.")).toBeVisible();

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
    ["demo-empleado", "/my-data", "Sus datos por semana"],
  ] as const) {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await demo(page, usuario);
    await page.goto(ruta);
    await expect(page.getByRole("region", { name: tabla })).toBeVisible();
    await sinDesbordeHorizontal(page);
  }
});
