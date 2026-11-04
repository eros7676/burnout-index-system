import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { reglasSemilla } from "../prisma/seed-data";
import { crearHttpOrganizacion } from "../src/server/http/organizacion";
import {
  proteger,
  tokenDemo,
  userIdTeamLead,
} from "../src/server/http/permisos-demo";
import { registrarEvento } from "../src/server/repositories/auditoria";
import { leerResultados } from "../src/server/repositories/consultas";
import { paginaDirectorio } from "../src/server/repositories/personas-directorio";
import { leerSemanasPersonas } from "../src/server/repositories/personas-semanas";
import {
  confirmarImportacion,
  validarImportacion,
} from "../src/server/services/importaciones";
import {
  consultarDirectorio,
  consultarEquipo,
  consultarFicha,
} from "../src/server/services/organizacion-consultas";
import { ErrorOrganizacion } from "../src/server/services/organizacion-errores";
import {
  cambiarLider,
  crearEquipo,
  desactivarEquipo,
  editarEquipo,
} from "../src/server/services/organizacion-equipos";
import {
  confirmarImportacionPersonas,
  validarImportacionPersonas,
} from "../src/server/services/organizacion-importacion";
import {
  cambiarAsignacion,
  crearPersona,
  darDeBaja,
  editarPersona,
} from "../src/server/services/organizacion-personas";
import { filtrosDirectorio } from "../src/server/services/organizacion-filtros";
import { procesarImportacion } from "../src/server/services/procesamientos";
import { publicarConfiguracion } from "../src/server/services/publicar-reglas";

// Tuesday 10 November 2026: the current week starts on Monday the 9th.
const reloj = { ahora: () => new Date("2026-11-10T12:00:00Z") };

async function rechazo(promesa: Promise<unknown>) {
  try {
    await promesa;
  } catch (error) {
    assert.ok(error instanceof ErrorOrganizacion, String(error));
    return error;
  }
  assert.fail("La operación debía rechazarse.");
}
const campos = (e: ErrorOrganizacion) =>
  e.detalles.map((d) => `${d.campo}:${d.codigo}`);

