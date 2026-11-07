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
import { crearAzar } from "./lib/azar.mjs";
import { crearTareas } from "./lib/tareas-demo.mjs";

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

// Work of a field-service operations team (site visits, equipment, networks, power).
const SEDES = ["Norte", "Sur", "Centro", "Este", "Oeste"];
const titulos = (elegir) => [
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

export function generar() {
  const azar = crearAzar(20261103);
  const tareasDePersona = crearTareas({
    azar,
    prefijo: "OPS-",
    titulos: titulos(azar.elegir),
    origenes: ORIGENES,
    ref: (id) => `https://tareas.example/ordenes/${id}`,
  });
  const lineas = [COLUMNAS.join(",")];
  for (const [id, semanas] of leerResumen())
    for (const fila of tareasDePersona(id, semanas))
      lineas.push(fila.join(","));
  return lineas.join("\n") + "\n";
}

const contenido = generar();
if (process.argv.includes("--check")) {
  // A Windows checkout with autocrlf stores the file with CRLF; the content is the same.
  if (readFileSync(SALIDA, "utf8").replaceAll("\r\n", "\n") !== contenido) {
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
