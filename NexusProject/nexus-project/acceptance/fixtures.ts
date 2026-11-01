import { test as base, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";

export const test = base.extend<{ db: PrismaClient }>({
  db: async ({ page }, ejecutarPrueba) => {
    const db = new PrismaClient({
      datasourceUrl: process.env.TEST_DATABASE_URL,
    });
    const imports: string[] = [];
    let preparada = false;
    const lecturas: Promise<void>[] = [];
    const guardar = (body: {
      importId?: string;
      vistaPrevia?: { importId?: string };
    }) => {
      const id = body.importId ?? body.vistaPrevia?.importId;
      if (id) imports.push(id);
    };
    page.on("response", (r) => {
      if (new URL(r.url()).pathname === "/api/importaciones/validar")
        lecturas.push(r.json().then(guardar));
    });
    try {
      // Ninguna prueba borra datos ajenos para fabricar una base limpia.
      expect(
        await db.importacion.count(),
        "T16 requiere una base exclusiva vacía de importaciones",
      ).toBe(0);
      expect(await db.registroLaboral.count()).toBe(0);
      expect(
        await db.configuracionIndice.count({
          where: { version: { startsWith: "t16-" } },
        }),
      ).toBe(0);
      preparada = true;
      await db.$transaction((tx) => sembrarBase(tx));
      await ejecutarPrueba(db);
    } finally {
      await Promise.all(lecturas);
      try {
        const importId = { in: imports };
        const periodos = await db.periodoEmpleado.findMany({
          where: { registros: { some: { sourceImportId: importId } } },
        });
        const periodoId = { in: periodos.map((p) => p.periodoId) };
        if (preparada)
          await db.$transaction(
            async (tx) => {
              await tx.processingJobPar.deleteMany({
                where: {
                  job: {
                    OR: [
                      { importId },
                      { rulesVersion: { startsWith: "t16-" } },
                    ],
                  },
                },
              });
              await tx.processingJob.deleteMany({
                where: {
                  OR: [{ importId }, { rulesVersion: { startsWith: "t16-" } }],
                },
              });
              await tx.alerta.deleteMany({
                where: { evaluacion: { periodoId } },
              });
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
              await tx.configuracionIndice.deleteMany({
                where: { version: { startsWith: "t16-" } },
              });
            },
            { timeout: 30_000 },
          );
      } finally {
        await db.$disconnect();
      }
    }
  },
});
export { expect };

export async function importar(
  page: Page,
  archivo: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto("/importaciones");
  await page.getByLabel("Archivo CSV", { exact: true }).setInputFiles(archivo);
  const start = performance.now();
  const previa = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/importaciones/validar",
  );
  await page.getByRole("button", { name: "Validar CSV" }).click();
  const response = await previa;
  const body = await response.json();
  expect(response.status()).toBe(200);
  const confirmacion = page.waitForResponse((r) =>
    r.url().endsWith("/confirmar"),
  );
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  const confirmada = await confirmacion;
  expect(confirmada.status()).toBe(200);
  const resultado = await confirmada.json();
  expect(resultado.procesamiento?.estado ?? "COMPLETADO").toBe("COMPLETADO");
  await expect(
    page.getByRole("heading", { name: "Datos confirmados" }),
  ).toBeVisible();
  return { previa: body, resultado, ms: performance.now() - start };
}
