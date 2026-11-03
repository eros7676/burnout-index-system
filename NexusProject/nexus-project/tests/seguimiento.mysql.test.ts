import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import {
  abrirSeguimiento,
  actualizarSeguimiento,
  anotarSeguimiento,
  cerrarSeguimiento,
  ErrorSeguimiento,
  marcarMedida,
  obtenerSeguimiento,
  registrarMedida,
} from "../src/server/services/seguimiento";
import { conAlerta, sesion } from "./alerta-fixture";

const rrhh = sesion("demo-rrhh");
const tl1 = sesion("demo-tl-01");
const tl2 = sesion("demo-tl-02");
const gerencia = sesion("demo-gerencia");

const sumarDias = (dias: number) =>
  new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

const rechaza = (promesa: Promise<unknown>, status: number, codigo?: string) =>
  assert.rejects(promesa, (e) => {
    assert.ok(e instanceof ErrorSeguimiento, String(e));
    assert.equal(e.status, status, e.message);
    if (codigo) assert.equal(e.detalles[0]?.codigo, codigo);
    return true;
  });

test("MySQL seguimiento: ciclo de vida del caso, permisos, atomicidad con la auditoría y un solo caso abierto", async (t) => {
  assert.match(
    new URL(process.env.TEST_DATABASE_URL!).pathname,
    /^\/[A-Za-z0-9_]+_test$/,
  );
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    const eventos = (employeeId: string) =>
      db.eventoAuditoria.findMany({
        where: { sujetoId: employeeId, entidad: "SEGUIMIENTO" },
        orderBy: [{ createdAt: "asc" }, { eventoId: "asc" }],
      });

    await t.test("un técnico: abrir, unirse, estados, responsable, notas, medidas y cierre", async () => {
      await conAlerta(db, {}, async (p) => {
        const [a1] = await p.alertas();
        // Gerencia reads a technician's alert but cannot follow it up; the Team Lead of another team sees nothing.
        const lectura = await obtenerSeguimiento(db, a1.alertId, gerencia);
        assert.equal(lectura.caso, null);
        assert.equal(lectura.permisos.abrir, false);
        await rechaza(abrirSeguimiento(db, a1.alertId, {}, gerencia), 403);
        await rechaza(obtenerSeguimiento(db, a1.alertId, tl2), 403);
        await rechaza(abrirSeguimiento(db, a1.alertId, {}, tl2), 403);
        assert.equal(await db.casoSeguimiento.count({ where: { employeeId: p.employeeId } }), 0);

        // Four simultaneous requests open one case and leave one event.
        const abiertos = await Promise.all(
          [rrhh, tl1, rrhh, tl1].map((s) => abrirSeguimiento(db, a1.alertId, {}, s)),
        );
        assert.equal(new Set(abiertos.map((a) => a.caso!.casoId)).size, 1);
        const caso = abiertos[0].caso!;
        assert.equal(await db.casoSeguimiento.count({ where: { employeeId: p.employeeId } }), 1);
        assert.equal(caso.estado, "NUEVO");
        assert.equal(caso.asignadoA.userId, "demo-tl-01", "defaults to the alert's recipient");
        assert.equal(caso.alertaOrigenId, a1.alertId);
        assert.equal(abiertos[0].relacion, "ORIGEN");
        let todos = await eventos(p.employeeId);
        assert.deepEqual(todos.map((e) => e.accion), ["SEGUIMIENTO_ABIERTO"]);
        assert.equal(todos[0].correlacionId, caso.casoId);
        assert.equal(todos[0].recursoId, caso.casoId);
        assert.equal(todos[0].actorRol === "RRHH" || todos[0].actorRol === "TEAM_LEAD", true);

        // A newer alert of the same person joins the open case: never a second one.
        await p.importarSemana("2026-10-19");
        const alertas = await p.alertas();
        assert.equal(alertas.length, 2);
        const a2 = alertas[1];
        const unida = await obtenerSeguimiento(db, a2.alertId, tl1);
        assert.equal(unida.caso?.casoId, caso.casoId);
        assert.equal(unida.relacion, "ADJUNTA");
        assert.equal((await abrirSeguimiento(db, a2.alertId, {}, tl1)).caso?.casoId, caso.casoId);
        assert.equal(await db.casoSeguimiento.count({ where: { employeeId: p.employeeId } }), 1);
        assert.equal((await eventos(p.employeeId)).length, 1, "joining writes nothing");

        // EN_CURSO needs a due date; the failed attempt changes and records nothing.
        await rechaza(actualizarSeguimiento(db, a1.alertId, { estado: "EN_CURSO" }, tl1), 422, "VENCE_OBLIGATORIO");
        await rechaza(actualizarSeguimiento(db, a1.alertId, { estado: "EN_ESPERA" }, tl1), 422, "TRANSICION_INVALIDA");
        await rechaza(actualizarSeguimiento(db, a1.alertId, { estado: "EN_CURSO", vence: "2020-01-01" }, tl1), 422, "VENCE_PASADO");
        assert.equal((await db.casoSeguimiento.findUniqueOrThrow({ where: { casoId: caso.casoId } })).estado, "NUEVO");
        assert.equal((await eventos(p.employeeId)).length, 1);

        const vence = sumarDias(10);
        const enCurso = await actualizarSeguimiento(db, a1.alertId, { estado: "EN_CURSO", vence }, tl1);
        assert.equal(enCurso.caso?.estado, "EN_CURSO");
        assert.equal(enCurso.caso?.vence, vence);
        assert.equal(enCurso.caso?.vencido, false);
        todos = await eventos(p.employeeId);
        assert.equal(todos.at(-1)!.accion, "SEGUIMIENTO_ACTUALIZADO");
        assert.deepEqual(todos.at(-1)!.cambios, [
          { campo: "estado", antes: "NUEVO", despues: "EN_CURSO" },
          { campo: "vence", antes: null, despues: vence },
        ]);
        // Repeating the same change records nothing.
        await actualizarSeguimiento(db, a1.alertId, { estado: "EN_CURSO", vence }, tl1);
        assert.equal((await eventos(p.employeeId)).length, 2);
        await actualizarSeguimiento(db, a1.alertId, { estado: "EN_ESPERA" }, tl1);
        assert.equal((await obtenerSeguimiento(db, a1.alertId, tl1)).caso?.estado, "EN_ESPERA");
        await actualizarSeguimiento(db, a1.alertId, { estado: "EN_CURSO" }, tl1);

        // Owner: the Team Lead cannot hand the case to RR. HH.; RR. HH. may, but only to somebody who can act on it.
        await rechaza(actualizarSeguimiento(db, a1.alertId, { asignadoA: "demo-rrhh" }, tl1), 403);
        await rechaza(actualizarSeguimiento(db, a1.alertId, { asignadoA: "demo-tl-02" }, rrhh), 422, "RESPONSABLE_INVALIDO");
        await rechaza(actualizarSeguimiento(db, a1.alertId, { asignadoA: "demo-gerencia" }, rrhh), 422, "RESPONSABLE_INVALIDO");

        // Notes: the owner and RR. HH. write them; their text never reaches the audit trail.
        const secreto = "Texto interno único 7f3a";
        await anotarSeguimiento(db, a1.alertId, { texto: secreto }, tl1);
        await rechaza(anotarSeguimiento(db, a1.alertId, { texto: "  " }, tl1), 422, "NOTA_INVALIDA");
        await rechaza(anotarSeguimiento(db, a1.alertId, { texto: "x".repeat(1001) }, rrhh), 422, "NOTA_INVALIDA");
        const conNota = await anotarSeguimiento(db, a1.alertId, { texto: "Nota de RR. HH." }, rrhh);
        assert.deepEqual(conNota.caso?.notas?.map((n) => n.texto), [secreto, "Nota de RR. HH."]);
        assert.doesNotMatch(JSON.stringify(await eventos(p.employeeId)), /7f3a|Nota de RR/);
        todos = await eventos(p.employeeId);
        assert.ok(todos.some((e) => e.accion === "SEGUIMIENTO_NOTA_AGREGADA" && (e.detalles as { notaId?: string }).notaId));

        // RR. HH. takes the case away from the Team Lead: they still see the case, but not its notes.
        await actualizarSeguimiento(db, a1.alertId, { asignadoA: "demo-rrhh" }, rrhh);
        const sinNotas = await obtenerSeguimiento(db, a1.alertId, tl1);
        assert.equal(sinNotas.caso?.notas, null);
        assert.equal(sinNotas.caso?.totalNotas, 2);
        assert.equal(sinNotas.permisos.anotar, false);
        await rechaza(anotarSeguimiento(db, a1.alertId, { texto: "Intento ajeno" }, tl1), 403);
        // The Team Lead may take it back (anyone allowed may take a case).
        const devuelto = await actualizarSeguimiento(db, a1.alertId, { asignadoA: "demo-tl-01" }, tl1);
        assert.equal(devuelto.caso?.asignadoA.userId, "demo-tl-01");
        assert.equal(devuelto.caso?.notas?.length, 2);

        // Measures: closed list, a responsible who can act, then marked done.
        await rechaza(registrarMedida(db, a1.alertId, { tipo: "REDISTRIBUIR_TAREAS", factor: "CT", responsableId: "demo-gerencia" }, tl1), 422, "RESPONSABLE_INVALIDO");
        await rechaza(registrarMedida(db, a1.alertId, { tipo: "HABLAR" as never, responsableId: "demo-tl-01" }, tl1), 422, "TIPO_INVALIDO");
        const conMedida = await registrarMedida(
          db,
          a1.alertId,
          { tipo: "REDISTRIBUIR_TAREAS", factor: "CT", responsableId: "demo-tl-01", vence: sumarDias(5) },
          tl1,
        );
        const medida = conMedida.caso!.medidas[0];
        assert.equal(medida.hecha, false);
        assert.equal(medida.responsable.userId, "demo-tl-01");
        await rechaza(marcarMedida(db, a1.alertId, { medidaId: "inexistente", hecha: true }, tl1), 404);

        // Closing: the reason must be true of the case; failed attempts leave it open.
        const justificacion = "Se redistribuyeron las tareas del equipo.";
        await rechaza(cerrarSeguimiento(db, a1.alertId, { motivoCierre: "MEDIDAS_IMPLEMENTADAS", justificacion }, tl1), 422, "MEDIDAS_PENDIENTES");
        await rechaza(cerrarSeguimiento(db, a1.alertId, { motivoCierre: "SUPERADA_POR_RECALCULO", justificacion }, tl1), 422, "ALERTA_VIGENTE");
        await rechaza(cerrarSeguimiento(db, a1.alertId, { motivoCierre: "BAJA_PERSONA", justificacion }, tl1), 422, "PERSONA_ACTIVA");
        await rechaza(cerrarSeguimiento(db, a1.alertId, { motivoCierre: "SIN_ACCION_NECESARIA", justificacion: "corto" }, tl1), 422, "JUSTIFICACION_INVALIDA");
        await rechaza(cerrarSeguimiento(db, a1.alertId, { motivoCierre: "SIN_ACCION_NECESARIA", justificacion }, tl2), 403);
        assert.equal((await db.casoSeguimiento.findUniqueOrThrow({ where: { casoId: caso.casoId } })).estado, "EN_CURSO");

        await marcarMedida(db, a1.alertId, { medidaId: medida.medidaId, hecha: true }, tl1);
        const antesDeCerrar = (await eventos(p.employeeId)).length;
        const cerrado = await cerrarSeguimiento(db, a1.alertId, { motivoCierre: "MEDIDAS_IMPLEMENTADAS", justificacion }, tl1);
        assert.equal(cerrado.caso?.estado, "CERRADO");
        assert.equal(cerrado.caso?.motivoCierre, "MEDIDAS_IMPLEMENTADAS");
        assert.equal(cerrado.caso?.cerradoPor?.userId, "demo-tl-01");
        const cierre = cerrado.caso!.notas!.at(-1)!;
        assert.equal(cierre.esCierre, true);
        assert.equal(cierre.texto, justificacion);
        assert.equal(cerrado.caso!.notas!.filter((n) => n.esCierre).length, 1);
        const final = (await eventos(p.employeeId)).slice(antesDeCerrar);
        assert.deepEqual(final.map((e) => e.accion), ["SEGUIMIENTO_CERRADO"]);
        assert.equal(final[0].justificacion, justificacion);
        assert.equal(final[0].correlacionId, caso.casoId);
        assert.deepEqual(final[0].cambios, [
          { campo: "estado", antes: "EN_CURSO", despues: "CERRADO" },
          { campo: "motivoCierre", antes: null, despues: "MEDIDAS_IMPLEMENTADAS" },
        ]);

        // Closed is final: no change, no note, no measure, no reopening from any alert of the person.
        await rechaza(actualizarSeguimiento(db, a1.alertId, { estado: "EN_CURSO", vence }, rrhh), 409);
        await rechaza(anotarSeguimiento(db, a1.alertId, { texto: "Tarde" }, rrhh), 409);
        await rechaza(registrarMedida(db, a1.alertId, { tipo: "AJUSTAR_PLAZOS", responsableId: "demo-rrhh" }, rrhh), 409);
        await rechaza(cerrarSeguimiento(db, a1.alertId, { motivoCierre: "SIN_ACCION_NECESARIA", justificacion }, rrhh), 409);
        await rechaza(abrirSeguimiento(db, a1.alertId, {}, rrhh), 409);
        // The alerts that existed when it closed stay covered by it.
        await rechaza(abrirSeguimiento(db, a2.alertId, {}, rrhh), 409);
        assert.equal(await db.casoSeguimiento.count({ where: { employeeId: p.employeeId } }), 1);
      });
    });

    await t.test("un caso nuevo nace con una alerta posterior al cierre", async () => {
      await conAlerta(db, {}, async (p) => {
        const [a1] = await p.alertas();
        const primero = await abrirSeguimiento(db, a1.alertId, {}, rrhh);
        await cerrarSeguimiento(
          db,
          a1.alertId,
          { motivoCierre: "SIN_ACCION_NECESARIA", justificacion: "Sin acción necesaria tras la revisión." },
          rrhh,
        );
        await new Promise((r) => setTimeout(r, 10));
        await p.importarSemana("2026-10-19");
        const a2 = (await p.alertas()).at(-1)!;
        const antes = await obtenerSeguimiento(db, a2.alertId, rrhh);
        assert.equal(antes.caso, null);
        assert.equal(antes.permisos.abrir, true);
        const segundo = await abrirSeguimiento(db, a2.alertId, {}, rrhh);
        assert.notEqual(segundo.caso?.casoId, primero.caso?.casoId);
        assert.equal(segundo.caso?.estado, "NUEVO");
        assert.equal(await db.casoSeguimiento.count({ where: { employeeId: p.employeeId } }), 2);
        // The first case keeps its alerts and stays closed.
        assert.equal((await obtenerSeguimiento(db, a1.alertId, rrhh)).caso?.estado, "CERRADO");
      });
    });

    await t.test("cada paso es atómico con su evento: si la auditoría falla, el cambio se revierte", async () => {
      await conAlerta(db, {}, async (p) => {
        const [a1] = await p.alertas();
        // A request id longer than the audit column makes the event insert fail inside the transaction.
        // The failure is the database's, not a rule of the service.
        const fallaDeBase = (e: unknown) =>
          e instanceof Error && !(e instanceof ErrorSeguimiento);
        const roto = (s: typeof rrhh) => ({
          ...s,
          actor: { ...s.actor, solicitudId: "x".repeat(40) },
        });
        await assert.rejects(abrirSeguimiento(db, a1.alertId, {}, roto(rrhh)), fallaDeBase);
        assert.equal(await db.casoSeguimiento.count({ where: { employeeId: p.employeeId } }), 0);
        assert.equal((await eventos(p.employeeId)).length, 0);

        const caso = (await abrirSeguimiento(db, a1.alertId, {}, rrhh)).caso!;
        const justificacion = "Se revisó la carga y no corresponde actuar.";
        await assert.rejects(actualizarSeguimiento(db, a1.alertId, { estado: "EN_CURSO", vence: sumarDias(2) }, roto(rrhh)), fallaDeBase);
        await assert.rejects(anotarSeguimiento(db, a1.alertId, { texto: "No debe quedar" }, roto(rrhh)), fallaDeBase);
        await assert.rejects(registrarMedida(db, a1.alertId, { tipo: "AJUSTAR_PLAZOS", responsableId: "demo-rrhh" }, roto(rrhh)), fallaDeBase);
        await assert.rejects(cerrarSeguimiento(db, a1.alertId, { motivoCierre: "SIN_ACCION_NECESARIA", justificacion }, roto(rrhh)), fallaDeBase);
        const fila = await db.casoSeguimiento.findUniqueOrThrow({
          where: { casoId: caso.casoId },
          include: { notas: true, medidas: true },
        });
        assert.equal(fila.estado, "NUEVO");
        assert.equal(fila.vence, null);
        assert.equal(fila.motivoCierre, null);
        assert.equal(fila.cerradoAt, null);
        assert.equal(fila.notas.length, 0, "ni siquiera la nota de cierre");
        assert.equal(fila.medidas.length, 0);
        assert.deepEqual((await eventos(p.employeeId)).map((e) => e.accion), ["SEGUIMIENTO_ABIERTO"]);
      });
    });

    await t.test("un Team Lead: su alerta va a Gerencia; solo Gerencia y RR. HH. la siguen", async () => {
      await conAlerta(db, { tipo: "TEAM_LEAD" }, async (p) => {
        const [a1] = await p.alertas();
        const base = await db.alerta.findUniqueOrThrow({ where: { alertId: a1.alertId } });
        assert.equal(base.destinatarioId, "GER-01");
        // The Team Lead of the team is not the recipient of their own alert.
        await rechaza(abrirSeguimiento(db, a1.alertId, {}, tl1), 403);
        const abierto = await abrirSeguimiento(db, a1.alertId, {}, gerencia);
        assert.equal(abierto.caso?.asignadoA.userId, "demo-gerencia");
        assert.deepEqual(abierto.asignables.map((u) => u.userId), ["demo-rrhh", "demo-gerencia"]);
        await actualizarSeguimiento(db, a1.alertId, { estado: "EN_CURSO", vence: sumarDias(3) }, gerencia);
        await anotarSeguimiento(db, a1.alertId, { texto: "Revisión con Gerencia." }, gerencia);
        const vistaTl = await obtenerSeguimiento(db, a1.alertId, tl1);
        assert.equal(vistaTl.caso?.notas, null, "el Team Lead ve el estado, no las notas");
        assert.equal(vistaTl.permisos.gestionar, false);
        // RR. HH. reaches every case but hands it only to somebody who may act on it.
        await rechaza(actualizarSeguimiento(db, a1.alertId, { asignadoA: "demo-tl-01" }, rrhh), 422, "RESPONSABLE_INVALIDO");
        const aRrhh = await actualizarSeguimiento(db, a1.alertId, { asignadoA: "demo-rrhh" }, rrhh);
        assert.equal(aRrhh.caso?.asignadoA.userId, "demo-rrhh");
      });
    });

    await t.test("sin destinatario: el seguimiento va a la cola de RR. HH. y solo RR. HH. lo gestiona", async () => {
      await conAlerta(db, { sinResponsable: true }, async (p) => {
        const [a1] = await p.alertas();
        const lectura = await obtenerSeguimiento(db, a1.alertId, rrhh);
        assert.equal(lectura.asignadoPorDefecto, "demo-rrhh");
        assert.deepEqual(lectura.asignables.map((u) => u.userId), ["demo-rrhh"]);
        await rechaza(abrirSeguimiento(db, a1.alertId, {}, tl1), 403);
        await rechaza(abrirSeguimiento(db, a1.alertId, {}, gerencia), 403);
        const abierto = await abrirSeguimiento(db, a1.alertId, {}, rrhh);
        assert.equal(abierto.caso?.asignadoA.userId, "demo-rrhh");
      });
    });

    await t.test("una alerta superada no abre un caso nuevo; se cierra un caso por recálculo solo si su alerta fue superada", async () => {
      await conAlerta(db, {}, async (p) => {
        const [a1] = await p.alertas();
        const caso = (await abrirSeguimiento(db, a1.alertId, {}, rrhh)).caso!;
        await db.alerta.update({ where: { alertId: a1.alertId }, data: { vigencia: "SUPERADA" } });
        const justificacion = "La alerta fue reemplazada por el recálculo.";
        assert.equal((await obtenerSeguimiento(db, a1.alertId, rrhh)).caso?.casoId, caso.casoId);
        const cerrado = await cerrarSeguimiento(db, a1.alertId, { motivoCierre: "SUPERADA_POR_RECALCULO", justificacion }, rrhh);
        assert.equal(cerrado.caso?.motivoCierre, "SUPERADA_POR_RECALCULO");
      });
      await conAlerta(db, {}, async (p) => {
        const [a1] = await p.alertas();
        await db.alerta.update({ where: { alertId: a1.alertId }, data: { vigencia: "SUPERADA" } });
        await rechaza(abrirSeguimiento(db, a1.alertId, {}, rrhh), 409);
        assert.equal((await obtenerSeguimiento(db, a1.alertId, rrhh)).permisos.abrir, false);
      });
    });

    await t.test("una alerta inexistente es 404", async () => {
      await rechaza(obtenerSeguimiento(db, "no-existe", rrhh), 404);
      await rechaza(abrirSeguimiento(db, "no-existe", {}, rrhh), 404);
    });
  } finally {
    await db.$disconnect();
  }
});