test("MySQL organización: altas, cambios, bajas, líder, importación y lectura paginada", async (t) => {
  assert.match(new URL(process.env.TEST_DATABASE_URL!).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const s = randomUUID().slice(0, 8);
  const actor = { actorId: `org-${s}` };
  const legajo = (n: string) => `ORG-${s}-${n}`;
  const digitos = String(Math.floor(10000 + Math.random() * 89999));
  const equipoA = `EQ-9${digitos}`;
  const equipoB = `EQ-8${digitos}`;
  const imports: string[] = [];
  const inicio = new Date();
  const version = `org-${s}`;
  const http = crearHttpOrganizacion(db, { reloj });
  const protegido = {
    directorio: proteger(db, "LEER", http.directorio),
    ficha: proteger(db, "LEER", http.ficha, "empleado"),
    equipos: proteger(db, "LEER", http.equipos),
    equipo: proteger(db, "LEER", http.equipo, "equipo"),
    crearPersona: proteger(db, "ADMINISTRAR_PERSONAS", http.crearPersona),
    validarImportacion: proteger(db, "ADMINISTRAR_PERSONAS", http.validarImportacion),
    confirmarImportacion: proteger(db, "ADMINISTRAR_PERSONAS", http.confirmarImportacion),
  };
  const como = (userId: string) => ({ cookie: `nexo_demo=${tokenDemo(userId)}` });
  const get = (handler: (r: Request, ...ids: string[]) => Promise<Response>, userId: string, ruta: string, ...ids: string[]) =>
    handler(new Request(`http://localhost${ruta}`, { headers: como(userId) }), ...ids);
  const post = (handler: (r: Request, ...ids: string[]) => Promise<Response>, userId: string, ruta: string, cuerpo: unknown, ...ids: string[]) =>
    handler(
      new Request(`http://localhost${ruta}`, {
        method: "POST",
        headers: { ...como(userId), "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
      ...ids,
    );
  const alta = (n: string, extra: Record<string, unknown> = {}) =>
    crearPersona(
      db,
      {
        employeeId: legajo(n),
        nombre: `Persona ficticia ${s} ${n}`,
        tipo: "TECNICO",
        teamId: equipoA,
        desde: "2026-11-02",
        enCobertura: true,
        ...extra,
      },
      actor,
      reloj,
    );
  const eventos = (where: object) =>
    db.eventoAuditoria.findMany({ where, orderBy: [{ createdAt: "asc" }, { eventoId: "asc" }] });
  const filas = (employeeId: string) =>
    db.asignacionEmpleado.findMany({ where: { employeeId }, orderBy: { desde: "asc" } });
  const dia = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

  try {
    await db.$transaction((tx) => sembrarBase(tx));
    // Two Team Leads of the seeded team EQ-01 (it already has its own lead, TL-01).
    for (const n of ["L1", "L2"])
      await alta(n, { tipo: "TEAM_LEAD", teamId: "EQ-01", desde: "2026-10-05" });

    await t.test("equipo nuevo con líder: el líder se incorpora y responde a la gerencia", async () => {
      assert.deepEqual(
        await crearEquipo(db, { teamId: equipoA, nombre: `Equipo A ${s}`, liderId: legajo("L1"), gerenteId: "GER-01" }, actor, reloj),
        { teamId: equipoA },
      );
      await crearEquipo(db, { teamId: equipoB, nombre: `Equipo B ${s}`, liderId: null, gerenteId: "GER-01" }, actor, reloj);
      const lider = await db.empleado.findUniqueOrThrow({ where: { employeeId: legajo("L1") } });
      assert.equal(lider.teamId, equipoA);
      assert.equal(lider.responsableId, "GER-01");
      const historia = await filas(legajo("L1"));
      assert.deepEqual(
        historia.map((f) => [f.motivo, f.teamId, dia(f.desde), dia(f.hasta)]),
        [
          ["ALTA", "EQ-01", "2026-10-05", "2026-11-09"],
          ["CAMBIO_LIDER", equipoA, "2026-11-09", null],
        ],
      );
      const creado = await eventos({ accion: "EQUIPO_CREADO", recursoId: equipoA });
      assert.equal(creado.length, 1);
      assert.equal(creado[0].actorId, actor.actorId);
      const duplicado = await rechazo(crearEquipo(db, { teamId: equipoA, nombre: "Otra", liderId: null, gerenteId: null }, actor, reloj));
      assert.deepEqual(campos(duplicado), ["teamId:EQUIPO_DUPLICADO"]);
      const ajeno = await rechazo(crearEquipo(db, { teamId: `EQ-7${digitos}`, nombre: "Otra", liderId: "TL-01", gerenteId: null }, actor, reloj));
      assert.deepEqual(campos(ajeno), ["liderId:LIDERA_OTRO_EQUIPO"]);
      assert.equal(await db.equipo.count({ where: { teamId: `EQ-7${digitos}` } }), 0);
    });

    await t.test("alta: empleado, asignación y eventos en una sola transacción", async () => {
      await alta("T1", { nombre: "Lucía Pérez" });
      const persona = await db.empleado.findUniqueOrThrow({ where: { employeeId: legajo("T1") } });
      assert.equal(persona.responsableId, legajo("L1"));
      assert.equal(dia(persona.fechaIngreso), "2026-11-02");
      assert.deepEqual(
        (await filas(legajo("T1"))).map((f) => [f.motivo, f.activo, dia(f.hasta), f.registradoPor]),
        [["ALTA", true, null, actor.actorId]],
      );
      const creados = await eventos({ sujetoId: legajo("T1") });
      assert.deepEqual(creados.map((e) => e.accion).sort(), ["EMPLEADO_CREADO", "EQUIPO_MIEMBRO_AGREGADO"]);
      assert.equal(new Set(creados.map((e) => e.correlacionId)).size, 1);

      const repetido = await rechazo(alta("T1"));
      assert.deepEqual(campos(repetido), ["employeeId:LEGAJO_DUPLICADO"]);
      assert.equal(repetido.status, 422);

      const homonimo = await rechazo(alta("T2", { nombre: "LUCIA  PEREZ" }));
      assert.equal(homonimo.status, 409);
      assert.deepEqual(campos(homonimo), ["nombre:NOMBRE_REPETIDO"]);
      assert.equal(await db.empleado.count({ where: { employeeId: legajo("T2") } }), 0);
      await alta("T2", { nombre: "LUCIA  PEREZ", confirmarNombreRepetido: true });
      assert.equal((await db.empleado.findUniqueOrThrow({ where: { employeeId: legajo("T2") } })).nombre, "LUCIA PEREZ");

      // A failure after the first writes leaves nothing behind: the audit key of T3 is already taken.
      await registrarEvento(db, { accion: "EMPLEADO_CREADO", recursoId: legajo("T3"), actor, detalles: {} });
      await assert.rejects(alta("T3"));
      assert.equal(await db.empleado.count({ where: { employeeId: legajo("T3") } }), 0);
      assert.equal(await db.asignacionEmpleado.count({ where: { employeeId: legajo("T3") } }), 0);

      const respuesta = await post(
        protegido.crearPersona,
        "demo-rrhh",
        "/api/personas",
        { employeeId: legajo("T4"), nombre: `Persona ficticia ${s} T4`, tipo: "TECNICO", teamId: equipoA, desde: "2026-11-02", enCobertura: true },
      );
      assert.equal(respuesta.status, 201);
      const porHttp = await eventos({ accion: "EMPLEADO_CREADO", recursoId: legajo("T4") });
      assert.equal(porHttp[0].actorId, "demo-rrhh");
      assert.equal(porHttp[0].actorRol, "RRHH");
      assert.equal(porHttp[0].solicitudId, respuesta.headers.get("x-request-id"));
      const invalido = await post(protegido.crearPersona, "demo-rrhh", "/api/personas", { employeeId: "", nombre: "", tipo: "X", teamId: null, desde: "hoy", enCobertura: 1 });
      assert.equal(invalido.status, 422);
      const cuerpo = await invalido.json();
      assert.equal(cuerpo.error.codigo, "VALIDACION_INVALIDA");
      assert.ok(cuerpo.error.detalles.every((d: { campo: string; codigo: string; detalle: string }) => d.campo && d.codigo && d.detalle));
    });

    await t.test("directorio: una semana por llamada, filtros y búsqueda sin tildes", async () => {
      const listar = async (consulta: string) => {
        const r = await get(protegido.directorio, "demo-rrhh", `/api/personas/directorio?teamId=${equipoA}${consulta}`);
        assert.equal(r.status, 200);
        return r.json();
      };
      const todas = await listar("");
      assert.equal(todas.total, 4);
      assert.equal(todas.items.length, 4);
      const pagina = await listar("&pageSize=3&page=2&orden=nombre");
      assert.equal(pagina.items.length, 1);
      assert.equal(pagina.total, 4);
      assert.deepEqual((await listar("&q=lucia")).items.map((i: { nombre: string }) => i.nombre).sort(), ["LUCIA PEREZ", "Lucía Pérez"]);
      assert.equal((await listar(`&q=${legajo("T4")}`)).total, 1);
      assert.equal((await listar("&q=50%25")).total, 0);
      assert.equal((await listar("&estado=BAJAS")).total, 0);
      for (const mala of ["&pageSize=101", "&page=0", "&estado=TODAS", "&desconocido=1", "&q=a&q=b", "&periodStart=2026-11-03"])
        assert.equal((await get(protegido.directorio, "demo-rrhh", `/api/personas/directorio?teamId=${equipoA}${mala}`)).status, 400, mala);
    });

    await t.test("cambio de equipo: cierra la fila anterior, deriva al responsable y deja rastro", async () => {
      await cambiarAsignacion(db, legajo("T1"), { motivo: "CAMBIO_EQUIPO", desde: "2026-11-09", tipo: "TECNICO", teamId: equipoB, enCobertura: true }, actor, reloj);
      const persona = await db.empleado.findUniqueOrThrow({ where: { employeeId: legajo("T1") } });
      assert.equal(persona.teamId, equipoB);
      assert.equal(persona.responsableId, null);
      assert.deepEqual(
        (await filas(legajo("T1"))).map((f) => [f.motivo, f.teamId, dia(f.desde), dia(f.hasta)]),
        [
          ["ALTA", equipoA, "2026-11-02", "2026-11-09"],
          ["CAMBIO_EQUIPO", equipoB, "2026-11-09", null],
        ],
      );
      const acciones = (await eventos({ sujetoId: legajo("T1") })).map((e) => `${e.accion}:${e.recursoId}`);
      assert.ok(acciones.includes("EMPLEADO_ACTUALIZADO:" + legajo("T1")));
      assert.ok(acciones.includes(`EQUIPO_MIEMBRO_QUITADO:${equipoA}`));
      assert.ok(acciones.includes(`EQUIPO_MIEMBRO_AGREGADO:${equipoB}`));

      const anterior = await rechazo(cambiarAsignacion(db, legajo("T1"), { motivo: "CAMBIO_PUESTO", desde: "2026-11-09", tipo: "TEAM_LEAD", teamId: equipoB, enCobertura: true }, actor, reloj));
      assert.deepEqual(campos(anterior), ["desde:FECHA_ANTERIOR"]);
      const sinMotivo = await rechazo(cambiarAsignacion(db, legajo("T1"), { motivo: "CORRECCION", tipo: "TECNICO", teamId: equipoB, enCobertura: false }, actor, reloj));
      assert.deepEqual(campos(sinMotivo), ["comentario:JUSTIFICACION_OBLIGATORIA"]);

      await cambiarAsignacion(db, legajo("T1"), { motivo: "CORRECCION", tipo: "TECNICO", teamId: equipoB, enCobertura: false, comentario: "No integra la cobertura" }, actor, reloj);
      const corregidas = await filas(legajo("T1"));
      assert.equal(corregidas.length, 2);
      assert.deepEqual([corregidas[1].motivo, corregidas[1].enCobertura, corregidas[1].comentario], ["CORRECCION", false, "No integra la cobertura"]);
      const correccion = (await eventos({ sujetoId: legajo("T1"), accion: "EMPLEADO_ACTUALIZADO" })).at(-1)!;
      assert.equal(correccion.justificacion, "No integra la cobertura");

      const lider = await rechazo(cambiarAsignacion(db, legajo("L1"), { motivo: "CORRECCION", tipo: "TEAM_LEAD", teamId: equipoB, enCobertura: true, comentario: "Prueba" }, actor, reloj));
      assert.equal(lider.status, 409);
      assert.deepEqual(campos(lider), ["teamId:LIDERA_EQUIPO"]);
      assert.equal((await db.empleado.findUniqueOrThrow({ where: { employeeId: legajo("L1") } })).teamId, equipoA);
    });

    await t.test("datos de la persona: nombre e ingreso, con rastro de lo que cambió", async () => {
      await editarPersona(db, legajo("T4"), { nombre: "Marcos Díaz", fechaIngreso: "2026-10-26" }, actor);
      const persona = await db.empleado.findUniqueOrThrow({ where: { employeeId: legajo("T4") } });
      assert.equal(persona.nombre, "Marcos Díaz");
      assert.equal(dia(persona.fechaIngreso), "2026-10-26");
      const evento = (await eventos({ accion: "EMPLEADO_ACTUALIZADO", recursoId: legajo("T4") })).at(-1)!;
      assert.deepEqual((evento.cambios as { campo: string }[]).map((c) => c.campo), ["nombre", "fechaIngreso"]);
      assert.deepEqual(campos(await rechazo(editarPersona(db, legajo("T4"), { nombre: "Marcos Díaz" }, actor))), ["nombre:SIN_CAMBIOS"]);
      assert.deepEqual(campos(await rechazo(editarPersona(db, legajo("T4"), { fechaIngreso: "2026-11-09" }, actor))), ["fechaIngreso:FECHA_POSTERIOR"]);
    });

    await t.test("baja: nunca borra, exige justificación y respeta lo que la persona lidera", async () => {
      const sinJustificar = await rechazo(darDeBaja(db, legajo("T2"), { fechaBaja: "2026-11-06", justificacion: " " }, actor, reloj));
      assert.deepEqual(campos(sinJustificar), ["justificacion:JUSTIFICACION_OBLIGATORIA"]);
      await darDeBaja(db, legajo("T2"), { fechaBaja: "2026-11-06", justificacion: "Renuncia" }, actor, reloj);
      const persona = await db.empleado.findUniqueOrThrow({ where: { employeeId: legajo("T2") } });
      assert.equal(persona.activo, false);
      assert.equal(dia(persona.fechaBaja), "2026-11-06");
      assert.deepEqual(
        (await filas(legajo("T2"))).map((f) => [f.motivo, f.activo, dia(f.desde), dia(f.hasta)]),
        [
          ["ALTA", true, "2026-11-02", "2026-11-09"],
          ["BAJA", false, "2026-11-09", null],
        ],
      );
      const evento = await eventos({ accion: "EMPLEADO_DESACTIVADO", recursoId: legajo("T2") });
      assert.equal(evento.length, 1);
      assert.equal(evento[0].justificacion, "Renuncia");
      assert.equal(evento[0].resultado, "EXITO");
      assert.equal((await rechazo(darDeBaja(db, legajo("T2"), { fechaBaja: "2026-11-06", justificacion: "Otra" }, actor, reloj))).status, 409);
      const lider = await rechazo(darDeBaja(db, legajo("L1"), { fechaBaja: "2026-11-10", justificacion: "Renuncia" }, actor, reloj));
      assert.deepEqual(campos(lider), ["fechaBaja:LIDERA_EQUIPO"]);
      const bajas = await consultarDirectorio(db, filtrosDirectorio(new URLSearchParams(`estado=BAJAS&teamId=${equipoA}`)));
      assert.deepEqual(bajas.items.map((i) => [i.employeeId, i.activo]), [[legajo("T2"), false]]);
      const ficha = await consultarFicha(db, legajo("T2"), 12);
      assert.deepEqual(ficha.asignaciones.map((a) => [a.motivo, a.registradoPor]), [["BAJA", actor.actorId], ["ALTA", actor.actorId]]);
      assert.equal(ficha.persona.fechaBaja, "2026-11-06");
    });

    await t.test("cambio de líder: las personas del equipo pasan a responder al nuevo líder", async () => {
      await alta("T5", { desde: "2026-11-09" });
      await cambiarLider(db, equipoA, { liderId: legajo("L2") }, actor, reloj);
      const equipo = await db.equipo.findUniqueOrThrow({ where: { teamId: equipoA } });
      assert.equal(equipo.liderId, legajo("L2"));
      const nuevo = await db.empleado.findUniqueOrThrow({ where: { employeeId: legajo("L2") } });
      assert.deepEqual([nuevo.teamId, nuevo.responsableId], [equipoA, "GER-01"]);
      for (const n of ["T4", "T5"])
        assert.equal((await db.empleado.findUniqueOrThrow({ where: { employeeId: legajo(n) } })).responsableId, legajo("L2"), n);
      assert.deepEqual(
        (await filas(legajo("T4"))).map((f) => [f.motivo, f.responsableId, dia(f.desde), dia(f.hasta)]),
        [
          ["ALTA", legajo("L1"), "2026-11-02", "2026-11-09"],
          ["CAMBIO_LIDER", legajo("L2"), "2026-11-09", null],
        ],
      );
      // Hired this very week: the single row is re-pointed instead of split.
      assert.deepEqual((await filas(legajo("T5"))).map((f) => [f.motivo, f.responsableId]), [["ALTA", legajo("L2")]]);
      const evento = await eventos({ accion: "EQUIPO_LIDER_CAMBIADO", recursoId: equipoA });
      assert.equal(evento.length, 1);
      assert.deepEqual(evento[0].cambios, [{ campo: "liderId", antes: legajo("L1"), despues: legajo("L2") }]);
      assert.equal((evento[0].detalles as { personasReasignadas: number }).personasReasignadas, 2);

      assert.deepEqual(campos(await rechazo(cambiarLider(db, equipoA, { liderId: legajo("L2") }, actor, reloj))), ["liderId:SIN_CAMBIOS"]);
      assert.deepEqual(campos(await rechazo(cambiarLider(db, equipoA, { liderId: legajo("T4") }, actor, reloj))), ["liderId:NO_ES_TEAM_LEAD"]);
      assert.deepEqual(campos(await rechazo(cambiarLider(db, equipoA, { liderId: "TL-01" }, actor, reloj))), ["liderId:LIDERA_OTRO_EQUIPO"]);
      assert.equal((await rechazo(cambiarLider(db, `EQ-6${digitos}`, { liderId: legajo("L1") }, actor, reloj))).status, 404);
    });

    await t.test("equipo: editar nombre y gerencia, y desactivar solo cuando queda vacío", async () => {
      await editarEquipo(db, equipoB, { nombre: `Equipo B renombrado ${s}` }, actor, reloj);
      assert.equal((await db.equipo.findUniqueOrThrow({ where: { teamId: equipoB } })).nombre, `Equipo B renombrado ${s}`);
      assert.deepEqual(campos(await rechazo(editarEquipo(db, equipoB, { gerenteId: legajo("T4") }, actor, reloj))), ["gerenteId:NO_ES_GERENCIA"]);

      const ocupado = await rechazo(desactivarEquipo(db, equipoB, { justificacion: "Reorganización" }, actor));
      assert.equal(ocupado.status, 409);
      assert.deepEqual(campos(ocupado), ["justificacion:EQUIPO_CON_PERSONAS"]);
      await cambiarAsignacion(db, legajo("T1"), { motivo: "CORRECCION", tipo: "TECNICO", teamId: equipoA, enCobertura: true, comentario: "Vuelve a su equipo" }, actor, reloj);
      assert.deepEqual(campos(await rechazo(desactivarEquipo(db, equipoB, { justificacion: "" }, actor))), ["justificacion:JUSTIFICACION_OBLIGATORIA"]);
      await desactivarEquipo(db, equipoB, { justificacion: "Reorganización" }, actor);
      const equipo = await db.equipo.findUniqueOrThrow({ where: { teamId: equipoB } });
      assert.equal(equipo.activo, false);
      const evento = await eventos({ accion: "EQUIPO_DESACTIVADO", recursoId: equipoB });
      assert.equal(evento[0].justificacion, "Reorganización");
      assert.equal((await rechazo(desactivarEquipo(db, equipoB, { justificacion: "Otra vez" }, actor))).status, 409);
      assert.equal((await rechazo(editarEquipo(db, equipoB, { nombre: "Nuevo" }, actor, reloj))).status, 409);
      assert.deepEqual(
        campos(await rechazo(alta("T6", { teamId: equipoB }))),
        ["teamId:EQUIPO_INACTIVO"],
      );
      assert.equal((await rechazo(desactivarEquipo(db, equipoA, { justificacion: "Prueba" }, actor))).status, 409);
    });

    await t.test("importación personas-v1: vista previa, todo o nada y un solo correlacionId", async () => {
      const cabecera = "employee_id,nombre,tipo,team_id,vigente_desde,en_cobertura\n";
      const bytes = (cuerpo: string) => new TextEncoder().encode(cabecera + cuerpo);
      const malo = bytes(`${legajo("I1")},Ana Ruiz,TECNICO,${equipoA},2026-11-02,true\n${legajo("I2")},Beto Sosa,TECNICO,EQ-NO,2026-11-02,true\n${legajo("I3")},Carla Gil,GERENCIA,${equipoA},2026-11-03,true\n`);
      const rechazada = await validarImportacionPersonas(db, malo, reloj);
      assert.equal(rechazada.estado, "RECHAZADA");
      assert.deepEqual(
        rechazada.errores.map((e) => `${e.fila}:${e.campo}:${e.codigo}`).sort(),
        ["3:team_id:EQUIPO_INEXISTENTE", "4:en_cobertura:NO_APLICA", "4:team_id:NO_APLICA", "4:vigente_desde:NO_ES_LUNES"].sort(),
      );
      assert.equal(rechazada.nuevas, 0);
      await rechazo(confirmarImportacionPersonas(db, malo, rechazada.huella, actor, reloj));
      assert.equal(await db.empleado.count({ where: { employeeId: legajo("I1") } }), 0);

      const bueno = bytes(
        `${legajo("I1")},Ana Ruiz,TECNICO,${equipoA},2026-11-02,true\n` +
          `${legajo("I2")},Beto Sosa,TECNICO,${equipoA},,\n` +
          `${legajo("I3")},Carla Gil,TEAM_LEAD,${equipoA},2026-11-02,true\n` +
          `${legajo("I4")},Diego Paz,TECNICO,${equipoA},2026-11-02,true\n` +
          `${legajo("T4")},Marcos Díaz,TECNICO,${equipoA},2026-10-26,true\n`,
      );
      const vista = await validarImportacionPersonas(db, bueno, reloj);
      assert.deepEqual([vista.estado, vista.totalFilas, vista.nuevas, vista.omitidas, vista.errores.length], ["VALIDADA", 5, 4, 1, 0]);
      assert.equal(vista.muestra[1].desde, "2026-11-09");
      assert.equal(await db.empleado.count({ where: { employeeId: legajo("I1") } }), 0);

      const distinto = await rechazo(confirmarImportacionPersonas(db, bueno, "0".repeat(64), actor, reloj));
      assert.deepEqual([distinto.status, distinto.codigo], [409, "ARCHIVO_DISTINTO"]);
      // Another change slips in between the preview and the confirmation: the whole file is refused.
      await alta("I4", { nombre: "Otro Nombre" });
      const conflicto = await rechazo(confirmarImportacionPersonas(db, bueno, vista.huella, actor, reloj));
      assert.equal(conflicto.status, 422);
      assert.deepEqual(campos(conflicto), ["employee_id:CONFLICTO_EXISTENTE"]);
      assert.equal(await db.empleado.count({ where: { employeeId: { in: [legajo("I1"), legajo("I2"), legajo("I3")] } } }), 0);
      await db.$transaction(async (tx) => {
        await tx.eventoAuditoria.deleteMany({ where: { recursoId: legajo("I4") } });
        await tx.asignacionEmpleado.deleteMany({ where: { employeeId: legajo("I4") } });
        await tx.empleado.delete({ where: { employeeId: legajo("I4") } });
      });

      const resultado = await confirmarImportacionPersonas(db, bueno, vista.huella, actor, reloj);
      assert.deepEqual([resultado.creadas, resultado.omitidas], [4, 1]);
      const l2 = legajo("L2");
      const creadas = await db.empleado.findMany({ where: { employeeId: { in: ["I1", "I2", "I3", "I4"].map(legajo) } }, orderBy: { employeeId: "asc" } });
      assert.deepEqual(creadas.map((p) => [p.tipo, p.teamId, p.responsableId]), [
        ["TECNICO", equipoA, l2],
        ["TECNICO", equipoA, l2],
        ["TEAM_LEAD", equipoA, "GER-01"],
        ["TECNICO", equipoA, l2],
      ]);
      assert.equal(dia(creadas[1].fechaIngreso), "2026-11-09");
      const delLote = await eventos({ correlacionId: resultado.correlacionId });
      assert.deepEqual(
        [...new Set(delLote.map((e) => e.accion))].sort(),
        ["EMPLEADO_CREADO", "EQUIPO_MIEMBRO_AGREGADO", "IMPORTACION_CONFIRMADA"],
      );
      assert.equal(delLote.filter((e) => e.accion === "EMPLEADO_CREADO").length, 4);
      assert.equal(delLote.filter((e) => e.accion === "IMPORTACION_CONFIRMADA").length, 1);
      // Same file again: nothing new, nothing written.
      const otra = await rechazo(confirmarImportacionPersonas(db, bueno, vista.huella, actor, reloj));
      assert.equal(otra.status, 409);
      assert.equal((await eventos({ accion: "IMPORTACION_CONFIRMADA", actorId: actor.actorId })).length, 1);

      const formulario = (contenido: Uint8Array, huella?: string) => {
        const f = new FormData();
        f.set("file", new File([contenido as Uint8Array<ArrayBuffer>], "personas.csv", { type: "text/csv" }));
        if (huella) f.set("huella", huella);
        return f;
      };
      const previa = await protegido.validarImportacion(
        new Request("http://localhost/api/personas/importacion/validar", { method: "POST", headers: como("demo-rrhh"), body: formulario(bueno) }),
      );
      assert.equal(previa.status, 200);
      assert.equal((await previa.json()).nuevas, 0);
      const sinHuella = await protegido.confirmarImportacion(
        new Request("http://localhost/api/personas/importacion/confirmar", { method: "POST", headers: como("demo-rrhh"), body: formulario(bueno) }),
      );
      assert.equal(sinHuella.status, 400);
    });

    await t.test("permisos: RR. HH. escribe, Gerencia lee y el Team Lead solo ve su equipo", async () => {
      const lectura = async (userId: string, ruta: string, handler: (r: Request, ...ids: string[]) => Promise<Response> = protegido.directorio, ...ids: string[]) =>
        (await get(handler, userId, ruta, ...ids)).status;
      assert.equal(await lectura("demo-gerencia", "/api/personas/directorio"), 200);
      assert.equal(await lectura("demo-empleado", "/api/personas/directorio"), 403);
      const nuevo = { employeeId: legajo("X1"), nombre: "Persona ficticia X", tipo: "TECNICO", teamId: equipoA, desde: "2026-11-02", enCobertura: true };
      assert.equal((await post(protegido.crearPersona, "demo-gerencia", "/api/personas", nuevo)).status, 403);
      const tl = userIdTeamLead(equipoA);
      assert.equal((await post(protegido.crearPersona, tl, "/api/personas", nuevo)).status, 403);
      assert.equal(await db.empleado.count({ where: { employeeId: legajo("X1") } }), 0);

      const propio = await (await get(protegido.directorio, tl, "/api/personas/directorio")).json();
      assert.ok(propio.total > 0 && propio.items.every((i: { teamId: string }) => i.teamId === equipoA));
      assert.equal(await lectura(tl, "/api/personas/directorio?teamId=EQ-01"), 403);
      assert.equal(await lectura(tl, `/api/personas/${legajo("T4")}`, protegido.ficha, legajo("T4")), 200);
      assert.equal(await lectura(tl, "/api/personas/EMP-001", protegido.ficha, "EMP-001"), 403);
      assert.equal(await lectura(tl, `/api/equipos/${equipoA}`, protegido.equipo, equipoA), 200);
      assert.equal(await lectura(tl, "/api/equipos/EQ-01", protegido.equipo, "EQ-01"), 403);
      const equipos = await (await get(protegido.equipos, tl, "/api/equipos")).json();
      assert.deepEqual(equipos.items.map((e: { teamId: string }) => e.teamId), [equipoA]);
      const denegados = await eventos({ accion: "ACCESO_DENEGADO", actorId: tl });
      assert.ok(denegados.length >= 4);

      const antes = await db.eventoAuditoria.count({ where: { accion: "FICHA_CONSULTADA", sujetoId: legajo("T4") } });
      const ficha = await (await get(protegido.ficha, "demo-rrhh", `/api/personas/${legajo("T4")}?semanas=4`, legajo("T4"))).json();
      assert.equal(ficha.persona.employeeId, legajo("T4"));
      assert.equal(ficha.persona.equipo, `Equipo A ${s}`);
      assert.equal(await db.eventoAuditoria.count({ where: { accion: "FICHA_CONSULTADA", sujetoId: legajo("T4") } }), antes + 1);
      assert.equal((await get(protegido.ficha, "demo-rrhh", "/api/personas/NO-EXISTE", "NO-EXISTE")).status, 404);
      assert.equal((await get(protegido.ficha, "demo-rrhh", `/api/personas/${legajo("T4")}?semanas=53`, legajo("T4"))).status, 400);
    });

    await t.test("frescura y agregados: el SQL del directorio coincide con la lectura por huella", async () => {
      await alta("P1", { desde: "2026-10-05" });
      const id = legajo("P1");
      const csv =
        readFileSync("templates/ejemplo-dos-semanas.csv", "utf8").trim().replaceAll("EMP-001", id) +
        `\n${id},2026-10-19,2026-10-25,8,6,10,5,2,10,40,0\n${id},2026-10-26,2026-11-01,0,0,0,0,0,0,40,0\n`;
      const vista = await validarImportacion(db, new File([csv], "org.csv"), "demo-local", reloj);
      imports.push(vista.importId);
      const confirmada = await confirmarImportacion(db, vista.importId, "demo-local", reloj);
      assert.equal(confirmada.procesamiento!.estado, "COMPLETADO");
      const semanas = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
      const niveles = ["BAJO", "MEDIO", "ALTO", "INCOMPLETO"] as const;

      const comparar = async (escenario: string) => {
        const esperado = await db.$transaction((tx) => leerResultados(tx, { employeeId: id, page: 1, pageSize: 1 }));
        const leidas = (await db.$transaction((tx) => leerSemanasPersonas(tx, { employeeIds: [id], hasta: "2026-10-26", semanas: 8 }))).get(id)!;
        assert.equal(leidas.length, esperado.length, escenario);
        for (const { fila } of esperado) {
          const propia = leidas.find((l) => l.periodStart === fila.periodStart)!;
          assert.deepEqual(
            [propia.actualizado, propia.indice, propia.nivel, propia.alertId, propia.processingState],
            [fila.actualizado, fila.indice, fila.nivel, fila.alertId, fila.processingState],
            `${escenario} ${fila.periodStart}`,
          );
          for (const nivel of [...niveles, "DESACTUALIZADO"] as const) {
            const { ids } = await paginaDirectorio(db, { periodStart: fila.periodStart, teamId: equipoA, estado: "ACTIVAS", nivel, orden: "indice", page: 1, pageSize: 100 });
            const debe = nivel === "DESACTUALIZADO" ? !fila.actualizado : fila.actualizado && fila.nivel === nivel;
            assert.equal(ids.includes(id), debe, `${escenario} ${fila.periodStart} ${nivel}`);
          }
        }
        return esperado;
      };
      await comparar("vigente");
      const equipoSemana = await consultarEquipo(db, equipoA, "2026-10-12");
      assert.equal(equipoSemana.suprimido, null);
      assert.ok(equipoSemana.personasEvaluables >= 5);
      assert.deepEqual([equipoSemana.conteo!.ALTO, equipoSemana.evaluadas, equipoSemana.promedioIndice, equipoSemana.alertasActivas], [1, 1, 91.21, 1]);
      assert.equal(equipoSemana.tendenciaAlto!.at(-1)!.alto, 1);
      // The week's task counts, summed from the current records (10 tasks, 2 overdue, in the CSV row).
      assert.deepEqual((await consultarEquipo(db, equipoA, "2026-10-19")).tareas, {
        activas: 10,
        vencidas: 2,
        personasConVencidas: 1,
        personas: 1,
      });

      const filasP = await db.periodoEmpleado.findMany({ where: { employeeId: id }, orderBy: { periodStart: "asc" } });
      const evaluacion = filasP[1].evaluacionVigenteId!;
      await db.evaluacion.update({ where: { evaluationId: evaluacion }, data: { engineVersion: "cu02-obsoleto" } });
      await comparar("motor distinto");
      assert.equal((await consultarEquipo(db, equipoA, "2026-10-12")).conteo!.ALTO, 0);
      await db.evaluacion.update({ where: { evaluationId: evaluacion }, data: { engineVersion: "cu02-v1" } });
      await db.periodoEmpleado.update({ where: { periodoId: filasP[1].periodoId }, data: { evaluacionVigenteId: null } });
      await comparar("sin evaluación");
      await db.periodoEmpleado.update({ where: { periodoId: filasP[1].periodoId }, data: { evaluacionVigenteId: evaluacion } });
      const publicada = await publicarConfiguracion(db, { ...reglasSemilla, version, effectiveFrom: "2026-10-12", createdBy: "demo-local", createdAt: "2026-11-10T12:00:00Z" });
      await comparar("reglas nuevas");
      assert.equal((await consultarEquipo(db, equipoA, "2026-10-12")).alertasActivas, 0);
      await procesarImportacion(db, publicada.jobId);
      await comparar("reprocesado");

      // The ordering puts the highest index first and the people without a result last.
      const ordenada = await consultarDirectorio(db, filtrosDirectorio(new URLSearchParams(`teamId=${equipoA}&periodStart=2026-10-12&pageSize=3`)));
      assert.equal(ordenada.items[0].employeeId, id);
      assert.equal(ordenada.items[0].semanas[0].nivel, "ALTO");
      assert.deepEqual(ordenada.semanas.slice(0, 4), [...semanas].reverse());
      const soloAlto = await consultarDirectorio(db, filtrosDirectorio(new URLSearchParams(`teamId=${equipoA}&periodStart=2026-10-12&nivel=ALTO`)));
      assert.deepEqual(soloAlto.items.map((i) => i.employeeId), [id]);
    });

    await t.test("equipos pequeños no muestran agregados, y el tamaño mínimo cuenta personas evaluadas", async () => {
      const pequeno = await consultarEquipo(db, equipoB, "2026-10-12");
      assert.equal(pequeno.activo, false);
      assert.equal(pequeno.conteo, null);
      const equipoC = `EQ-5${digitos}`;
      await crearEquipo(db, { teamId: equipoC, nombre: `Equipo C ${s}`, liderId: null, gerenteId: null }, actor, reloj);
      await crearPersona(db, { employeeId: legajo("C1"), nombre: "Persona ficticia C1", tipo: "TECNICO", teamId: equipoC, desde: "2026-11-02", enCobertura: true }, actor, reloj);
      const c = await consultarEquipo(db, equipoC);
      assert.deepEqual([c.suprimido, c.conteo, c.alertasActivas, c.promedioIndice, c.personasActivas], ["GRUPO_PEQUENO", null, null, null, 1]);
      assert.equal(c.tareas, null);
      // With one team hidden, the smallest visible one is hidden too, so a total cannot reveal it.
      const lista = await (await get(protegido.equipos, "demo-rrhh", "/api/equipos")).json();
      assert.equal(lista.items.filter((e: { suprimido: string | null }) => e.suprimido === "COMPLEMENTARIA").length, 1);
      assert.equal(lista.items.find((e: { teamId: string }) => e.teamId === equipoC).suprimido, "GRUPO_PEQUENO");
    });
  } finally {
    await db.$transaction(
      async (tx) => {
        const prefijo = `ORG-${s}-`;
        const mias = await tx.empleado.findMany({ where: { employeeId: { startsWith: prefijo } }, select: { employeeId: true } });
        const ids = mias.map((m) => m.employeeId);
        const jobs = await tx.processingJobPar.findMany({ where: { periodo: { employeeId: { in: ids } } }, select: { jobId: true } });
        const jobIds = { in: jobs.map((j) => j.jobId) };
        await tx.processingJobPar.deleteMany({ where: { jobId: jobIds } });
        await tx.processingJob.deleteMany({ where: { jobId: jobIds } });
        await tx.alerta.deleteMany({ where: { employeeId: { in: ids } } });
        await tx.periodoEmpleado.updateMany({ where: { employeeId: { in: ids } }, data: { registroVigenteId: null, evaluacionVigenteId: null } });
        await tx.evaluacion.updateMany({ where: { employeeId: { in: ids } }, data: { supersedesEvaluationId: null } });
        await tx.evaluacion.deleteMany({ where: { employeeId: { in: ids } } });
        await tx.registroLaboral.deleteMany({ where: { employeeId: { in: ids } } });
        await tx.periodoEmpleado.deleteMany({ where: { employeeId: { in: ids } } });
        await tx.importacionTemporal.deleteMany({ where: { importId: { in: imports } } });
        await tx.importacion.deleteMany({ where: { importId: { in: imports } } });
        await tx.processingJob.deleteMany({ where: { rulesVersion: version } });
        await tx.configuracionIndice.deleteMany({ where: { version } });
        const equipos = [equipoA, equipoB, `EQ-5${digitos}`, `EQ-7${digitos}`];
        await tx.equipo.updateMany({ where: { teamId: { in: equipos } }, data: { liderId: null } });
        await tx.empleado.updateMany({ where: { employeeId: { in: ids } }, data: { responsableId: null } });
        await tx.asignacionEmpleado.deleteMany({ where: { employeeId: { in: ids } } });
        await tx.empleado.deleteMany({ where: { employeeId: { in: ids } } });
        await tx.equipo.deleteMany({ where: { teamId: { in: equipos } } });
        await tx.eventoAuditoria.deleteMany({
          where: {
            OR: [
              { actorId: actor.actorId },
              { sujetoId: { startsWith: prefijo } },
              { recursoId: { startsWith: prefijo } },
              { recursoId: { in: equipos } },
              { recursoId: { contains: s } },
              { recursoId: { contains: digitos } },
              { actorId: userIdTeamLead(equipoA) },
              // Denials of the permission checks above, recorded under the demo users.
              { accion: "ACCESO_DENEGADO", createdAt: { gte: inicio }, actorId: { in: ["demo-gerencia", "demo-empleado", "demo-rrhh"] } },
            ],
          },
        });
      },
      { timeout: 60000 },
    );
    await db.$disconnect();
  }
});
