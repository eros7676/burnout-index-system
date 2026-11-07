import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { empleadosSemilla, reglasSemilla } from "../prisma/seed-data";
import { MAX_ARCHIVO_CSV, leerCsvImportacion } from "../src/server/services/csv-importacion";
import { validarCsvImportacion } from "../src/server/services/validacion-importacion";
import { validarCsvTareas, type RegistroSemana } from "../src/server/services/tareas-importacion";
import { validarCsvJornadas, type RegistroJornadas } from "../src/server/services/jornadas-importacion";

// Every demo company's files go through the real import validators, in the order RR. HH. imports
// them, and keep the invariants a day-first simulation guarantees across weeks.
const EMPRESAS = ["conecta"];
const ahora = new Date("2026-11-02T12:00:00Z");
const archivo = (empresa: string, nombre: string) => readFileSync(`templates/empresas/${empresa}/${nombre}`);
const base = {
  empleados: async () => empleadosSemilla,
  primeraVigencia: async () => reglasSemilla.effectiveFrom,
};

function semanas(empresa: string) {
  const opcional = (v: string | undefined) => (v ? Number(v) : null);
  return leerCsvImportacion(archivo(empresa, "indicadores.csv")).filas.map(({ celdas: c }, i) => ({
    employeeId: c.employee_id!,
    periodStart: c.period_start!,
    periodEnd: c.period_end!,
    recordId: `r-${i}`,
    periodoId: `p-${i}`,
    horasExtra: Number(c.horas_extra),
    horasTrabajadas: opcional(c.horas_trabajadas),
    diasConsecutivosSinDescanso: Number(c.dias_consecutivos_sin_descanso),
    diasDesdeUltimasVacaciones: opcional(c.dias_desde_ultimas_vacaciones),
    vacacionesPendientesDias: Number(c.vacaciones_pendientes_dias),
    tareasActivas: Number(c.tareas_activas),
    tareasPendientes: Number(c.tareas_pendientes),
    tareasVencidas: Number(c.tareas_vencidas),
    huellaTareas: null,
    huellaJornadas: null,
  }));
}

for (const empresa of EMPRESAS) {
  test(`${empresa}: los indicadores, las tareas y los días pasan la validación de importación y concilian`, async () => {
    const indicadores = await validarCsvImportacion(
      archivo(empresa, "indicadores.csv"),
      { ...base, registros: async () => [] },
      ahora,
    );
    assert.deepEqual(indicadores.errores, []);
    assert.deepEqual(indicadores.warnings, [], "no week asks to check its source");
    const filas = semanas(empresa);
    assert.equal(filas.length, 392, "49 people x 8 weeks");

    const tareas = await validarCsvTareas(
      archivo(empresa, "tareas.csv"),
      { ...base, semanas: async () => filas as RegistroSemana[] },
      ahora,
    );
    assert.equal(tareas.status, "VALIDADA", JSON.stringify(tareas.errores.slice(0, 3)));
    assert.equal(tareas.conciliacion.coinciden, 392);

    const dias = await validarCsvJornadas(
      archivo(empresa, "jornadas.csv"),
      { ...base, semanas: async () => filas as RegistroJornadas[] },
      ahora,
    );
    assert.equal(dias.status, "VALIDADA", JSON.stringify(dias.errores.slice(0, 3)));
    assert.equal(dias.conciliacion.coinciden, 392);
  });

  test(`${empresa}: la racha, los días desde vacaciones y el saldo siguen de una semana a la otra`, () => {
    const porPersona = Map.groupBy(semanas(empresa), (s) => s.employeeId);
    for (const [id, ws] of porPersona)
      ws.slice(1).forEach((w, i) => {
        const antes = ws[i]!;
        const donde = `${id} ${w.periodStart}`;
        // A streak either continued all week (+7) or restarted inside it (less than 7).
        assert.ok(
          w.diasConsecutivosSinDescanso === antes.diasConsecutivosSinDescanso + 7 ||
            w.diasConsecutivosSinDescanso < 7,
          `${donde}: racha ${antes.diasConsecutivosSinDescanso} → ${w.diasConsecutivosSinDescanso}`,
        );
        assert.ok(
          w.diasDesdeUltimasVacaciones === antes.diasDesdeUltimasVacaciones! + 7 ||
            w.diasDesdeUltimasVacaciones! < 7,
          `${donde}: vacaciones ${antes.diasDesdeUltimasVacaciones} → ${w.diasDesdeUltimasVacaciones}`,
        );
        assert.ok(w.vacacionesPendientesDias <= antes.vacacionesPendientesDias, `${donde}: saldo`);
      });
  });

  test(`${empresa}: hay semanas con licencia, con vacaciones y personas en carga sostenida`, () => {
    const texto = archivo(empresa, "jornadas.csv").toString();
    assert.ok((texto.match(/,LICENCIA,/g) ?? []).length >= 20, "leave to show on screen");
    assert.ok((texto.match(/,VACACIONES,/g) ?? []).length >= 20, "vacation blocks");
    assert.ok(semanas(empresa).some((s) => s.diasConsecutivosSinDescanso >= 14), "a sustained case");
    assert.ok(archivo(empresa, "jornadas.csv").byteLength < MAX_ARCHIVO_CSV);
  });

  test(`${empresa}: los archivos son los que produce el generador`, () => {
    const r = spawnSync(process.execPath, ["scripts/demo-empresa.mjs", empresa, "--check"], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
  });
}
