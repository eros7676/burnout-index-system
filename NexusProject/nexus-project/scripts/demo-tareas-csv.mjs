// Writes templates/tareas-demo-ocho-semanas.csv: the task detail behind every employee-week of
// templates/demo-ocho-semanas.csv (tareas-v1). The summary file is the input, so the counts of
// each week reconcile by construction: A rows, of which A-P were completed in the week, P-V are
// open and not yet due, and V are open and due on or before the closing Sunday. Open tasks carry
// over from one week to the next with the same task_id, and a few are cancelled or reassigned,
// which the file marks with motivo_exclusion. Deterministic (fixed seed): running it twice
// produces the same file, and a re-import is skipped as identical. Fictional data only: no
// names, no health or family content.
//
//   node scripts/demo-tareas-csv.mjs          write the file
//   node scripts/demo-tareas-csv.mjs --check  fail if the file on disk differs from the output
import { readFileSync, writeFileSync } from "node:fs";

const ENTRADA = new URL("../templates/demo-ocho-semanas.csv", import.meta.url);
const SALIDA = new URL(
  "../templates/tareas-demo-ocho-semanas.csv",
  import.meta.url,
);
const COLUMNAS = [
  "employee_id",
  "period_start",
  "period_end",
  "task_id",
  "titulo",
  "origen",
  "origen_ref",
  "asignada_fecha",
  "vencimiento_fecha",
  "completada_fecha",
  "motivo_exclusion",
];

