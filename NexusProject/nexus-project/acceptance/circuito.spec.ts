import { readFile, writeFile } from "node:fs/promises";
import { hostname, cpus, totalmem } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";
import { test, expect, importar } from "./fixtures";
import type { FilaTablero, Pagina, ResumenDTO } from "../src/shared/contracts";
import { reglasMock } from "../src/shared/mocks";

/** One week's row in a person's page (/employees/[employeeId]). */
async function semanaDe(page: Page, employeeId: string, semana: string) {
  await page.goto(`/employees/${employeeId}`);
  const tabla = page.getByRole("region", { name: /^Semanas de / });
  await expect(tabla).toBeVisible();
  return tabla.getByRole("row").filter({ hasText: semana });
}
/** Opens the report of one week from the person's page. */
async function informeDe(page: Page, employeeId: string, semana: string) {
  const fila = await semanaDe(page, employeeId, semana);
  await fila.getByRole("link", { name: `Ver informe de ${semana}` }).click();
  await expect(
    page.getByRole("region", { name: "Resultado de la semana" }),
  ).toBeVisible();
}
const procesamiento = (page: Page) =>
  page.getByRole("region", { name: "Procesamiento" }).getByRole("status");
const archivo = (page: Page) => page.getByLabel("Archivo CSV", { exact: true });
const validar = (page: Page) =>
  page.getByRole("button", { name: "Validar archivo" });
const confirmar = (page: Page) =>
  page.getByRole("button", { name: "Confirmar importación" });
const previa = (page: Page) =>
  page.getByRole("region", { name: "Vista previa" });

