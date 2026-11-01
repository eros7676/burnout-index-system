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
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    expect(await db.registroLaboral.count()).toBe(0); // Nunca borra ni reutiliza datos existentes.
    await page.request.post("/api/demo/sesion", {
      data: { userId: "demo-rrhh" },
    });
    await page.goto("/importaciones");
    await page
      .getByLabel("Archivo CSV", { exact: true })
      .setInputFiles("tests/data/invalido_una_fila.csv");
    await page.getByRole("button", { name: "Validar CSV" }).click();
    await expect(
      page.getByRole("heading", { name: "Vista previa · Rechazada" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirmar importación" }),
    ).toBeDisabled();
    expect(await db.registroLaboral.count()).toBe(0);
    await page.getByRole("button", { name: "Cancelar vista previa" }).click();
    await page
      .getByLabel("Archivo CSV", { exact: true })
      .setInputFiles("templates/ejemplo-dos-semanas.csv");
    await page.getByRole("button", { name: "Validar CSV" }).click();
    await expect(
      page.getByRole("heading", { name: "Vista previa · Validada" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar importación" }).click();
    await expect(
      page.getByText("Procesamiento: COMPLETADO", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Insertados: 2 · Omitidos: 0", { exact: true }),
    ).toBeVisible();
    expect(await db.registroLaboral.count()).toBe(2);
    const evaluaciones = await db.evaluacion.findMany({
      orderBy: { periodo: { periodStart: "asc" } },
    });
    expect(evaluaciones.map((e) => e.nivel)).toEqual(["INCOMPLETO", "ALTO"]);
    expect(evaluaciones.map((e) => Number(e.indice))).toEqual([83.71, 91.21]);
    expect(await db.alerta.count()).toBe(1);
    await page.goto("/home");
    const tabla = page.getByRole("region", {
      name: "Resultados de evaluaciones",
    });
    await expect(
      tabla.getByRole("row").filter({ hasText: "INCOMPLETO" }),
    ).toContainText("83,71");
    await expect(
      tabla.getByRole("row").filter({ hasText: "ALTO" }),
    ).toContainText("91,21");
    await expect(
      page.getByText("Destinatario: TL-01", { exact: true }),
    ).toBeVisible();
    await tabla
      .getByRole("row")
      .filter({ hasText: "ALTO" })
      .getByRole("button", { name: "Ver informe", exact: true })
      .click();
    const detalle = page.getByRole("region", {
      name: "Informe individual",
      exact: true,
    });
    await expect(detalle).toContainText("91,21");
    await expect(detalle).toContainText("SOSTENIDO");
    await expect(detalle).toContainText("NO_APLICA");
    await expect(
      detalle.getByRole("table").getByRole("row").nth(1),
    ).toContainText("HE · Horas extra");
    await page.getByLabel("Semana desde (lunes)").fill("2026-10-12");
    await page.getByLabel("Empleado (ID)").fill("EMP-001");
    await page.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(tabla.getByRole("row")).toHaveCount(2);
    const resumen = page.getByRole("region", {
      name: "Resumen de evaluaciones",
    });
    await expect(resumen).toContainText("100% de las actualizadas");
    await page.screenshot({
      path: "test-results/t14-real.png",
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Importar datos", exact: true })
      .click();
    await page
      .getByLabel("Archivo CSV", { exact: true })
      .setInputFiles("templates/ejemplo-dos-semanas.csv");
    await page.getByRole("button", { name: "Validar CSV" }).click();
    await expect(
      page.getByText("Todos los registros ya existen.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar importación" }).click();
    await expect(
      page.getByText("Insertados: 0 · Omitidos: 2", { exact: true }),
    ).toBeVisible();
    expect(await db.registroLaboral.count()).toBe(2);
    expect(await db.evaluacion.count()).toBe(2);
    expect(await db.alerta.count()).toBe(1);
    await page.goto("/home");
    await expect(
      page
        .getByRole("region", { name: "Resultados de evaluaciones" })
        .getByRole("row"),
    ).toHaveCount(3);
    await expect(page.getByText("1 activas", { exact: true })).toBeVisible();
    const correo = page.getByLabel("Correo simulado", { exact: true });
    await correo
      .getByRole("button", { name: "Preparar fallo simulado" })
      .click();
    await expect(correo.getByRole("listitem")).toContainText("PENDIENTE");
    // Recargar demuestra que el pendiente se recupera desde la base.
    await page.reload();
    await correo
      .getByRole("button", { name: "Ver / actualizar intentos" })
      .click();
    await correo
      .getByRole("button", { name: "Procesar envío pendiente" })
      .click();
    await expect(correo.getByRole("listitem")).toContainText("FALLIDO");
    await correo
      .getByRole("button", { name: "Reintentar correo simulado" })
      .click();
    await correo
      .getByRole("button", { name: "Procesar envío pendiente" })
      .click();
    await expect(correo.getByRole("listitem").first()).toContainText(
      "Enviado (simulado)",
    );
    await expect(correo.getByRole("listitem")).toHaveCount(2);
    await page.reload();
    await correo
      .getByRole("button", { name: "Ver / actualizar intentos" })
      .click();
    await expect(correo.getByRole("listitem").first()).toContainText(
      "Enviado (simulado)",
    );
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