let semilla = 20261103;
function azar() {
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (min, max) => min + Math.floor(azar() * (max - min + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

const sumar = (iso, dias) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};

// Work of a field-service operations team (site visits, equipment, networks, power).
const SEDES = ["Norte", "Sur", "Centro", "Este", "Oeste"];
const TITULOS = [
  () => `Revisar el sistema de climatización de la sucursal ${elegir(SEDES)}`,
  (n) => `Reemplazar el router de acceso del nodo ${n}`,
  (n) => `Calibrar el medidor de presión de la planta ${n % 9 + 1}`,
  () => `Relevar el cableado estructurado del depósito ${elegir(SEDES)}`,
  (n) => `Programar el mantenimiento preventivo del UPS ${n}`,
  (n) => `Instalar el punto de acceso inalámbrico del piso ${n % 6 + 1}`,
  () => `Verificar el tablero eléctrico de la sucursal ${elegir(SEDES)}`,
  (n) => `Actualizar el firmware del controlador ${n}`,
  (n) => `Documentar el cierre de la visita técnica ${n}`,
  (n) => `Coordinar la ventana de corte con el cliente de la ruta ${n % 12 + 1}`,
  (n) => `Reponer los repuestos del vehículo ${n % 20 + 1}`,
  (n) => `Inspeccionar el grupo electrógeno de la planta ${n % 9 + 1}`,
  (n) => `Conciliar los partes de trabajo de la ruta ${n % 12 + 1}`,
  () => "Capacitar al equipo en el procedimiento de bloqueo y etiquetado",
  (n) => `Medir la potencia óptica del enlace ${n}`,
  (n) => `Cambiar el filtro del equipo de refrigeración ${n}`,
  () => "Revisar las alarmas pendientes del sistema de monitoreo",
  () => `Auditar el inventario de herramientas del taller ${elegir(SEDES)}`,
  (n) => `Probar la conmutación del sistema de respaldo ${n}`,
  (n) => `Cerrar el reclamo de garantía ${n}`,
  (n) => `Preparar el informe de la inspección ${n}`,
  (n) => `Reprogramar la visita pendiente del cliente ${n}`,
];
const ORIGENES = [
  "Mesa de ayuda",
  "Mesa de ayuda",
  "Planificador de visitas",
  "Planificador de visitas",
  "Gestión de mantenimiento",
];

/** Rows of the summary file, by person and week. */
function leerResumen() {
  const [cabecera, ...lineas] = readFileSync(ENTRADA, "utf8")
    .trim()
    .split(/\r?\n/);
  const col = Object.fromEntries(cabecera.split(",").map((c, i) => [c, i]));
  const personas = new Map();
  for (const linea of lineas) {
    const v = linea.split(",");
    const id = v[col.employee_id];
    if (!personas.has(id)) personas.set(id, []);
    personas.get(id).push({
      inicio: v[col.period_start],
      fin: v[col.period_end],
      activas: Number(v[col.tareas_activas]),
      pendientes: Number(v[col.tareas_pendientes]),
      vencidas: Number(v[col.tareas_vencidas]),
    });
  }
  for (const semanas of personas.values())
    semanas.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return personas;
}

let contador = 1000;
function nueva(campos) {
  const n = contador++;
  const origen = elegir(ORIGENES);
  return {
    id: `OPS-${n}`,
    // A reference number in the title that is not the task id, so the two never read alike.
    titulo: elegir(TITULOS)((n * 37) % 900 + 100),
    origen,
    ref: azar() < 0.75 ? `https://tareas.example/ordenes/OPS-${n}` : "",
    asignada: "",
    vence: null,
    completada: null,
    ...campos,
  };
}

/**
 * One person's weeks. `pool` holds the tasks still open at the previous close; each week keeps
 * as many of them open as its counts ask for and resolves the rest (completed first, then
 * cancelled or reassigned); anything missing is created.
 */
function tareasDePersona(id, semanas) {
  const filas = [];
  let pool = [];
  semanas.forEach((w, indice) => {
    const primera = indice === 0;
    const { inicio: S, fin: E } = w;
    const completadas = w.activas - w.pendientes;
    const alDia = w.pendientes - w.vencidas;
    const vencidasPool = pool.filter((t) => t.vence !== null && t.vence <= E);
    const alDiaPool = pool.filter((t) => t.vence === null || t.vence > E);
    const sigueVencida = vencidasPool.slice(0, w.vencidas);
    const sigueAlDia = alDiaPool.slice(0, alDia);
    const resueltas = [
      ...vencidasPool.slice(w.vencidas),
      ...alDiaPool.slice(alDia),
    ];

    const terminadas = resueltas.slice(0, completadas);
    for (const t of terminadas)
      t.completada = sumar(S, entre(0, 6));
    const excluidas = resueltas.slice(completadas);
    for (const t of excluidas)
      t.motivo = azar() < 0.5 ? "REASIGNADA" : "CANCELADA";
    // A completion cannot precede the assignment (carried tasks were assigned before S).
    for (let i = terminadas.length; i < completadas; i++) {
      const asignada = sumar(S, primera ? -entre(1, 10) : -entre(0, 6));
      const base = asignada > S ? asignada : S;
      const sugerida = sumar(base, entre(0, 6));
      const completada = sugerida > E ? E : sugerida;
      const limite = sumar(completada, entre(-3, 7));
      terminadas.push(
        nueva({
          asignada,
          completada,
          // Due dates never precede the assignment.
          vence: azar() < 0.9 ? (limite < asignada ? asignada : limite) : null,
        }),
      );
    }

    const frescasVencidas = Array.from(
      { length: w.vencidas - sigueVencida.length },
      () => {
        const vence = primera ? sumar(E, -entre(0, 21)) : sumar(E, -entre(0, 6));
        return nueva({ vence, asignada: sumar(vence, -entre(3, 14)) });
      },
    );
    const frescasAlDia = Array.from(
      { length: alDia - sigueAlDia.length },
      () =>
        nueva({
          vence: azar() < 0.9 ? sumar(E, entre(1, 14)) : null,
          asignada: sumar(E, -entre(0, primera ? 16 : 6)),
        }),
    );

    const numero = (t) => Number(t.id.slice(4));
    for (const t of [
      ...sigueVencida,
      ...sigueAlDia,
      ...frescasVencidas,
      ...frescasAlDia,
      ...terminadas,
      ...excluidas,
    ].sort((a, b) => numero(a) - numero(b)))
      filas.push({ semana: w, tarea: t, motivo: excluidas.includes(t) ? t.motivo : "" });
    pool = [...sigueVencida, ...sigueAlDia, ...frescasVencidas, ...frescasAlDia];
  });
  // Completion dates are final only after the last week: write every row now.
  return filas.map(({ semana, tarea, motivo }) => [
    id,
    semana.inicio,
    semana.fin,
    tarea.id,
    tarea.titulo,
    tarea.origen,
    tarea.ref,
    tarea.asignada,
    tarea.vence ?? "",
    tarea.completada ?? "",
    motivo,
  ]);
}

export function generar() {
  contador = 1000;
  semilla = 20261103;
  const lineas = [COLUMNAS.join(",")];
  for (const [id, semanas] of leerResumen())
    for (const fila of tareasDePersona(id, semanas))
      lineas.push(fila.join(","));
  return lineas.join("\n") + "\n";
}

const contenido = generar();
if (process.argv.includes("--check")) {
  if (readFileSync(SALIDA, "utf8") !== contenido) {
    console.error(
      "templates/tareas-demo-ocho-semanas.csv no coincide con el generador.",
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(SALIDA, contenido);
  console.log(
    `${contenido.trim().split("\n").length - 1} filas → templates/tareas-demo-ocho-semanas.csv`,
  );
}