test("fallo técnico posterior al commit y recuperación desde la interfaz sin duplicados", async ({
  page,
  db,
}) => {
  await page.goto("/importaciones");
  await archivo(page).setInputFiles("templates/ejemplo-dos-semanas.csv");
  await validar(page).click();
  await expect(previa(page)).toContainText("Validada");
  // Fallo controlado exclusivo de esta base: nunca se añade una puerta de fallo a la API.
  try {
    await db.configuracionIndice.update({
      where: { version: "v1" },
      data: { weights: {} },
    });
    await confirmar(page).click();
    await expect(procesamiento(page)).toContainText("Con error");
    // The data is confirmed even though its calculation failed.
    await expect(
      page.getByRole("region", { name: "Importación confirmada" }),
    ).toContainText(/Guardadas\s*2/);
    await expect(page.getByRole("link", { name: "Ver resumen" })).toHaveCount(
      0,
    );
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
  await expect(procesamiento(page)).toContainText("Con error");
  await page
    .getByRole("button", { name: "Reintentar procesamiento", exact: true })
    .click();
  await expect(procesamiento(page)).toContainText("Completado");
  expect(await db.evaluacion.count()).toBe(2);
  expect(await db.alerta.count()).toBe(1);
  await expect(await semanaDe(page, "EMP-001", "12–18 oct 2026")).toContainText(
    /Alto\s*91,21/,
  );
});

test("plantilla completa: rechazo atómico, cuatro niveles, ranking, resumen e idempotencia", async ({
  page,
  db,
  browser,
}, info) => {
  await page.goto("/importaciones");
  await archivo(page).setInputFiles("tests/data/invalido_una_fila.csv");
  await validar(page).click();
  await expect(previa(page)).toContainText("Rechazada");
  // The rejected row is named by row and field, in words.
  const errores = page.getByRole("region", { name: "Errores del archivo" });
  await expect(errores.getByRole("row").nth(1)).toContainText(
    /^85\s*Tareas vencidas/,
  );
  await expect(confirmar(page)).toBeDisabled();
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

  // The four levels of the newest week, as the Personas list filters them.
  const semana = filas.filter((f) => f.periodStart === "2026-10-12");
  await page.goto("/employees");
  const lista = page.getByRole("region", { name: "Personas", exact: true });
  await expect(page.getByRole("combobox", { name: "Semana" })).toHaveValue(
    "2026-10-12",
  );
  // The list is the whole active staff, paged by 50: the 49 evaluable people plus those outside the coverage.
  const activas = await db.empleado.count({ where: { activo: true } });
  expect(activas).toBeGreaterThanOrEqual(49);
  await expect(lista.getByRole("row")).toHaveCount(Math.min(activas, 50) + 1);
  for (const [nivel, etiqueta] of [
    ["BAJO", "Bajo"],
    ["MEDIO", "Medio"],
    ["ALTO", "Alto"],
    ["INCOMPLETO", "Incompleto"],
  ] as const) {
    const cuantas = semana.filter((f) => f.nivel === nivel).length;
    expect(cuantas, nivel).toBeGreaterThan(0);
    await page
      .getByRole("combobox", { name: "Nivel" })
      .selectOption({ label: etiqueta });
    await expect(lista.getByRole("row")).toHaveCount(cuantas + 1);
  }
  await page.goto("/home");
  await expect(
    page
      .getByRole("region", { name: "Personas en nivel Alto" })
      .getByRole("row"),
  ).toHaveCount(semana.filter((f) => f.nivel === "ALTO").length + 1);

  // Pico aislado conserva 83,71 pero sigue MEDIO, sin alerta.
  await expect(await semanaDe(page, "EMP-016", "5–11 oct 2026")).toContainText(
    /Medio\s*83,71/,
  );
  await informeDe(page, "EMP-016", "5–11 oct 2026");
  await expect(
    page.getByRole("region", { name: "Semana anterior" }),
  ).toContainText(
    "No se sostiene una carga alta dos semanas seguidas con factores en común.",
  );
  await expect(page.getByRole("region", { name: "Alerta" })).toContainText(
    "Esta semana no generó una alerta.",
  );
  // A gap in history: Incompleto keeps its index and says why.
  await informeDe(page, "EMP-017", "12–18 oct 2026");
  await expect(
    page.getByRole("region", { name: "Resultado de la semana" }),
  ).toContainText(/89,34[\s\S]*Incompleto/);
  await expect(
    page.getByRole("region", { name: "Semana anterior" }),
  ).toContainText(
    "No hay semana anterior para confirmar si la carga se sostiene.",
  );
  await informeDe(page, "EMP-001", "12–18 oct 2026");
  await expect(
    page.getByRole("region", { name: "Semana anterior" }),
  ).toContainText(
    "La carga alta se sostiene dos semanas seguidas, con factores en común.",
  );
  await expect(page.getByRole("region", { name: "Alerta" })).toContainText(
    "Team Lead ficticio 1",
  );
  await expect(
    page
      .getByRole("region", { name: "Factores, por aporte al índice" })
      .getByRole("rowheader")
      .first(),
  ).toContainText("Horas extra");

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
  // A complete read of the board: the people series the screens use, plus the
  // evaluations, summary and alerts of the P0 contract.
  const tiempos: number[] = [];
  for (let i = 0; i < 40; i++) {
    const start = performance.now();
    for (const ruta of [
      "evaluaciones?pageSize=100",
      "resumen",
      "alertas",
      "personas",
    ])
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
    page.getByRole("region", { name: "Personas en nivel Alto" }),
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
  await expect(await semanaDe(page, "EMP-019", "12–18 oct 2026")).toContainText(
    "Incompleto",
  );
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
  // The superseded result keeps its level, labelled as historical.
  await page.goto(`/reports/${historica.evaluationId}`);
  await expect(
    page.getByRole("region", { name: "Resultado de la semana" }),
  ).toContainText("Resultado histórico");
  await expect(
    page.getByRole("link", { name: "Ver el resultado actual" }),
  ).toBeVisible();
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
  // Pending recalculation: the old Alto is never shown as the current level.
  const desactualizada = await semanaDe(page, "EMP-019", "12–18 oct 2026");
  await expect(desactualizada).toContainText("Desactualizado");
  await expect(desactualizada).not.toContainText("Alto");
  await page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: "Importar datos" })
    .click();
  const campo = page.getByLabel("Código del procesamiento");
  const resumenRecuperar = page.getByText("¿Se interrumpió un procesamiento?");
  await expect(resumenRecuperar).toBeVisible();
  // The screen opens this section by itself when a job id was stored (right after it mounts),
  // so it is opened by hand only while it stays closed.
  await expect(async () => {
    if (!(await campo.isVisible())) await resumenRecuperar.click();
    await expect(campo).toBeVisible({ timeout: 1000 });
  }).toPass();
  await campo.fill(job.jobId);
  await page
    .getByRole("button", { name: "Consultar estado", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reintentar procesamiento", exact: true })
    .click();
  await expect(procesamiento(page)).toContainText("Completado");
  await expect(await semanaDe(page, "EMP-019", "12–18 oct 2026")).toContainText(
    "Medio",
  );
  expect(await db.alerta.count({ where: { vigencia: "ACTIVA" } })).toBe(0);
  expect(await db.alerta.count({ where: { vigencia: "SUPERADA" } })).toBe(1);
  expect(await db.evaluacion.count()).toBe(4);
  // The report of the superseded Alto shows its alert as superseded.
  const alta = await db.evaluacion.findFirstOrThrow({
    where: { nivel: "ALTO", periodo: { periodStart: new Date("2026-10-12") } },
  });
  await page.goto(`/reports/${alta.evaluationId}`);
  await expect(
    page.getByRole("region", { name: "Resultado de la semana" }),
  ).toContainText("Resultado histórico");
  await expect(page.getByRole("region", { name: "Alerta" })).toContainText(
    "Superada",
  );
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
