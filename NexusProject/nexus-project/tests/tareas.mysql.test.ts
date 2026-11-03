import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient, type EstadoTareaCierre } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { fechaParaDb } from "../src/server/repositories/fechas";
import { crearHttpTareas } from "../src/server/http/tareas";
import {
  confirmarImportacion,
  validarImportacion,
} from "../src/server/services/importaciones";
import type { UsuarioDemoDTO } from "../src/shared/contracts";
import type {
  HistorialTareaDTO,
  MisTareasDTO,
  SemanasConTareasDTO,
  TareasSemanaDTO,
} from "../src/shared/contratos/tareas";

const CAB =
  "employee_id,period_start,period_end,horas_extra,dias_consecutivos_sin_descanso,tareas_activas,tareas_pendientes,tareas_vencidas,vacaciones_pendientes_dias,horas_trabajadas,dias_desde_ultimas_vacaciones";
const W1 = { desde: "2026-10-05", hasta: "2026-10-11" };
const W2 = { desde: "2026-10-12", hasta: "2026-10-18" };
const W3 = { desde: "2026-10-19", hasta: "2026-10-25" };

type Fila = {
  taskId: string;
  titulo?: string;
  origenRef?: string | null;
  asignadaEl?: string;
  venceEl: string | null;
  completadaEl?: string | null;
  estado: EstadoTareaCierre;
  diasAtraso?: number | null;
};
const sesion = (usuario: UsuarioDemoDTO) => ({
  usuario,
  actor: {
    actorId: usuario.userId,
    actorNombre: usuario.nombre,
    actorRol: usuario.rol,
    origen: "WEB" as const,
    solicitudId: randomUUID(),
  },
});
const get = (ruta: string, query = "") =>
  new Request(`http://localhost/api/${ruta}${query ? `?${query}` : ""}`);

