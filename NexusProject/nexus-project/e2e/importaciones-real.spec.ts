import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";

test("T06/T14/T12 real: importar, consultar y simular fallo/reintento sin duplicar alerta con MySQL", async ({
  page,
}) => {
  test.skip(
    !process.env.TEST_DATABASE_URL,
    "Requiere MySQL aislado migrado en TEST_DATABASE_URL.",
  );
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const imports: string[] = [];
  const lecturas: Promise<void>[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith("/api/importaciones/validar")) {
      lecturas.push(
        response.json().then((body) => {
          const id = body.importId ?? body.vistaPrevia?.importId;
          if (typeof id === "string") imports.push(id);
        }),
      );
    }
  });
  const archivo = page.getByLabel("Archivo CSV", { exact: true });
  const validar = page.getByRole("button", { name: "Validar archivo" });
  const confirmar = page.getByRole("button", { name: "Confirmar importación" });
  const previa = page.getByRole("region", { name: "Vista previa" });
  const confirmada = page.getByRole("region", {
    name: "Importación confirmada",
  });
  const procesamiento = page.getByRole("region", { name: "Procesamiento" });
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    expect(await db.registroLaboral.count()).toBe(0); // Nunca borra ni reutiliza datos existentes.
    await page.request.post("/api/demo/sesion", {
      data: { userId: "demo-rrhh" },
    });

    // T06: a rejected file saves nothing and cannot be confirmed.
    await page.goto("/importaciones");
    await archivo.setInputFiles("tests/data/invalido_una_fila.csv");
    await validar.click();
    await expect(previa).toContainText("Rechazada");
    await expect(
      page.getByRole("region", { name: "Errores del archivo" }),
    ).toContainText("Tareas vencidas");
    await expect(confirmar).toBeDisabled();
    expect(await db.registroLaboral.count()).toBe(0);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(
      page.getByText("Vista previa cancelada.", { exact: false }),
    ).toBeVisible();

    await archivo.setInputFiles("templates/ejemplo-dos-semanas.csv");
    await validar.click();
    await expect(previa).toContainText("Validada");
    await confirmar.click();
    await expect(procesamiento.getByRole("status")).toContainText("Completado");
    await expect(confirmada).toContainText(/Guardadas\s*2\s*filas nuevas/);
    await expect(confirmada).toContainText(/Omitidas\s*0/);
    expect(await db.registroLaboral.count()).toBe(2);
    const evaluaciones = await db.evaluacion.findMany({
      orderBy: { periodo: { periodStart: "asc" } },
    });
    expect(evaluaciones.map((e) => e.nivel)).toEqual(["INCOMPLETO", "ALTO"]);
    expect(evaluaciones.map((e) => Number(e.indice))).toEqual([83.71, 91.21]);
    expect(await db.alerta.count()).toBe(1);

    // T14: the persisted results, read back through the new screens.
    await page.getByRole("link", { name: "Ver resumen" }).click();
    await expect(page).toHaveURL(/\/home$/);
    const enAlto = page.getByRole("region", { name: "Personas en nivel Alto" });
    await expect(enAlto).toContainText("Persona ficticia 001");
    await expect(enAlto.getByRole("link", { name: "91,21" })).toBeVisible();
    await expect(
      page.getByText(/^Índice promedio 91,21 sobre 1 evaluación/),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Semana" })
      .selectOption("2026-10-05");
    await expect(page.getByText("Ninguna persona en nivel Alto esta semana")).toBeVisible();

    await page.goto("/employees/EMP-001");
    const semanas = page.getByRole("region", {
      name: "Semanas de Persona ficticia 001",
    });
    await expect(
      semanas.getByRole("row").filter({ hasText: "12–18 oct 2026" }),
    ).toContainText(/Alto\s*91,21/);
    await expect(
      semanas.getByRole("row").filter({ hasText: "5–11 oct 2026" }),
    ).toContainText(/Incompleto\s*83,71/);
    await semanas
      .getByRole("link", { name: "Ver informe de 12–18 oct 2026" })
      .click();
    await expect(
      page.getByRole("region", { name: "Resultado de la semana" }),
    ).toContainText("91,21");
    await expect(
      page
        .getByRole("region", { name: "Factores, por aporte al índice" })
        .getByRole("rowheader")
        .first(),
    ).toContainText("Horas extra");
    await expect(
      page.getByRole("region", { name: "Semana anterior" }),
    ).toContainText("La carga alta se sostiene dos semanas seguidas");
    const seccionAlerta = page.getByRole("region", { name: "Alerta" });
    await expect(seccionAlerta).toContainText("Team Lead ficticio 1");
    await expect(seccionAlerta).toContainText("Solo aviso interno");
    await page.screenshot({
      path: "test-results/t14-real.png",
      fullPage: true,
    });

    // T06: the same file again inserts nothing and needs no calculation.
    await page.goto("/importaciones");
    await archivo.setInputFiles("templates/ejemplo-dos-semanas.csv");
    await validar.click();
    await expect(
      page.getByText("Todos los registros ya existen.", { exact: false }),
    ).toBeVisible();
    await confirmar.click();
    await expect(confirmada).toContainText(/Guardadas\s*0/);
    await expect(confirmada).toContainText(/Omitidas\s*2/);
    await expect(confirmada).toContainText(
      "No hay semanas nuevas para calcular.",
    );
    expect(await db.registroLaboral.count()).toBe(2);
    expect(await db.evaluacion.count()).toBe(2);
    expect(await db.alerta.count()).toBe(1);

    // T12: the answer to processing is lost; the pending attempt lives in the database.
    // The simulated mail is on the alert's page, which the list's person links to.
    await page.goto("/alerts");
    await expect(page.getByRole("status").filter({ hasText: /^1 alerta$/ })).toBeVisible();
    await page
      .getByRole("region", { name: "Alertas activas" })
      .getByRole("link", { name: "Persona ficticia 001" })
      .click();
    await expect(page).toHaveURL(/\/alerts\/[^/]+$/);
    const correo = page.getByRole("region", { name: "Correo simulado" });
    const historial = correo.getByRole("list", {
      name: "Historial de envíos simulados",
    });
    await page.route("**/procesar", (route) => route.abort());
    await correo.getByRole("button", { name: "Simular envío fallido" }).click();
    await expect(correo.getByRole("alert")).toContainText(
      "No se pudo conectar",
    );
    await page.unroute("**/procesar");
    // Recargar demuestra que el pendiente se recupera desde la base.
    await page.reload();
    await expect(historial.getByRole("listitem")).toHaveText([
      /Intento 1.*Pendiente de procesar/,
    ]);
    await correo
      .getByRole("button", { name: "Procesar envío pendiente" })
      .click();
    await expect(historial.getByRole("listitem")).toHaveText([
      /Intento 1.*Fallido \(simulado\)/,
    ]);
    await correo.getByRole("button", { name: "Simular envío exitoso" }).click();
    await expect(historial.getByRole("listitem")).toHaveText([
      /Intento 2.*Enviado \(simulado\)/,
      /Intento 1.*Fallido \(simulado\)/,
    ]);
    await page.reload();
    await expect(historial.getByRole("listitem").first()).toContainText(
      "Enviado (simulado)",
    );
    await expect(correo.getByRole("button", { name: /^Simular/ })).toHaveCount(
      0,
    );
    await page.goto("/alerts");
    await expect(
      page.getByRole("region", { name: "Alertas activas" }),
    ).toContainText("Enviado (simulado)");
    expect(await db.alerta.count()).toBe(1);
    expect(await db.intentoNotificacion.count()).toBe(2);
    await page.screenshot({
      path: "test-results/t12-correo-real.png",
      fullPage: true,
    });
  } finally {
    await Promise.all(lecturas);
    const importId = { in: imports };
    const periodos = await db.periodoEmpleado.findMany({
      where: { registros: { some: { sourceImportId: importId } } },
    });
    const periodoId = { in: periodos.map((p) => p.periodoId) };
    try {
      await db.$transaction(async (tx) => {
        await tx.processingJobPar.deleteMany({ where: { job: { importId } } });
        await tx.processingJob.deleteMany({ where: { importId } });
        await tx.intentoNotificacion.deleteMany({
          where: { alerta: { evaluacion: { periodoId } } },
        });
        await tx.alerta.deleteMany({ where: { evaluacion: { periodoId } } });
        await tx.periodoEmpleado.updateMany({
          where: { periodoId },
          data: { registroVigenteId: null, evaluacionVigenteId: null },
        });
        await tx.evaluacion.updateMany({
          where: { periodoId },
          data: { supersedesEvaluationId: null },
        });
        await tx.evaluacion.deleteMany({ where: { periodoId } });
        await tx.registroLaboral.deleteMany({ where: { periodoId } });
        await tx.periodoEmpleado.deleteMany({ where: { periodoId } });
        await tx.importacionTemporal.deleteMany({ where: { importId } });
        await tx.importacion.deleteMany({ where: { importId } });
      });
    } finally {
      await db.$disconnect();
    }
  }
});
