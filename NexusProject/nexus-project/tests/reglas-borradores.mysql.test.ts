import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { crearHttpReglas } from "../src/server/http/reglas";
import { proteger, tokenDemo } from "../src/server/http/permisos-demo";
import type { ContextoAuditoria } from "../src/server/repositories/auditoria";
import {
  confirmarImportacion,
  validarImportacion,
} from "../src/server/services/importaciones";
import { procesarImportacion } from "../src/server/services/procesamientos";
import {
  actualizarBorrador,
  aprobarBorrador,
  crearBorrador,
  descartarBorrador,
  enviarBorrador,
  listarBorradores,
  listarVersiones,
  obtenerBorrador,
  publicarBorrador,
  rechazarBorrador,
  simularBorrador,
} from "../src/server/services/reglas-borradores";
import { ErrorBorrador, siguienteVersion } from "../src/server/services/reglas-politica";
import { simularImpacto } from "../src/server/services/reglas-simulacion";
import type { BorradorReglasDTO, PropuestaReglas } from "../src/shared/contratos/reglas";

// Drafts of rules against a real MySQL: the whole lifecycle, atomicity with the audit
// events, a simulation that writes nothing, and the prediction against the real recalculation.

const ahora = () => new Date("2026-11-10T15:00:00Z"); // Tuesday; the week starts 2026-11-09
const contexto = (actorId: string, actorRol: string): ContextoAuditoria => ({
  actorId,
  actorNombre: actorRol,
  actorRol,
  origen: "WEB",
});
const rrhh = contexto("b5-rrhh", "RRHH");
const gerencia = contexto("b5-gerencia", "GERENCIA");
const opciones = { ahora };

const rechazadoCon = (codigo: string) => (error: unknown) => {
  assert.ok(error instanceof ErrorBorrador, String(error));
  assert.equal(error.codigo, codigo);
  return true;
};

// Heavy weeks (index 83,71 under v1, Alto from the second week) and light ones.
const PESADA = "16,16,10,7,5,14,56,127";
const LIVIANA = "2,1,10,2,0,3,40,10";
const SEMANAS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const fin = (inicio: string) =>
  new Date(new Date(`${inicio}T00:00:00Z`).getTime() + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);

