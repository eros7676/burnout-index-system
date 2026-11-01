import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";

test("T06 real: CSV inválido, válido, repetido y cancelación desde Chromium con MySQL", async ({
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
    await page.getByRole("button", { name: "Nueva importación" }).click();
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