test("MySQL Tareas: detalle de la semana, conciliación, visibilidad, eventos e historial", async (t) => {
  const db = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL,
    log: [{ emit: "event", level: "query" }],
  });
  let consultas = 0;
  db.$on("query", () => {
    consultas++;
  });
  const sufijo = randomUUID().slice(0, 8);
  const id = `TAR-${sufijo}`;
  const idLider = `TAR-TL-${sufijo}`;
  const personas = [id, idLider];
  const imports: string[] = [];
  const http = crearHttpTareas(db);
  const reloj = { ahora: () => new Date("2026-11-10T12:00:00Z") };

  const rrhh = sesion({ userId: "demo-rrhh", nombre: "RRHH", rol: "RRHH", employeeId: null, teamId: null });
  const gerencia = sesion({ userId: "demo-gerencia", nombre: "Gerencia", rol: "GERENCIA", employeeId: "GER-01", teamId: null });
  const tlEquipo = sesion({ userId: "demo-tl-01", nombre: "Team Lead, Célula ficticia 1", rol: "TEAM_LEAD", employeeId: "TL-01", teamId: "EQ-01" });
  const tlAjeno = sesion({ userId: "demo-tl-02", nombre: "Team Lead, Célula ficticia 2", rol: "TEAM_LEAD", employeeId: "TL-02", teamId: "EQ-02" });
  const propio = sesion({ userId: "demo-empleado", nombre: "Persona ficticia", rol: "EMPLEADO", employeeId: id, teamId: "EQ-01" });

  const registro = async (employeeId: string, desde: string) => {
    const r = await db.registroLaboral.findFirstOrThrow({
      where: { employeeId, periodo: { periodStart: fechaParaDb(desde) } },
      orderBy: { dataVersion: "asc" },
    });
    return r;
  };
  async function tareas(employeeId: string, semana: typeof W1, filas: Fila[]) {
    const r = await registro(employeeId, semana.desde);
    await db.tareaSemana.createMany({
      data: filas.map((f) => ({
        recordId: r.recordId,
        periodoId: r.periodoId,
        employeeId,
        periodStart: fechaParaDb(semana.desde),
        sourceImportId: r.sourceImportId,
        taskId: f.taskId,
        titulo: f.titulo ?? `Tarea ${f.taskId}`,
        origen: "Jira",
        origenRef:
          f.origenRef === undefined
            ? `https://jira.example/browse/${f.taskId}`
            : f.origenRef,
        asignadaEl: fechaParaDb(f.asignadaEl ?? "2026-10-01"),
        venceEl: f.venceEl ? fechaParaDb(f.venceEl) : null,
        completadaEl: f.completadaEl ? fechaParaDb(f.completadaEl) : null,
        estadoCierre: f.estado,
        diasAtraso: f.diasAtraso ?? null,
      })),
    });
    return r;
  }
  const eventos = (sujetoId: string) =>
    db.eventoAuditoria.findMany({
      where: { accion: "TAREAS_CONSULTADAS", sujetoId },
      orderBy: { createdAt: "asc" },
    });
  const semana = async (s: ReturnType<typeof sesion>, query: string) => {
    const respuesta = await http.semana(get("tareas", query), s);
    return { status: respuesta.status, cuerpo: (await respuesta.json()) as TareasSemanaDTO };
  };

  try {
    await db.$transaction((tx) => sembrarBase(tx));
    await db.empleado.createMany({
      data: [
        { employeeId: id, nombre: "Persona ficticia Tareas", tipo: "TECNICO", teamId: "EQ-01", responsableId: "TL-01" },
        { employeeId: idLider, nombre: "Líder ficticio Tareas", tipo: "TEAM_LEAD", teamId: "EQ-03", responsableId: "GER-01" },
      ],
    });
    const csv = [
      CAB,
      `${id},${W1.desde},${W1.hasta},16,9,10,7,5,14,56,120`,
      `${id},${W2.desde},${W2.hasta},16,16,10,7,5,14,56,127`,
      `${id},${W3.desde},${W3.hasta},4,3,4,2,1,14,40,134`,
      `${idLider},${W2.desde},${W2.hasta},2,1,120,60,40,5,40,30`,
    ].join("\n");
    const vista = await validarImportacion(db, new File([csv], "tareas.csv"), "demo-local", reloj);
    imports.push(vista.importId);
    const confirmada = await confirmarImportacion(db, vista.importId, "demo-local", reloj);
    assert.equal(confirmada.procesamiento!.estado, "COMPLETADO");

    // W2 reconciles: 3 completed, 2 open in time, 5 overdue (10 = A, 7 = P, 5 = V).
    const vencidas: Fila[] = [
      { taskId: "OPS-1432", venceEl: "2026-10-09", estado: "VENCIDA", diasAtraso: 9 },
      { taskId: "OPS-1433", venceEl: "2026-10-12", estado: "VENCIDA", diasAtraso: 6, origenRef: "http://inseguro.example/x" },
      { taskId: "OPS-1434", venceEl: "2026-10-18", estado: "VENCIDA", diasAtraso: 0, origenRef: "javascript:alert(1)" },
      { taskId: "OPS-1435", venceEl: "2026-10-16", estado: "VENCIDA", diasAtraso: 2 },
      { taskId: "OPS-1436", venceEl: "2026-10-01", estado: "VENCIDA", diasAtraso: 17 },
    ];
    const registroW2 = await tareas(id, W2, [
      ...vencidas,
      { taskId: "OPS-1461", venceEl: "2026-10-23", estado: "PENDIENTE" },
      { taskId: "OPS-1462", venceEl: null, estado: "PENDIENTE" },
      { taskId: "OPS-1450", venceEl: "2026-10-17", completadaEl: "2026-10-16", estado: "COMPLETADA" },
      { taskId: "OPS-1451", venceEl: "2026-10-15", completadaEl: "2026-10-14", estado: "COMPLETADA" },
      { taskId: "OPS-1452", venceEl: "2026-10-18", completadaEl: "2026-10-18", estado: "COMPLETADA" },
    ]);
    // W1 holds only three rows: its detail does not reproduce the summary's 10, 7 and 5.
    const registroW1 = await tareas(id, W1, [
      { taskId: "OPS-1432", venceEl: "2026-10-09", estado: "VENCIDA", diasAtraso: 2 },
      { taskId: "OPS-1433", venceEl: "2026-10-12", estado: "PENDIENTE" },
      { taskId: "OPS-1450", venceEl: "2026-10-12", estado: "PENDIENTE" },
    ]);
    // The lead's week is large: 60 completed, 20 open in time, 40 overdue.
    const grandes: Fila[] = [
      ...Array.from({ length: 60 }, (_, i): Fila => ({ taskId: `GR-C${i}`, venceEl: "2026-10-15", completadaEl: "2026-10-14", estado: "COMPLETADA" })),
      ...Array.from({ length: 20 }, (_, i): Fila => ({ taskId: `GR-P${i}`, venceEl: "2026-10-25", estado: "PENDIENTE" })),
      ...Array.from({ length: 40 }, (_, i): Fila => ({ taskId: `GR-V${i}`, venceEl: "2026-10-10", estado: "VENCIDA", diasAtraso: 8 })),
    ];
    await tareas(idLider, W2, grandes);

    await t.test("RR. HH. lee la semana con resumen por estado, conciliación y linaje", async () => {
      const respuesta = await http.semana(get("tareas", `employeeId=${id}&periodStart=${W2.desde}`), rrhh);
      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.headers.get("cache-control"), "no-store");
      const c: TareasSemanaDTO = await respuesta.json();
      assert.deepEqual(c.persona, {
        employeeId: id,
        nombre: "Persona ficticia Tareas",
        tipo: "TECNICO",
        teamId: "EQ-01",
        equipo: "Célula ficticia 1",
      });
      assert.deepEqual(c.semana, {
        periodStart: W2.desde,
        periodEnd: W2.hasta,
        recordId: registroW2.recordId,
        vigente: true,
      });
      assert.deepEqual(
        [c.indicadores.horasExtra, c.indicadores.diasConsecutivosSinDescanso, c.indicadores.tareasActivas, c.indicadores.tareasPendientes, c.indicadores.tareasVencidas, c.indicadores.vacacionesPendientesDias],
        [16, 16, 10, 7, 5, 14],
      );
      assert.equal(c.resultado?.nivel, "ALTO");
      assert.equal(c.resultado?.indice, 91.21);
      assert.equal(c.resultado?.actualizado, true);
      assert.equal(c.detalle, "CON_DETALLE");
      assert.deepEqual(c.resumen, { total: 10, completadas: 3, pendientes: 2, vencidas: 5, diasAtrasoMax: 17, diasAtrasoTotal: 34 });
      assert.equal(c.conciliacion?.coincide, true);
      assert.equal(c.importacion?.importId, registroW2.sourceImportId);
      assert.ok(c.importacion?.confirmadaEl);
      assert.equal(c.tareasVisibles, true);
      assert.equal(c.tareas.total, 10);
      // Overdue first, the longest delay first; then open in time by due date, undated last; then completed.
      assert.deepEqual(
        c.tareas.items.map((x) => x.taskId),
        ["OPS-1436", "OPS-1432", "OPS-1433", "OPS-1435", "OPS-1434", "OPS-1461", "OPS-1462", "OPS-1451", "OPS-1450", "OPS-1452"],
      );
      assert.deepEqual(c.tareas.items[1], {
        taskId: "OPS-1432",
        titulo: "Tarea OPS-1432",
        origen: "Jira",
        origenRef: "https://jira.example/browse/OPS-1432",
        asignadaEl: "2026-10-01",
        venceEl: "2026-10-09",
        completadaEl: null,
        estado: "VENCIDA",
        diasAtraso: 9,
      });
      // Only an https reference reaches the browser.
      const ref = Object.fromEntries(c.tareas.items.map((x) => [x.taskId, x.origenRef]));
      assert.equal(ref["OPS-1433"], null);
      assert.equal(ref["OPS-1434"], null);
    });

    await t.test("el filtro por estado y la paginación se resuelven en SQL y no alteran el resumen", async () => {
      const base = `employeeId=${id}&periodStart=${W2.desde}`;
      const vencidasSolo = (await semana(rrhh, `${base}&estado=VENCIDA`)).cuerpo;
      assert.equal(vencidasSolo.tareas.total, 5);
      assert.ok(vencidasSolo.tareas.items.every((x) => x.estado === "VENCIDA"));
      assert.equal(vencidasSolo.resumen.total, 10);

      const pagina2 = (await semana(rrhh, `${base}&pageSize=3&page=2`)).cuerpo;
      assert.deepEqual(pagina2.tareas.items.map((x) => x.taskId), ["OPS-1435", "OPS-1434", "OPS-1461"]);
      assert.deepEqual([pagina2.tareas.total, pagina2.tareas.page, pagina2.tareas.pageSize], [10, 2, 3]);

      const completadas = (await semana(rrhh, `${base}&estado=COMPLETADA&pageSize=2&page=2`)).cuerpo;
      assert.deepEqual(completadas.tareas.items.map((x) => x.taskId), ["OPS-1452"]);
      assert.equal(completadas.tareas.total, 3);

      const fuera = (await semana(rrhh, `${base}&page=9`)).cuerpo;
      assert.deepEqual([fuera.tareas.items.length, fuera.tareas.total], [0, 10]);
      assert.equal((await semana(rrhh, `${base}&pageSize=101`)).status, 400);
      assert.equal((await semana(rrhh, `${base}&estado=ABIERTA`)).status, 400);
    });

    await t.test("una página grande se lee con las mismas consultas que una chica", async () => {
      const medir = async (employeeId: string, desde: string, extra = "") => {
        const antes = consultas;
        const { cuerpo } = await semana(rrhh, `employeeId=${employeeId}&periodStart=${desde}${extra}`);
        return { n: consultas - antes, cuerpo };
      };
      // Same person and week, a page of 5 against a page of 100: the work done must not grow with the rows.
      const chica = await medir(idLider, W2.desde, "&pageSize=5");
      const grande = await medir(idLider, W2.desde, "&pageSize=100");
      assert.equal(chica.cuerpo.tareas.items.length, 5);
      assert.equal(grande.cuerpo.tareas.items.length, 100);
      assert.equal(grande.cuerpo.tareas.total, 120);
      assert.equal(grande.cuerpo.conciliacion?.coincide, true);
      assert.deepEqual(
        [grande.cuerpo.resumen.completadas, grande.cuerpo.resumen.pendientes, grande.cuerpo.resumen.vencidas],
        [60, 20, 40],
      );
      assert.equal(grande.n, chica.n, "no debe haber consultas por fila");
      const resto = (await semana(rrhh, `employeeId=${idLider}&periodStart=${W2.desde}&pageSize=100&page=2`)).cuerpo;
      assert.equal(resto.tareas.items.length, 20);
    });

    await t.test("si el detalle no reproduce los conteos de la semana, la conciliación lo muestra", async () => {
      const { cuerpo } = await semana(rrhh, `employeeId=${id}&periodStart=${W1.desde}`);
      assert.equal(cuerpo.detalle, "CON_DETALLE");
      assert.equal(cuerpo.conciliacion?.coincide, false);
      assert.deepEqual(cuerpo.conciliacion?.campos, [
        { campo: "tareasActivas", resumen: 10, detalle: 3 },
        { campo: "tareasPendientes", resumen: 7, detalle: 3 },
        { campo: "tareasVencidas", resumen: 5, detalle: 1 },
      ]);
    });

    await t.test("una semana importada sin filas queda sin detalle y no registra una consulta de tareas", async () => {
      const antes = (await eventos(id)).length;
      const { status, cuerpo } = await semana(rrhh, `employeeId=${id}&periodStart=${W3.desde}`);
      assert.equal(status, 200);
      assert.equal(cuerpo.detalle, "SIN_DETALLE");
      assert.equal(cuerpo.conciliacion, null);
      assert.equal(cuerpo.importacion, null);
      assert.deepEqual(cuerpo.tareas, { items: [], total: 0, page: 1, pageSize: 50 });
      assert.equal(cuerpo.indicadores.tareasActivas, 4);
      assert.equal((await eventos(id)).length, antes);
    });

    await t.test("una semana inexistente o un registro de otra persona responden 404", async () => {
      assert.equal((await semana(rrhh, `employeeId=${id}&periodStart=2026-09-28`)).status, 404);
      assert.equal((await semana(rrhh, `employeeId=${id}&periodStart=${W2.desde}&recordId=${(await registro(idLider, W2.desde)).recordId}`)).status, 404);
      assert.equal((await semana(rrhh, `employeeId=NO-EXISTE&periodStart=${W2.desde}`)).status, 404);
    });

    await t.test("cada lectura del detalle queda en la auditoría con el sujeto y sin contenido de tareas", async () => {
      const antes = (await eventos(id)).length;
      await semana(rrhh, `employeeId=${id}&periodStart=${W2.desde}`);
      await semana(rrhh, `employeeId=${id}&periodStart=${W2.desde}&estado=VENCIDA&page=1`);
      const nuevos = (await eventos(id)).slice(antes);
      assert.equal(nuevos.length, 2, "una lectura repetida es un evento nuevo");
      const [e] = nuevos;
      assert.equal(e.entidad, "TAREAS");
      assert.equal(e.recursoId, registroW2.recordId);
      assert.equal(e.actorId, "demo-rrhh");
      assert.equal(e.actorRol, "RRHH");
      assert.equal(e.origen, "WEB");
      assert.equal(e.resultado, "EXITO");
      assert.deepEqual(e.detalles, { alcance: "SEMANA", periodStart: W2.desde, pagina: 1, filas: 10 });
      assert.deepEqual(nuevos[1].detalles, { alcance: "SEMANA", periodStart: W2.desde, estado: "VENCIDA", pagina: 1, filas: 5 });
      assert.ok(!JSON.stringify(nuevos.map((n) => n.detalles)).includes("Tarea OPS"));
      assert.notEqual(nuevos[0].clave, nuevos[1].clave);
    });

    await t.test("el Team Lead lee a su equipo; otro equipo no existe para él, aunque se llame al servicio sin la guarda", async () => {
      const propia = await semana(tlEquipo, `employeeId=${id}&periodStart=${W2.desde}&teamId=EQ-01`);
      assert.equal(propia.status, 200);
      assert.equal(propia.cuerpo.tareasVisibles, true);
      assert.equal(propia.cuerpo.tareas.total, 10);
      assert.equal((await semana(tlAjeno, `employeeId=${id}&periodStart=${W2.desde}`)).status, 404);
      assert.equal((await semana(tlEquipo, `employeeId=${id}&periodStart=${W2.desde}&teamId=EQ-02`)).status, 404);
      const e = (await eventos(id)).filter((x) => x.actorId === "demo-tl-01");
      assert.equal(e.length, 1);
      assert.equal(e[0].actorRol, "TEAM_LEAD");
    });

    await t.test("Gerencia ve los conteos de un técnico pero no sus tareas, y las de un Team Lead sí", async () => {
      const antes = (await eventos(id)).length;
      const tecnico = await semana(gerencia, `employeeId=${id}&periodStart=${W2.desde}`);
      assert.equal(tecnico.status, 200);
      assert.equal(tecnico.cuerpo.tareasVisibles, false);
      assert.equal(tecnico.cuerpo.resumen.total, 10);
      assert.equal(tecnico.cuerpo.indicadores.tareasActivas, 10);
      assert.deepEqual(tecnico.cuerpo.tareas.items, []);
      assert.equal((await eventos(id)).length, antes, "sin filas no hay consulta que registrar");
      assert.ok(!JSON.stringify(tecnico.cuerpo).includes("OPS-14"));

      const lider = await semana(gerencia, `employeeId=${idLider}&periodStart=${W2.desde}`);
      assert.equal(lider.cuerpo.tareasVisibles, true);
      assert.equal(lider.cuerpo.tareas.items.length, 50);
      assert.equal((await eventos(idLider)).filter((x) => x.actorId === "demo-gerencia").length, 1);
    });

    await t.test("el libro de semanas cruza el resumen con el detalle de cada una", async () => {
      const respuesta = await http.semanas(get("tareas/semanas", `employeeId=${id}`), rrhh);
      assert.equal(respuesta.status, 200);
      const c: SemanasConTareasDTO = await respuesta.json();
      assert.deepEqual(
        c.semanas.map((s) => [s.periodStart, s.detalle, s.coincide, s.resumen.total, s.indicadores.tareasActivas]),
        [
          [W3.desde, "SIN_DETALLE", null, 0, 4],
          [W2.desde, "CON_DETALLE", true, 10, 10],
          [W1.desde, "CON_DETALLE", false, 3, 10],
        ],
      );
      const acotado: SemanasConTareasDTO = await (await http.semanas(get("tareas/semanas", `employeeId=${id}&semanas=2`), rrhh)).json();
      assert.deepEqual(acotado.semanas.map((s) => s.periodStart), [W3.desde, W2.desde]);
      assert.equal((await http.semanas(get("tareas/semanas", `employeeId=${id}&semanas=53`), rrhh)).status, 400);
      // Counts only: reading the ledger exposes no task content, so it leaves no consultation event.
      const antes = (await eventos(id)).length;
      await http.semanas(get("tareas/semanas", `employeeId=${id}`), rrhh);
      assert.equal((await eventos(id)).length, antes);
    });

    await t.test("el historial de una tarea recorre los cierres y registra la consulta", async () => {
      const antes = (await eventos(id)).length;
      const respuesta = await http.historial(get("tareas/historial", `employeeId=${id}&taskId=OPS-1432`), rrhh);
      assert.equal(respuesta.status, 200);
      const c: HistorialTareaDTO = await respuesta.json();
      assert.equal(c.persona.employeeId, id);
      assert.equal(c.titulo, "Tarea OPS-1432");
      assert.deepEqual(
        c.cierres.map((x) => [x.periodStart, x.estado, x.diasAtraso]),
        [[W2.desde, "VENCIDA", 9], [W1.desde, "VENCIDA", 2]],
      );
      assert.equal(c.truncado, false);
      const nuevos = (await eventos(id)).slice(antes);
      assert.equal(nuevos.length, 1);
      assert.deepEqual(nuevos[0].detalles, { alcance: "HISTORIAL", cierres: 2 });
      assert.equal((await http.historial(get("tareas/historial", `employeeId=${id}&taskId=OPS-0000`), rrhh)).status, 404);
      assert.equal((await http.historial(get("tareas/historial", `employeeId=${id}&taskId=OPS-1432`), tlAjeno)).status, 404);
    });

    await t.test("Gerencia no consulta el historial de un técnico y el rechazo queda registrado", async () => {
      const respuesta = await http.historial(get("tareas/historial", `employeeId=${id}&taskId=OPS-1432`), gerencia);
      assert.equal(respuesta.status, 403);
      const cuerpo = await respuesta.json();
      assert.equal(cuerpo.error.codigo, "SIN_PERMISO");
      const denegados = await db.eventoAuditoria.findMany({
        where: { accion: "ACCESO_DENEGADO", sujetoId: id, actorId: "demo-gerencia" },
      });
      assert.equal(denegados.length, 1);
      assert.equal(denegados[0].resultado, "DENEGADO");
      assert.equal(denegados[0].motivo, "SIN_PERMISO");
    });

    await t.test("la persona lee sus propias tareas sin índice ni nivel y sin dejar consulta registrada", async () => {
      const antes = (await eventos(id)).length;
      const respuesta = await http.misTareas(get("mis-datos/tareas"), propio);
      assert.equal(respuesta.status, 200);
      const c: MisTareasDTO = await respuesta.json();
      assert.equal(c.nombre, "Persona ficticia Tareas");
      assert.deepEqual(c.semanas.map((s) => s.periodStart), [W3.desde, W2.desde, W1.desde]);
      assert.equal(c.semana?.semana.periodStart, W3.desde, "sin semana pedida, la más reciente");
      const w2: MisTareasDTO = await (await http.misTareas(get("mis-datos/tareas", `periodStart=${W2.desde}&estado=VENCIDA`), propio)).json();
      assert.equal(w2.semana?.resultado, null);
      assert.equal(w2.semana?.tareas.total, 5);
      assert.equal(w2.semana?.resumen.total, 10);
      const texto = JSON.stringify(w2);
      for (const clave of ['"indice"', '"nivel"', '"alertId"', '"evaluationId"'])
        assert.ok(!texto.includes(clave), clave);
      assert.equal((await eventos(id)).length, antes);
      // The person is the session's: a parameter naming someone else is rejected, not ignored.
      assert.equal((await http.misTareas(get("mis-datos/tareas", `employeeId=${idLider}`), propio)).status, 400);
      assert.equal((await http.misTareas(get("mis-datos/tareas", "periodStart=2026-09-28"), propio)).status, 404);
      // Someone else's session sees only their own weeks.
      const otra: MisTareasDTO = await (await http.misTareas(get("mis-datos/tareas"), sesion({ userId: "demo-tl-03", nombre: "Líder", rol: "TEAM_LEAD", employeeId: idLider, teamId: "EQ-03" }))).json();
      assert.deepEqual(otra.semanas.map((s) => s.periodStart), [W2.desde]);
    });

    await t.test("el informe de una versión anterior lee las tareas de ese registro y avisa que ya no es la vigente", async () => {
      const periodo = await db.periodoEmpleado.findFirstOrThrow({
        where: { employeeId: id, periodStart: fechaParaDb(W1.desde) },
      });
      const v2 = await db.registroLaboral.create({
        data: {
          periodoId: periodo.periodoId,
          employeeId: id,
          sourceImportId: registroW1.sourceImportId,
          dataVersion: 2,
          fingerprint: "f".repeat(64),
          supersedesRecordId: registroW1.recordId,
          horasExtra: 3,
          diasConsecutivosSinDescanso: 2,
          tareasActivas: 0,
          tareasPendientes: 0,
          tareasVencidas: 0,
          vacacionesPendientesDias: 1,
        },
      });
      await db.periodoEmpleado.update({
        where: { periodoId: periodo.periodoId },
        data: { registroVigenteId: v2.recordId },
      });
      const anterior = (await semana(rrhh, `employeeId=${id}&periodStart=${W1.desde}&recordId=${registroW1.recordId}`)).cuerpo;
      assert.equal(anterior.semana.vigente, false);
      assert.equal(anterior.semana.recordId, registroW1.recordId);
      assert.equal(anterior.tareas.total, 3);
      assert.equal(anterior.indicadores.tareasActivas, 10);
      assert.equal(anterior.resultado?.actualizado, false);
      const vigente = (await semana(rrhh, `employeeId=${id}&periodStart=${W1.desde}`)).cuerpo;
      assert.equal(vigente.semana.recordId, v2.recordId);
      assert.equal(vigente.semana.vigente, true);
      assert.equal(vigente.detalle, "CON_DETALLE", "sin tareas activas no hay detalle que corroborar");
      assert.equal(vigente.tareas.total, 0);
    });
  } finally {
    await db.$transaction(async (tx) => {
      const jobs = await tx.processingJobPar.findMany({
        where: { periodo: { employeeId: { in: personas } } },
        select: { jobId: true },
      });
      const jobIds = { in: jobs.map((j) => j.jobId) };
      await tx.tareaSemana.deleteMany({ where: { employeeId: { in: personas } } });
      await tx.processingJobPar.deleteMany({ where: { jobId: jobIds } });
      await tx.processingJob.deleteMany({ where: { jobId: jobIds } });
      await tx.alerta.deleteMany({ where: { employeeId: { in: personas } } });
      await tx.periodoEmpleado.updateMany({
        where: { employeeId: { in: personas } },
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.updateMany({
        where: { employeeId: { in: personas } },
        data: { supersedesEvaluationId: null },
      });
      await tx.evaluacion.deleteMany({ where: { employeeId: { in: personas } } });
      await tx.registroLaboral.updateMany({
        where: { employeeId: { in: personas } },
        data: { supersedesRecordId: null },
      });
      await tx.registroLaboral.deleteMany({ where: { employeeId: { in: personas } } });
      await tx.periodoEmpleado.deleteMany({ where: { employeeId: { in: personas } } });
      await tx.importacionTemporal.deleteMany({ where: { importId: { in: imports } } });
      await tx.importacion.deleteMany({ where: { importId: { in: imports } } });
      await tx.eventoAuditoria.deleteMany({ where: { sujetoId: { in: personas } } });
      await tx.empleado.deleteMany({ where: { employeeId: { in: personas } } });
    });
    await db.$disconnect();
  }
});