test("MySQL B5: borradores de reglas, del alta a la publicación", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, "Ejecutar con npm run db:test y TEST_DATABASE_URL.");
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  const sufijo = randomUUID().slice(0, 8);
  const pesada = `B5-${sufijo}-A`;
  const liviana = `B5-${sufijo}-B`;
  const importaciones: string[] = [];
  const actores = ["b5-rrhh", "b5-gerencia"];
  const inicio = new Date();

  const contar = async () => ({
    evaluaciones: await db.evaluacion.count(),
    alertas: await db.alerta.count(),
    trabajos: await db.processingJob.count(),
    pares: await db.processingJobPar.count(),
    versiones: await db.configuracionIndice.count(),
    periodos: await db.periodoEmpleado.count(),
    registros: await db.registroLaboral.count(),
  });
  const eventos = (borradorId: string) =>
    db.eventoAuditoria.findMany({
      where: { correlacionId: borradorId },
      orderBy: [{ createdAt: "asc" }, { eventoId: "asc" }],
    });
  const acciones = async (borradorId: string) =>
    (await eventos(borradorId)).map((e) => e.accion);
  const versionesExistentes = async () =>
    (await db.configuracionIndice.findMany({ select: { version: true } })).map(
      (v) => v.version,
    );

  /** A draft with the reason written and the given proposal, ready to simulate. */
  async function borradorCon(
    cambios: (base: PropuestaReglas) => PropuestaReglas,
    motivo = "Ajuste de umbrales acordado con la representación del personal.",
  ): Promise<BorradorReglasDTO> {
    const creado = await crearBorrador(db, rrhh, opciones);
    return actualizarBorrador(
      db,
      creado.borradorId,
      { huella: creado.huella, motivo, propuesta: cambios(creado.propuesta) },
      rrhh,
      opciones,
    );
  }
  /** Looser thresholds. Each scenario uses its own `he` so a draft never repeats the parameters in force. */
  const holgura = (
    base: PropuestaReglas,
    effectiveFrom: string,
    he = 20,
  ): PropuestaReglas => ({
    ...base,
    thresholds: { HE: he, DS: 30, CT: 1, VP: 30 },
    effectiveFrom,
  });

  try {
    await db.$transaction((tx) => sembrarBase(tx));
    await db.empleado.createMany({
      data: [
        { employeeId: pesada, nombre: "Persona ficticia B5 A", tipo: "TECNICO", teamId: "EQ-01", responsableId: "TL-01" },
        { employeeId: liviana, nombre: "Persona ficticia B5 B", tipo: "TECNICO", teamId: "EQ-02", responsableId: "TL-02" },
      ],
    });
    const csv =
      "employee_id,period_start,period_end,horas_extra,dias_consecutivos_sin_descanso,tareas_activas,tareas_pendientes,tareas_vencidas,vacaciones_pendientes_dias,horas_trabajadas,dias_desde_ultimas_vacaciones\n" +
      SEMANAS.flatMap((inicio) => [
        `${pesada},${inicio},${fin(inicio)},${PESADA}`,
        `${liviana},${inicio},${fin(inicio)},${LIVIANA}`,
      ]).join("\n") +
      "\n";
    const vista = await validarImportacion(db, new File([csv], "b5.csv"), "demo-local", {
      ahora: () => new Date("2026-11-10T12:00:00Z"),
    });
    importaciones.push(vista.importId);
    const confirmada = await confirmarImportacion(db, vista.importId, "demo-local", {
      ahora: () => new Date("2026-11-10T12:00:00Z"),
    });
    assert.equal(confirmada.procesamiento?.estado, "COMPLETADO");

    await t.test("el borrador nace de la versión en vigor, con el motivo pendiente y un evento de alta", async () => {
      const antes = await contar();
      const borrador = await crearBorrador(db, rrhh, opciones);
      assert.equal(borrador.estado, "BORRADOR");
      assert.equal(borrador.baseVersion, "v1");
      assert.equal(borrador.propuesta.effectiveFrom, "2026-11-16", "próximo lunes libre");
      assert.deepEqual(borrador.cambios, []);
      assert.equal(borrador.motivo, "");
      assert.equal(borrador.creadoPor.rol, "RRHH");
      assert.equal(borrador.requiereAprobacion, false, "no hay semanas desde el 16 de noviembre");
      assert.deepEqual(
        borrador.problemas.map((p) => p.campo).sort(),
        ["motivo", "propuesta"].sort(),
        "falta el motivo y no hay cambios respecto de v1",
      );
      const [evento] = await eventos(borrador.borradorId);
      assert.equal(evento.accion, "REGLAS_BORRADOR_CREADO");
      assert.equal(evento.entidad, "REGLAS");
      assert.equal(evento.actorId, "b5-rrhh");
      assert.equal(evento.actorRol, "RRHH");
      assert.equal(evento.correlacionId, borrador.borradorId);
      assert.deepEqual(await contar(), { ...antes });
      await descartarBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones);
    });

    await t.test("quien no edita reglas no crea, y Gerencia no edita ni publica", async () => {
      await assert.rejects(crearBorrador(db, gerencia, opciones), rechazadoCon("SIN_PERMISO"));
      await assert.rejects(
        crearBorrador(db, contexto("tl", "TEAM_LEAD"), opciones),
        rechazadoCon("SIN_PERMISO"),
      );
      const borrador = await borradorCon((b) => holgura(b, "2026-11-16"));
      await assert.rejects(
        actualizarBorrador(
          db,
          borrador.borradorId,
          { huella: borrador.huella, motivo: borrador.motivo, propuesta: borrador.propuesta },
          gerencia,
          opciones,
        ),
        rechazadoCon("SIN_PERMISO"),
      );
      await assert.rejects(
        publicarBorrador(db, borrador.borradorId, { huella: borrador.huella }, gerencia, opciones),
        rechazadoCon("SIN_PERMISO"),
      );
      await assert.rejects(
        aprobarBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones),
        rechazadoCon("SIN_PERMISO"),
      );
      await descartarBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones);
    });

    await t.test("guardar valida todo en el servidor y conserva lo escrito ante un rechazo", async () => {
      const creado = await crearBorrador(db, rrhh, opciones);
      const intento = (cuerpo: object) =>
        actualizarBorrador(db, creado.borradorId, { huella: creado.huella, ...cuerpo }, rrhh, opciones);
      const rechazo = await intento({
        motivo: "corto",
        propuesta: {
          ...creado.propuesta,
          weights: { HE: 0.5, DS: 0.3, CT: 0.25, VP: 0.15 },
          effectiveFrom: "2026-11-17",
        },
      }).then(
        () => assert.fail("debía rechazarse"),
        (error: unknown) => error,
      );
      assert.ok(rechazo instanceof ErrorBorrador);
      assert.equal(rechazo.status, 422);
      assert.deepEqual(rechazo.detalles.map((d) => d.campo).sort(), ["effectiveFrom", "motivo", "weights"]);
      // Fecha ya ocupada por una versión, anterior a la primera, y fuera del horizonte.
      for (const [fecha, texto] of [
        ["2026-01-05", /posterior/],
        ["2028-01-03", /52 semanas/],
      ] as const) {
        const e = await intento({
          motivo: "Motivo suficiente para el cambio.",
          propuesta: { ...creado.propuesta, effectiveFrom: fecha },
        }).catch((error: ErrorBorrador) => error);
        assert.match((e as ErrorBorrador).detalles[0].detalle, texto);
      }
      const intacto = await obtenerBorrador(db, creado.borradorId, opciones);
      assert.equal(intacto.huella, creado.huella, "un rechazo no cambia el borrador");
      assert.deepEqual(await acciones(creado.borradorId), ["REGLAS_BORRADOR_CREADO"]);
      await descartarBorrador(db, creado.borradorId, { huella: creado.huella }, rrhh, opciones);
    });

    await t.test("la huella evita pisar un cambio ajeno y dos ediciones simultáneas no se mezclan", async () => {
      const creado = await borradorCon((b) => holgura(b, "2026-11-16"));
      const editar = (motivo: string) =>
        actualizarBorrador(
          db,
          creado.borradorId,
          { huella: creado.huella, motivo, propuesta: creado.propuesta },
          rrhh,
          opciones,
        );
      const resultados = await Promise.allSettled([
        editar("Primera redacción del motivo del cambio."),
        editar("Segunda redacción del motivo del cambio."),
      ]);
      assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
      const perdedor = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
      assert.ok(rechazadoCon("CONFLICTO_EDICION")(perdedor.reason));
      assert.equal(perdedor.reason.status, 409);
      const final = await obtenerBorrador(db, creado.borradorId, opciones);
      assert.notEqual(final.huella, creado.huella);
      assert.equal(
        (await acciones(creado.borradorId)).filter((a) => a === "REGLAS_BORRADOR_ACTUALIZADO").length,
        2,
        "la edición de borradorCon más la ganadora",
      );
      await descartarBorrador(db, creado.borradorId, { huella: final.huella }, rrhh, opciones);
    });

    await t.test("simular no escribe evaluaciones, alertas, trabajos ni versiones", async () => {
      const borrador = await borradorCon((b) => holgura(b, "2026-10-12"));
      const antes = await contar();
      const sola = await simularImpacto(db, borrador.propuesta, ahora());
      assert.deepEqual(await contar(), antes, "el cálculo en seco es de solo lectura");
      assert.equal(sola.alcance.semanas, 6);
      assert.equal(sola.alcance.personas, 2);
      assert.equal(sola.alcance.hasta, null);
      assert.deepEqual(sola.antes, { BAJO: 3, MEDIO: 0, ALTO: 3, INCOMPLETO: 0 });
      assert.deepEqual(sola.despues, { BAJO: 6, MEDIO: 0, ALTO: 0, INCOMPLETO: 0 });
      assert.deepEqual(sola.transiciones, [{ de: "ALTO", a: "BAJO", semanas: 3 }]);
      assert.equal(sola.personasConCambio, 1);
      assert.deepEqual(sola.alertas, { nuevas: 0, superadas: 3 });
      // Dos equipos de una persona cada uno: ninguno llega al mínimo.
      assert.ok(sola.equipos.length >= 2 && sola.equipos.every((e) => e.suprimido));

      const simulado = await simularBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones);
      assert.equal(simulado.simulado, true);
      assert.equal(simulado.simulacionVigente, true);
      assert.equal(simulado.requiereAprobacion, true);
      assert.deepEqual(await contar(), antes, "guardar el resultado solo toca el borrador");
      assert.equal(simulado.simulacion?.alcance.semanas, 6);
      assert.deepEqual(await acciones(borrador.borradorId), [
        "REGLAS_BORRADOR_CREADO",
        "REGLAS_BORRADOR_ACTUALIZADO",
        "REGLAS_BORRADOR_SIMULADO",
      ]);
      const [evento] = (await eventos(borrador.borradorId)).slice(-1);
      assert.deepEqual(evento.detalles, {
        semanas: 6,
        personas: 2,
        semanasConCambio: 3,
        retroactivo: true,
      });
      // Editar vuelve a pedir la simulación.
      const editado = await actualizarBorrador(
        db,
        borrador.borradorId,
        { huella: simulado.huella, motivo: simulado.motivo + " Revisado.", propuesta: simulado.propuesta },
        rrhh,
        opciones,
      );
      assert.equal(editado.simulado, false);
      assert.equal(editado.simulacion, null);
      await descartarBorrador(db, borrador.borradorId, { huella: editado.huella }, rrhh, opciones);
    });

    await t.test("el alcance de una simulación tiene tope", async () => {
      const borrador = await borradorCon((b) => holgura(b, "2026-10-12"));
      await assert.rejects(
        simularBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, { ahora, limiteSemanas: 5 }),
        (error: unknown) => {
          assert.ok(rechazadoCon("ALCANCE_EXCESIVO")(error));
          assert.match((error as ErrorBorrador).message, /modifica 6 semanas.*hasta 5/);
          return true;
        },
      );
      assert.equal((await obtenerBorrador(db, borrador.borradorId, opciones)).simulacion, null);
      await descartarBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones);
    });

    await t.test("una versión con fecha futura se publica sin aprobación, por el camino de siempre", async () => {
      const borrador = await borradorCon((b) => holgura(b, "2026-11-16"));
      const nombre = siguienteVersion(await versionesExistentes());
      await assert.rejects(
        publicarBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones),
        rechazadoCon("SIN_SIMULACION"),
      );
      const simulado = await simularBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones);
      assert.equal(simulado.requiereAprobacion, false);
      assert.equal(simulado.simulacion?.alcance.semanas, 0);
      await assert.rejects(
        enviarBorrador(db, borrador.borradorId, { huella: simulado.huella }, rrhh, opciones),
        rechazadoCon("ESTADO_INCOMPATIBLE"),
      );
      const antes = await contar();
      const publicado = await publicarBorrador(db, borrador.borradorId, { huella: simulado.huella }, rrhh, opciones);
      assert.equal(publicado.version.version, nombre);
      assert.equal(publicado.version.estado, "COMPLETADO");
      assert.equal(publicado.version.semanas, 0);
      assert.equal(publicado.borrador.estado, "PUBLICADO");
      assert.equal(publicado.borrador.versionPublicada, nombre);
      assert.equal(publicado.borrador.publicacion?.jobId, publicado.version.jobId);
      assert.equal((await contar()).versiones, antes.versiones + 1);
      assert.equal((await contar()).trabajos, antes.trabajos + 1);

      const version = await db.configuracionIndice.findUniqueOrThrow({ where: { version: nombre } });
      assert.equal(version.createdBy, "b5-rrhh", "el autor sale de la sesión, no del cuerpo");
      assert.equal(version.effectiveFrom.toISOString().slice(0, 10), "2026-11-16");
      assert.deepEqual(version.thresholds, { HE: 20, DS: 30, CT: 1, VP: 30 });
      const trabajo = await db.processingJob.findUniqueOrThrow({ where: { jobId: publicado.version.jobId } });
      assert.equal(trabajo.origen, "CAMBIO_REGLAS");
      assert.equal(trabajo.rulesVersion, nombre);

      const publicacion = await db.eventoAuditoria.findUniqueOrThrow({
        where: { clave: `REGLAS:${nombre}:REGLAS_PUBLICADAS` },
      });
      assert.equal(publicacion.correlacionId, borrador.borradorId);
      assert.equal(publicacion.actorId, "b5-rrhh");
      assert.equal(publicacion.justificacion, borrador.motivo);
      assert.ok(
        (publicacion.cambios as { campo: string }[]).some((c) => c.campo === "thresholds.DS"),
        "el evento lleva los parámetros que cambiaron",
      );
      assert.ok(
        (await acciones(borrador.borradorId)).includes("REGLAS_PUBLICADAS"),
        "la publicación se ve en el historial del borrador",
      );

      // Cerrado: no se modifica, no se publica de nuevo.
      await assert.rejects(
        actualizarBorrador(
          db,
          borrador.borradorId,
          { huella: simulado.huella, motivo: simulado.motivo, propuesta: simulado.propuesta },
          rrhh,
          opciones,
        ),
        rechazadoCon("ESTADO_INCOMPATIBLE"),
      );
      await assert.rejects(
        publicarBorrador(db, borrador.borradorId, { huella: simulado.huella }, rrhh, opciones),
        rechazadoCon("ESTADO_INCOMPATIBLE"),
      );

      const { versiones, vigente } = await listarVersiones(db, opciones);
      const nueva = versiones.find((v) => v.version === nombre)!;
      assert.equal(nueva.estado, "PROGRAMADA", "empieza el 16 de noviembre y hoy es 10");
      assert.equal(nueva.motivo, borrador.motivo);
      assert.equal(nueva.borradorId, borrador.borradorId);
      assert.equal(nueva.createdBy.rol, "RRHH");
      assert.equal(vigente.version, "v1", "una versión programada no es la vigente");
      assert.equal(versiones.find((v) => v.version === "v1")?.estado, "VIGENTE");
    });

    await t.test("una simulación de datos viejos no se publica, y la fecha de una versión no se repite", async () => {
      const [primero, segundo] = [
        await borradorCon((b) => holgura(b, "2026-11-23", 21)),
        await borradorCon((b) => ({ ...holgura(b, "2026-12-07", 22), mediumLimit: 35 })),
      ];
      const s1 = await simularBorrador(db, primero.borradorId, { huella: primero.huella }, rrhh, opciones);
      const s2 = await simularBorrador(db, segundo.borradorId, { huella: segundo.huella }, rrhh, opciones);
      // La publicación del segundo cambia la "versión siguiente" que el primero simuló.
      await publicarBorrador(db, segundo.borradorId, { huella: s2.huella }, rrhh, opciones);
      const viejo = await obtenerBorrador(db, primero.borradorId, opciones);
      assert.equal(viejo.simulado, true, "la huella sigue siendo la misma");
      assert.equal(viejo.simulacionVigente, false, "pero los datos de la simulación cambiaron");
      await assert.rejects(
        publicarBorrador(db, primero.borradorId, { huella: s1.huella }, rrhh, opciones),
        rechazadoCon("SIMULACION_DESACTUALIZADA"),
      );
      const reSimulado = await simularBorrador(db, primero.borradorId, { huella: s1.huella }, rrhh, opciones);
      const publicado = await publicarBorrador(db, primero.borradorId, { huella: reSimulado.huella }, rrhh, opciones);
      assert.equal(publicado.borrador.estado, "PUBLICADO");

      // Esa fecha ya pertenece a una versión.
      const repetido = await crearBorrador(db, rrhh, opciones);
      await assert.rejects(
        actualizarBorrador(
          db,
          repetido.borradorId,
          {
            huella: repetido.huella,
            motivo: "Motivo suficiente para el cambio.",
            propuesta: holgura(repetido.propuesta, "2026-11-23", 25),
          },
          rrhh,
          opciones,
        ),
        (error: unknown) => {
          assert.ok(rechazadoCon("CONFIGURACION_INVALIDA")(error));
          assert.match((error as ErrorBorrador).detalles[0].detalle, /Ya existe una versión/);
          return true;
        },
      );
      await descartarBorrador(db, repetido.borradorId, { huella: repetido.huella }, rrhh, opciones);
    });

    await t.test("una versión retroactiva necesita la aprobación de otra persona y se recalcula como se simuló", async () => {
      const borrador = await borradorCon((b) => holgura(b, "2026-10-12"));
      const simulado = await simularBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones);
      const prediccion = simulado.simulacion!;
      const nombre = siguienteVersion(await versionesExistentes());

      // Sin aprobación no se publica, ni siquiera por quien la creó, y nada queda a medias.
      const antes = await contar();
      await assert.rejects(
        publicarBorrador(db, borrador.borradorId, { huella: simulado.huella }, rrhh, opciones),
        rechazadoCon("APROBACION_REQUERIDA"),
      );
      assert.deepEqual(await contar(), antes);

      const enRevision = await enviarBorrador(db, borrador.borradorId, { huella: simulado.huella }, rrhh, opciones);
      assert.equal(enRevision.estado, "EN_REVISION");
      assert.equal(enRevision.retroactivo, true);
      await assert.rejects(
        publicarBorrador(db, borrador.borradorId, { huella: simulado.huella }, rrhh, opciones),
        rechazadoCon("APROBACION_REQUERIDA"),
      );

      // Aprobar: el rol lo da la sesión y la persona debe ser otra.
      await assert.rejects(
        aprobarBorrador(db, borrador.borradorId, { huella: simulado.huella }, rrhh, opciones),
        rechazadoCon("SIN_PERMISO"),
      );
      const mismoUsuario = contexto("b5-rrhh", "GERENCIA");
      await assert.rejects(
        aprobarBorrador(db, borrador.borradorId, { huella: simulado.huella }, mismoUsuario, opciones),
        rechazadoCon("MISMA_PERSONA"),
      );
      await assert.rejects(
        aprobarBorrador(db, borrador.borradorId, { huella: "f".repeat(64) }, gerencia, opciones),
        rechazadoCon("CONFLICTO_EDICION"),
      );
      const aprobado = await aprobarBorrador(db, borrador.borradorId, { huella: simulado.huella }, gerencia, opciones);
      assert.equal(aprobado.aprobadoPor?.userId, "b5-gerencia");
      assert.equal(aprobado.aprobadoPor?.rol, "GERENCIA");
      assert.ok(aprobado.aprobadoAt);
      // Aprobado queda cerrado al cambio.
      await assert.rejects(
        actualizarBorrador(
          db,
          borrador.borradorId,
          { huella: simulado.huella, motivo: simulado.motivo, propuesta: simulado.propuesta },
          rrhh,
          opciones,
        ),
        rechazadoCon("ESTADO_INCOMPATIBLE"),
      );
      await assert.rejects(
        aprobarBorrador(db, borrador.borradorId, { huella: simulado.huella }, gerencia, opciones),
        rechazadoCon("ESTADO_INCOMPATIBLE"),
      );

      const publicado = await publicarBorrador(db, borrador.borradorId, { huella: simulado.huella }, rrhh, opciones);
      assert.equal(publicado.version.version, nombre);
      assert.equal(publicado.version.estado, "PENDIENTE");
      assert.equal(publicado.version.semanas, 6);
      assert.equal(publicado.borrador.aprobadoPor?.rol, "GERENCIA");
      const pares = await db.processingJobPar.findMany({
        where: { jobId: publicado.version.jobId },
        orderBy: { orden: "asc" },
        include: { periodo: true },
      });
      assert.equal(pares.length, 6);
      assert.deepEqual(
        pares.map((p) => `${p.periodo.employeeId}/${p.periodo.periodStart.toISOString().slice(0, 10)}`),
        [pesada, liviana].sort().flatMap((id) =>
          ["2026-10-12", "2026-10-19", "2026-10-26"].map((s) => `${id}/${s}`),
        ),
        "empleado y fecha, como el trabajo de siempre",
      );
      assert.deepEqual(await acciones(borrador.borradorId), [
        "REGLAS_BORRADOR_CREADO",
        "REGLAS_BORRADOR_ACTUALIZADO",
        "REGLAS_BORRADOR_SIMULADO",
        "REGLAS_BORRADOR_EN_REVISION",
        "REGLAS_BORRADOR_APROBADO",
        "REGLAS_PUBLICADAS",
      ]);

      // El recálculo real coincide con lo que anticipó la simulación.
      const trabajo = await procesarImportacion(db, publicado.version.jobId);
      assert.equal(trabajo.estado, "COMPLETADO");
      const vigentes = await db.periodoEmpleado.findMany({
        where: {
          employeeId: { in: [pesada, liviana] },
          periodStart: { gte: new Date("2026-10-12T00:00:00Z") },
        },
        include: { evaluacionVigente: true },
      });
      const real = { BAJO: 0, MEDIO: 0, ALTO: 0, INCOMPLETO: 0 };
      for (const periodo of vigentes) {
        assert.equal(periodo.evaluacionVigente?.rulesVersion, nombre);
        real[periodo.evaluacionVigente!.nivel]++;
      }
      assert.deepEqual(real, prediccion.despues);
      assert.equal(
        await db.alerta.count({ where: { employeeId: pesada, vigencia: "ACTIVA" } }),
        0,
        "las alertas Alto quedaron superadas, como se anticipó",
      );
    });

    await t.test("rechazar devuelve el borrador a su autor con una justificación que queda registrada", async () => {
      const borrador = await borradorCon((b) => holgura(b, "2026-10-19", 22));
      const s = await simularBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones);
      await enviarBorrador(db, borrador.borradorId, { huella: s.huella }, rrhh, opciones);
      await assert.rejects(
        rechazarBorrador(db, borrador.borradorId, { huella: s.huella, justificacion: "no" }, gerencia, opciones),
        (error: unknown) => {
          assert.ok(rechazadoCon("CONFIGURACION_INVALIDA")(error));
          assert.equal((error as ErrorBorrador).detalles[0].campo, "justificacion");
          return true;
        },
      );
      for (const ronda of [1, 2]) {
        const justificacion = `Falta sustento del cambio, ronda ${ronda}.`;
        const rechazado = await rechazarBorrador(
          db,
          borrador.borradorId,
          { huella: s.huella, justificacion },
          gerencia,
          opciones,
        );
        assert.equal(rechazado.estado, "BORRADOR");
        assert.equal(rechazado.simulado, true, "el contenido no cambió: la simulación sigue valiendo");
        const rechazo = (await eventos(borrador.borradorId)).filter(
          (e) => e.accion === "REGLAS_BORRADOR_RECHAZADO",
        );
        assert.equal(rechazo.length, ronda, "rechazar es repetible");
        assert.equal(rechazo.at(-1)!.justificacion, justificacion);
        assert.equal(
          rechazado.historial.at(-1)?.justificacion,
          justificacion,
          "quien edita ve el motivo del rechazo",
        );
        if (ronda === 1)
          await enviarBorrador(db, borrador.borradorId, { huella: s.huella }, rrhh, opciones);
      }
      // Editar un borrador en revisión lo devuelve a borrador.
      await enviarBorrador(db, borrador.borradorId, { huella: s.huella }, rrhh, opciones);
      const editado = await actualizarBorrador(
        db,
        borrador.borradorId,
        { huella: s.huella, motivo: s.motivo + " Con sustento adjunto.", propuesta: s.propuesta },
        rrhh,
        opciones,
      );
      assert.equal(editado.estado, "BORRADOR");
      assert.equal(editado.simulado, false);
      const ultimo = (await eventos(borrador.borradorId)).at(-1)!;
      assert.deepEqual(
        (ultimo.cambios as { campo: string }[]).map((c) => c.campo),
        ["estado"],
      );
      await descartarBorrador(db, borrador.borradorId, { huella: editado.huella }, rrhh, opciones);
    });

    await t.test("descartar cierra el borrador y conserva su historia", async () => {
      const borrador = await borradorCon((b) => holgura(b, "2026-11-30", 23));
      const descartado = await descartarBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones);
      assert.equal(descartado.estado, "DESCARTADO");
      assert.equal((await acciones(borrador.borradorId)).at(-1), "REGLAS_BORRADOR_DESCARTADO");
      for (const paso of [
        () => descartarBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones),
        () => simularBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones),
        () => publicarBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones),
      ])
        await assert.rejects(paso(), rechazadoCon("ESTADO_INCOMPATIBLE"));
      const { items } = await listarBorradores(db, { estado: "DESCARTADO", page: 1, pageSize: 100 });
      assert.ok(items.some((i) => i.borradorId === borrador.borradorId));
    });

    await t.test("el paso y su evento se confirman juntos o ninguno", async () => {
      // Aprobación: el evento ya existe, así que su inserción falla y la aprobación se revierte.
      const borrador = await borradorCon((b) => holgura(b, "2026-10-26", 24));
      const s = await simularBorrador(db, borrador.borradorId, { huella: borrador.huella }, rrhh, opciones);
      await enviarBorrador(db, borrador.borradorId, { huella: s.huella }, rrhh, opciones);
      await db.eventoAuditoria.create({
        data: {
          clave: `REGLAS:${borrador.borradorId}:REGLAS_BORRADOR_APROBADO`,
          accion: "REGLAS_BORRADOR_APROBADO",
          entidad: "REGLAS",
          recursoId: borrador.borradorId,
          actorId: "b5-bloqueo",
          detalles: {},
        },
      });
      await assert.rejects(
        aprobarBorrador(db, borrador.borradorId, { huella: s.huella }, gerencia, opciones),
      );
      const fila = await db.borradorReglas.findUniqueOrThrow({ where: { borradorId: borrador.borradorId } });
      assert.equal(fila.aprobadoPor, null);
      assert.equal(fila.aprobadoAt, null);
      assert.equal(fila.estado, "EN_REVISION");
      await db.eventoAuditoria.deleteMany({ where: { actorId: "b5-bloqueo" } });
      await aprobarBorrador(db, borrador.borradorId, { huella: s.huella }, gerencia, opciones);

      // Publicación: el evento de publicación falla al final, después de crear versión y trabajo.
      const nombre = siguienteVersion(await versionesExistentes());
      await db.eventoAuditoria.create({
        data: {
          clave: `REGLAS:${nombre}:REGLAS_PUBLICADAS`,
          accion: "REGLAS_PUBLICADAS",
          entidad: "REGLAS",
          recursoId: nombre,
          actorId: "b5-bloqueo",
          detalles: {},
        },
      });
      const antes = await contar();
      await assert.rejects(
        publicarBorrador(db, borrador.borradorId, { huella: s.huella }, rrhh, opciones),
      );
      assert.deepEqual(await contar(), antes, "ni versión, ni trabajo, ni pares");
      const intacto = await db.borradorReglas.findUniqueOrThrow({ where: { borradorId: borrador.borradorId } });
      assert.equal(intacto.estado, "EN_REVISION");
      assert.equal(intacto.versionPublicada, null);
      await db.eventoAuditoria.deleteMany({ where: { actorId: "b5-bloqueo" } });

      // Dos publicaciones a la vez: una sola crea la versión.
      const resultados = await Promise.allSettled([
        publicarBorrador(db, borrador.borradorId, { huella: s.huella }, rrhh, opciones),
        publicarBorrador(db, borrador.borradorId, { huella: s.huella }, rrhh, opciones),
      ]);
      assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((await contar()).versiones, antes.versiones + 1);
      const perdedor = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
      assert.ok(rechazadoCon("ESTADO_INCOMPATIBLE")(perdedor.reason));
    });

    await t.test("los borradores se listan con paginación en SQL y las versiones con su etiqueta", async () => {
      const todos = await listarBorradores(db, { page: 1, pageSize: 100 });
      assert.ok(todos.total >= 8);
      const pagina = await listarBorradores(db, { page: 2, pageSize: 2 });
      assert.equal(pagina.items.length, 2);
      assert.equal(pagina.pageSize, 2);
      assert.equal(pagina.total, todos.total);
      assert.deepEqual(
        pagina.items.map((i) => i.borradorId),
        todos.items.slice(2, 4).map((i) => i.borradorId),
      );
      const publicados = await listarBorradores(db, { estado: "PUBLICADO", page: 1, pageSize: 100 });
      assert.ok(publicados.items.every((i) => i.estado === "PUBLICADO" && i.versionPublicada));
      const { versiones } = await listarVersiones(db, opciones);
      assert.ok(versiones.every((v, i) => i === 0 || v.effectiveFrom < versiones[i - 1].effectiveFrom));
      const estados = versiones.map((v) => v.estado);
      assert.equal(estados.filter((e) => e === "VIGENTE").length, 1);
      assert.ok(estados.includes("PROGRAMADA") && estados.includes("REEMPLAZADA"));
    });

    await t.test("por HTTP: estados, permisos por rol y denegaciones auditadas", async () => {
      const http = crearHttpReglas(db, opciones);
      const guardado = {
        versiones: proteger(db, "LEER", http.versiones, "global"),
        listar: proteger(db, "LEER", http.listarBorradores, "global"),
        obtener: proteger(db, "LEER", http.obtenerBorrador, "global"),
        crear: proteger(db, "EDITAR_REGLAS", http.crearBorrador),
        actualizar: proteger(db, "EDITAR_REGLAS", http.actualizarBorrador),
        simular: proteger(db, "EDITAR_REGLAS", http.simularBorrador),
        aprobar: proteger(db, "APROBAR_REGLAS", http.aprobarBorrador),
        descartar: proteger(db, "EDITAR_REGLAS", http.descartarBorrador),
      };
      const pedir = (
        usuario: string,
        ruta: string,
        metodo = "GET",
        cuerpo?: unknown,
        tipo = "application/json",
      ) =>
        new Request(`http://localhost${ruta}`, {
          method: metodo,
          headers: {
            cookie: `nexo_demo=${tokenDemo(usuario)}`,
            ...(cuerpo === undefined ? {} : { "content-type": tipo }),
          },
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        });

      // Todos leen las versiones; un Team Lead no ve borradores y el intento queda registrado.
      assert.equal((await guardado.versiones(pedir("demo-tl-01", "/api/reglas/versiones"))).status, 200);
      const antesDenegados = await db.eventoAuditoria.count({
        where: { accion: "ACCESO_DENEGADO", actorId: "demo-tl-01" },
      });
      const denegado = await guardado.listar(pedir("demo-tl-01", "/api/reglas/borradores"));
      assert.equal(denegado.status, 403);
      assert.equal(denegado.headers.get("cache-control"), "no-store");
      assert.equal(
        await db.eventoAuditoria.count({ where: { accion: "ACCESO_DENEGADO", actorId: "demo-tl-01" } }),
        antesDenegados + 1,
      );
      assert.equal((await guardado.crear(pedir("demo-gerencia", "/api/reglas/borradores", "POST", {}))).status, 403);
      assert.equal((await guardado.listar(pedir("demo-gerencia", "/api/reglas/borradores"))).status, 200);

      // RR. HH. crea; el cuerpo y el contenido se validan.
      const creado = await guardado.crear(pedir("demo-rrhh", "/api/reglas/borradores", "POST", {}));
      assert.equal(creado.status, 200);
      const borrador = (await creado.json()) as BorradorReglasDTO;
      assert.equal(borrador.creadoPor.userId, "demo-rrhh");
      const ruta = `/api/reglas/borradores/${borrador.borradorId}`;
      assert.equal(
        (await guardado.crear(pedir("demo-rrhh", "/api/reglas/borradores", "POST", { x: 1 }))).status,
        400,
      );
      assert.equal(
        (await guardado.actualizar(pedir("demo-rrhh", ruta, "PUT", {}, "text/plain"), borrador.borradorId)).status,
        400,
      );
      const invalido = await guardado.actualizar(
        pedir("demo-rrhh", ruta, "PUT", { huella: borrador.huella, motivo: "", propuesta: borrador.propuesta }),
        borrador.borradorId,
      );
      assert.equal(invalido.status, 422);
      const cuerpoInvalido = await invalido.json();
      assert.equal(cuerpoInvalido.error.codigo, "CONFIGURACION_INVALIDA");
      assert.equal(cuerpoInvalido.error.detalles[0].campo, "motivo");
      const conflicto = await guardado.simular(
        pedir("demo-rrhh", `${ruta}/simular`, "POST", { huella: "0".repeat(64) }),
        borrador.borradorId,
      );
      assert.equal(conflicto.status, 409);
      assert.equal((await conflicto.json()).error.codigo, "CONFLICTO_EDICION");
      assert.equal(
        (await guardado.obtener(pedir("demo-gerencia", "/api/reglas/borradores/no-existe"), "no-existe")).status,
        404,
      );
      assert.equal(
        (await guardado.obtener(pedir("demo-rrhh", `${ruta}?x=1`), borrador.borradorId)).status,
        400,
      );
      const leido = await guardado.obtener(pedir("demo-gerencia", ruta), borrador.borradorId);
      assert.equal(leido.status, 200);
      assert.equal(((await leido.json()) as BorradorReglasDTO).huella, borrador.huella);
      // Un Team Lead no lee ningún borrador, ni conociendo su id.
      assert.equal((await guardado.obtener(pedir("demo-tl-01", ruta), borrador.borradorId)).status, 403);
      const cerrado = await guardado.descartar(
        pedir("demo-rrhh", `${ruta}/descartar`, "POST", { huella: borrador.huella }),
        borrador.borradorId,
      );
      assert.equal(cerrado.status, 200);
      assert.equal(((await cerrado.json()) as BorradorReglasDTO).estado, "DESCARTADO");
    });
  } finally {
    await db.$transaction(
      async (tx) => {
        const versiones = (
          await tx.configuracionIndice.findMany({
            where: { createdBy: { in: actores } },
            select: { version: true },
          })
        ).map((v) => v.version);
        const borradores = (
          await tx.borradorReglas.findMany({
            where: {
              creadoPor: { in: [...actores, "demo-rrhh"] },
              createdAt: { gte: inicio },
            },
            select: { borradorId: true },
          })
        ).map((b) => b.borradorId);
        await tx.eventoAuditoria.deleteMany({
          where: {
            OR: [
              { correlacionId: { in: borradores } },
              { accion: "REGLAS_PUBLICADAS", recursoId: { in: versiones } },
              {
                actorId: { in: [...actores, "b5-bloqueo", "demo-tl-01", "demo-gerencia", "demo-rrhh"] },
                createdAt: { gte: inicio },
              },
            ],
          },
        });
        await tx.borradorReglas.deleteMany({ where: { borradorId: { in: borradores } } });
        const empleados = [pesada, liviana];
        const jobs = await tx.processingJobPar.findMany({
          where: { periodo: { employeeId: { in: empleados } } },
          select: { jobId: true },
        });
        const jobIds = { in: jobs.map((j) => j.jobId) };
        await tx.processingJobPar.deleteMany({ where: { jobId: jobIds } });
        await tx.processingJob.deleteMany({
          where: { OR: [{ jobId: jobIds }, { rulesVersion: { in: versiones } }] },
        });
        await tx.alerta.deleteMany({ where: { employeeId: { in: empleados } } });
        await tx.periodoEmpleado.updateMany({
          where: { employeeId: { in: empleados } },
          data: { registroVigenteId: null, evaluacionVigenteId: null },
        });
        await tx.evaluacion.updateMany({
          where: { employeeId: { in: empleados } },
          data: { supersedesEvaluationId: null },
        });
        await tx.evaluacion.deleteMany({ where: { employeeId: { in: empleados } } });
        await tx.registroLaboral.deleteMany({ where: { employeeId: { in: empleados } } });
        await tx.periodoEmpleado.deleteMany({ where: { employeeId: { in: empleados } } });
        await tx.importacionTemporal.deleteMany({ where: { importId: { in: importaciones } } });
        await tx.importacion.deleteMany({ where: { importId: { in: importaciones } } });
        await tx.configuracionIndice.deleteMany({ where: { version: { in: versiones } } });
        await tx.empleado.deleteMany({ where: { employeeId: { in: empleados } } });
      },
      { timeout: 60_000 },
    );
    await db.$disconnect();
  }
});
