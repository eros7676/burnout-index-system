import { readFile, writeFile } from "node:fs/promises";
import { hostname, cpus, totalmem } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect, importar } from "./fixtures";
import type { FilaTablero, Pagina, ResumenDTO } from "../src/shared/contracts";
import { reglasMock } from "../src/shared/mocks";

test("fallo técnico posterior al commit y recuperación desde la interfaz sin duplicados", async ({
  page,
  db,
}) => {
  await page.goto("/importaciones");
  await page
    .getByLabel("Archivo CSV", { exact: true })
    .setInputFiles("templates/ejemplo-dos-semanas.csv");
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await expect(
    page.getByRole("heading", { name: "Vista previa · Validada" }),
  ).toBeVisible();
  // Fallo controlado exclusivo de esta base: nunca se añade una puerta de fallo a la API.
  try {
    await db.configuracionIndice.update({
      where: { version: "v1" },
      data: { weights: {} },
    });
    await page.getByRole("button", { name: "Confirmar importación" }).click();
    await expect(
      page.getByText("Procesamiento: FALLIDO", { exact: true }),
    ).toBeVisible();
    expect(await db.registroLaboral.count()).toBe(2);
    expect(await db.evaluacion.count()).toBe(0);
    expect(await db.alerta.count()).toBe(0);
  } finally {
    await db.configuracionIndice.update({
      where: { version: "v1" },
      data: { weights: reglasMock.weights },
    });
  }
  await page.reload();
  await page
    .getByRole("button", { name: "Consultar estado", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reintentar procesamiento", exact: true })
    .click();
  await expect(
    page.getByText("Procesamiento: COMPLETADO", { exact: true }),
  ).toBeVisible();
  expect(await db.evaluacion.count()).toBe(2);
  expect(await db.alerta.count()).toBe(1);
  await page.goto("/home");
  await expect(
    page.getByRole("region", { name: "Resultados de evaluaciones" }),
  ).toContainText("91,21");
});

test("plantilla completa: rechazo atómico, cuatro niveles, ranking, resumen e idempotencia", async ({
  page,
  db,
  browser,
}, info) => {
  await page.goto("/importaciones");
  await page
    .getByLabel("Archivo CSV", { exact: true })
    .setInputFiles("tests/data/invalido_una_fila.csv");
  await page.getByRole("button", { name: "Validar CSV" }).click();
  await expect(
    page.getByRole("heading", { name: "Vista previa · Rechazada" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("tareas_vencidas");
  await expect(
    page.getByRole("button", { name: "Confirmar importación" }),
  ).toBeDisabled();
  expect(await db.registroLaboral.count()).toBe(0);
  const carga = await importar(page, "templates/indicadores.csv");
  expect(carga.resultado.insertados).toBe(138);
  expect(
    await db.empleado.count({ where: { activo: true, enCobertura: true } }),
  ).toBe(49);
  const filas: FilaTablero[] = [];
  for (const num of [1, 2]) {
    const r = await page.request.get(
      `/api/evaluaciones?page=${num}&pageSize=100`,
    );
    expect(r.ok()).toBe(true);
    const pagina: Pagina<FilaTablero> = await r.json();
    filas.push(...pagina.items);
  }
  const esperado = (
    await readFile("tests/data/resultados_esperados.csv", "utf8")
  )
    .trim()
    .split(/\r?\n/)
    .slice(1);
  expect(filas).toHaveLength(138);
  for (const linea of esperado) {
    const [id, semana, indice, nivel, alerta] = linea.split(",");
    const fila = filas.find(
      (f) => f.employeeId === id && f.periodStart === semana,
    )!;
    expect(fila, `${id}/${semana}`).toMatchObject({
      indice: Number(indice),
      nivel,
      actualizado: true,
      processingState: "COMPLETADO",
    });
    expect(Boolean(fila.alertId)).toBe(alerta === "SI");
  }
  await page.goto("/home");
  await page.getByLabel("Semana desde (lunes)").fill("2026-10-12");
  await page.getByLabel("Filas por página").selectOption("100");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  const tabla = page.getByRole("region", {
    name: "Resultados de evaluaciones",
  });
  const semana = filas.filter((f) => f.periodStart === "2026-10-12");
  await expect(tabla.getByRole("row")).toHaveCount(semana.length + 1);
  for (const nivel of ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"])
    await expect(tabla.getByText(nivel, { exact: true }).first()).toBeVisible();
  // Pico aislado conserva 83,71 pero sigue MEDIO, sin alerta.
  await page.getByLabel("Semana desde (lunes)").fill("2026-10-05");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  const pico = tabla.getByRole("row").filter({ hasText: "EMP-016" });
  await expect(pico).toContainText("83,71");
  await expect(pico).toContainText("MEDIO");
  await pico.getByRole("button", { name: "Ver informe", exact: true }).click();
  const detalle = page.getByRole("region", {
    name: "Informe individual",
    exact: true,
  });
  await expect(detalle).toContainText("NO_SOSTENIDO");
  await expect(detalle).toContainText("Sin alerta asociada");
  await page.getByRole("button", { name: "Cerrar informe" }).click();
  await page.getByLabel("Semana desde (lunes)").fill("2026-10-12");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await tabla
    .getByRole("row")
    .filter({ hasText: "EMP-017" })
    .getByRole("button", { name: "Ver informe", exact: true })
    .click();
  await expect(detalle).toContainText("Historial insuficiente");
  await page.getByRole("button", { name: "Cerrar informe" }).click();
  await tabla
    .getByRole("row")
    .filter({ hasText: "EMP-001" })
    .getByRole("button", { name: "Ver informe", exact: true })
    .click();
  await expect(detalle).toContainText("SOSTENIDO");
  await expect(detalle).toContainText("TL-01");
  await expect(
    detalle.getByRole("table").getByRole("row").nth(1),
  ).toContainText("HE · Horas extra");
  const resumen: ResumenDTO = await (
    await page.request.get("/api/resumen?periodStart=2026-10-12")
  ).json();
  expect(resumen.totalEvaluaciones).toBe(semana.length);
  for (const nivel of ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"] as const)
    expect(resumen.conteo[nivel]).toBe(
      semana.filter((f) => f.nivel === nivel).length,
    );
  const antes = [
    await db.registroLaboral.count(),
    await db.evaluacion.count(),
    await db.alerta.count(),
  ];
  expect(
    (
      await page.request.post(
        `/api/importaciones/${carga.previa.importId}/confirmar`,
        { data: {} },
      )
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(
        `/api/procesamientos/${carga.resultado.procesamiento.jobId}/reintentar`,
        { data: {} },
      )
    ).ok(),
  ).toBe(true);
  const repetida = await importar(page, "tests/data/identico_reordenado.csv");
  expect(repetida.resultado).toMatchObject({
    insertados: 0,
    omitidos: 138,
    procesamiento: null,
  });
  expect([
    await db.registroLaboral.count(),
    await db.evaluacion.count(),
    await db.alerta.count(),
  ]).toEqual(antes);
  const tiempos: number[] = [];
  for (let i = 0; i < 40; i++) {
    const start = performance.now();
    for (const ruta of ["evaluaciones?pageSize=100", "resumen", "alertas"])
      expect((await page.request.get(`/api/${ruta}`)).ok()).toBe(true);
    tiempos.push(performance.now() - start);
  }
  const p95 = [...tiempos].sort((a, b) => a - b)[
    Math.ceil(tiempos.length * 0.95) - 1
  ];
  await info.attach("rendimiento-138", {
    body: JSON.stringify(
      {
        navegador: browser.version(),
        proyecto: info.project.name,
        equipo: hostname(),
        cpu: cpus()[0]?.model,
        ramGB: totalmem() / 2 ** 30,
        filas: 138,
        bytes: (await readFile("templates/indicadores.csv")).length,
        validacionCalculoMs: carga.ms,
        consultasCompletasMs: tiempos,
        p95Ms: p95,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(carga.ms).toBeLessThanOrEqual(60_000);
  expect(p95).toBeLessThanOrEqual(3000);
  await page.goto("/home");
  await expect(
    page.getByRole("region", { name: "Resultados de evaluaciones" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("tablero.png"),
    fullPage: true,
  });
});

test("antecedente tardío y reglas por script preservan historial y superan alerta", async ({
  page,
  db,
}, info) => {
  await importar(page, "tests/data/fuera_de_orden_1_semana_2026-10-12.csv");
  await page.goto("/home");
  await expect(
    page.getByRole("region", { name: "Resultados de evaluaciones" }),
  ).toContainText("INCOMPLETO");
  await importar(page, "tests/data/fuera_de_orden_2_semana_2026-10-05.csv");
  expect(await db.evaluacion.count()).toBe(3);
  expect(await db.alerta.count({ where: { vigencia: "ACTIVA" } })).toBe(1);
  const historica = await db.evaluacion.findFirstOrThrow({
    where: {
      nivel: "INCOMPLETO",
      periodo: { periodStart: new Date("2026-10-12") },
    },
  });
  const historico = await (
    await page.request.get(`/api/evaluaciones/${historica.evaluationId}`)
  ).json();
  expect(historico.evaluacion.vigente).toBe(false);
  const ruta = info.outputPath("reglas.json");
  const ejecutar = promisify(execFile);
  await writeFile(
    ruta,
    JSON.stringify({
      ...reglasMock,
      version: "t16-invalida",
      weights: { HE: 0, DS: 0, CT: 0, VP: 0 },
    }),
  );
  await expect(
    ejecutar(process.execPath, ["scripts/rules-publish.mjs", ruta], {
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
      windowsHide: true,
    }),
  ).rejects.toThrow();
  expect(
    await db.configuracionIndice.count({ where: { version: "t16-invalida" } }),
  ).toBe(0);
  await writeFile(
    ruta,
    JSON.stringify({
      ...reglasMock,
      version: "t16-nueva",
      effectiveFrom: "2026-10-12",
      highLimit: 99,
    }),
  );
  await ejecutar(process.execPath, ["scripts/rules-publish.mjs", ruta], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    windowsHide: true,
  });
  const job = await db.processingJob.findFirstOrThrow({
    where: { rulesVersion: "t16-nueva" },
  });
  await page.goto("/home");
  const tabla = page.getByRole("region", {
    name: "Resultados de evaluaciones",
  });
  await expect(tabla).toContainText("Desactualizado");
  await page.getByRole("link", { name: "Importar datos", exact: true }).click();
  await page.getByLabel("ID del procesamiento").fill(job.jobId);
  await page
    .getByRole("button", { name: "Consultar estado", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reintentar procesamiento", exact: true })
    .click();
  await expect(
    page.getByText("Procesamiento: COMPLETADO", { exact: true }),
  ).toBeVisible();
  await page.goto("/home");
  await expect(
    tabla.getByRole("row").filter({ hasText: "2026-10-12" }),
  ).toContainText("MEDIO");
  expect(await db.alerta.count({ where: { vigencia: "ACTIVA" } })).toBe(0);
  expect(await db.alerta.count({ where: { vigencia: "SUPERADA" } })).toBe(1);
  expect(await db.evaluacion.count()).toBe(4);
});

test("límite P0: 1000 filas, 49 evaluables y archivo de 5 MiB", async ({
  page,
  db,
  browser,
}, info) => {
  const plantilla = (await readFile("templates/indicadores.csv", "utf8"))
    .trim()
    .split(/\r?\n/);
  const empleados = [
    ...new Set(plantilla.slice(1).map((l) => l.split(",")[0])),
  ];
  const fecha = (dias: number) =>
    new Date(Date.UTC(2026, 0, 5 + dias)).toISOString().slice(0, 10);
  const filas = Array.from(
    { length: 1000 },
    (_, i) =>
      `${empleados[i % 49]},${fecha(Math.floor(i / 49) * 7)},${fecha(Math.floor(i / 49) * 7 + 6)},0,0,0,0,0,0,,`,
  );
  let csv = [plantilla[0], ...filas].join("\n");
  // Espacios válidos normalizados por T05: prueba el límite real de bytes sin alterar métricas.
  const pos = csv.indexOf("\n") + 1;
  csv =
    csv.slice(0, pos) +
    " ".repeat(5 * 1024 * 1024 - Buffer.byteLength(csv)) +
    csv.slice(pos);
  const buffer = Buffer.from(csv);
  expect(buffer.length).toBe(5 * 1024 * 1024);
  const carga = await importar(page, {
    name: "limite-p0.csv",
    mimeType: "text/csv",
    buffer,
  });
  expect(carga.resultado.insertados).toBe(1000);
  expect(await db.evaluacion.count()).toBe(1000);
  expect(await db.alerta.count()).toBe(0);
  await info.attach("rendimiento-limite", {
    body: JSON.stringify(
      {
        navegador: browser.version(),
        filas: 1000,
        bytes: buffer.length,
        validacionCalculoMs: carga.ms,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(carga.ms).toBeLessThanOrEqual(60_000);
});
