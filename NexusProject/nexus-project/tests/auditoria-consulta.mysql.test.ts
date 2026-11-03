import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import {
  crearHttpAuditoria,
  crearHttpAuditoriaDetalle,
  crearHttpAuditoriaExportacion,
  crearHttpAuditoriaOperacion,
  filtrosAuditoria,
} from "../src/server/http/auditoria";
import { proteger, tokenDemo } from "../src/server/http/permisos-demo";
import {
  exportarEventos,
  listarEventos,
  obtenerDetalle,
  obtenerOperacion,
} from "../src/server/services/auditoria-consulta";
import { ErrorConsulta } from "../src/server/services/filtros-consultas";
import type { PaginaAuditoria } from "../src/shared/contracts";

// The events below sit in October 2026 and every query looks only at that window, so the reads and
// exports this test causes (stamped with the real clock) never mix with the data under test.
const BASE = Date.parse("2026-10-01T12:00:00.000Z");
const minuto = (n: number) => new Date(BASE + n * 60_000);
const VENTANA = `desde=${minuto(-1).toISOString()}&hasta=${minuto(59).toISOString()}`;

test("B6 MySQL: filtros, páginas por posición, detalle, operación, exportación y lecturas registradas", async (t) => {
  assert.match(
    new URL(process.env.TEST_DATABASE_URL!).pathname,
    /^\/[A-Za-z0-9_]+_test$/,
  );
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const p = `b6-${randomUUID().slice(0, 8)}`;
  const S = `${p}-persona`;
  const C = `${p}-operacion`;
  const lector = {
    actorId: `${p}-lector`,
    actorNombre: "Lector",
    actorRol: "RRHH",
    origen: "WEB" as const,
    solicitudId: randomUUID(),
  };
  const versiones = [`${p}-v1`, `${p}-v2`];
  const solicitudes: string[] = [];
  const id = (n: number) => `${p}-${String(n).padStart(3, "0")}`;
  const crear = (
    n: number,
    datos: Partial<Prisma.EventoAuditoriaUncheckedCreateInput>,
  ) =>
    db.eventoAuditoria.create({
      data: {
        eventoId: id(n),
        clave: `${p}:${n}`,
        accion: "EMPLEADO_ACTUALIZADO",
        entidad: "EMPLEADO",
        recursoId: "EMP-001",
        sujetoId: S,
        actorId: `${p}-rrhh`,
        actorNombre: "Analista",
        actorRol: "RRHH",
        origen: "WEB",
        detalles: {},
        createdAt: minuto(n),
        ...datos,
      },
    });
  const consultar = (query: string) => {
    const ventana = query.includes("desde=") ? "" : `&${VENTANA}`;
    return filtrosAuditoria(
      new Request(`http://local/api/auditoria?sujetoId=${S}${ventana}&${query}`),
    );
  };
  const pagina = async (query: string, opciones?: { conteoMaximo?: number }) => {
    const { filtros, cursor, pageSize } = consultar(query);
    return listarEventos(db, { filtros, cursor, pageSize, actor: lector }, opciones);
  };
  const ids = (r: PaginaAuditoria) => r.items.map((e) => e.eventoId);
  const lecturasDelLector = () =>
    db.eventoAuditoria.findMany({ where: { actorId: lector.actorId } });
  const sinRegistro = db.$extends({
    query: {
      eventoAuditoria: {
        async create() {
          throw new Error("FALLO_AUDITORIA");
        },
      },
    },
  }) as unknown as PrismaClient;

  try {
    await db.$transaction((tx) => sembrarBase(tx));
    await crear(1, { accion: "IMPORTACION_VALIDADA", entidad: "IMPORTACION", recursoId: `${p}-imp`, correlacionId: C, solicitudId: `${p}-r1`, detalles: { totalFilas: 2 } });
    await crear(2, { accion: "IMPORTACION_CONFIRMADA", entidad: "IMPORTACION", recursoId: `${p}-imp`, correlacionId: C, solicitudId: `${p}-r2` });
    await crear(3, { cambios: [{ campo: "teamId", antes: "EQ-01", despues: "EQ-02" }], justificacion: "Reasignación acordada" });
    await crear(4, { accion: "ACCESO_DENEGADO", entidad: "ACCESO", recursoId: "/api/auditoria", actorId: `${p}-tl`, actorNombre: "Team Lead", actorRol: "TEAM_LEAD", resultado: "DENEGADO", motivo: "SIN_PERMISO" });
    // Two consultations at the same instant: the tie breaks on eventoId.
    await crear(5, { accion: "INFORME_CONSULTADO", entidad: "INFORME", recursoId: `${p}-informe`, actorId: `${p}-ger`, actorRol: "GERENCIA", createdAt: minuto(5) });
    await crear(6, { accion: "FICHA_CONSULTADA", recursoId: "EMP-001", actorId: `${p}-ger`, actorRol: "GERENCIA", createdAt: minuto(5) });
    await crear(7, { accion: "PROCESAMIENTO_FALLIDO", entidad: "PROCESAMIENTO", recursoId: `${p}-job`, actorId: "sistema", actorNombre: null, actorRol: null, origen: "SISTEMA", resultado: "FALLO", motivo: "ERROR_TECNICO", correlacionId: C });
    // Before the correlation id existed, an import's events shared only their resource.
    await crear(8, { accion: "IMPORTACION_VALIDADA", entidad: "IMPORTACION", recursoId: `${p}-legado`, actorNombre: null, actorRol: null, origen: null, solicitudId: null });
    await crear(9, { accion: "IMPORTACION_CONFIRMADA", entidad: "IMPORTACION", recursoId: `${p}-legado`, actorNombre: null, actorRol: null, origen: null, solicitudId: null });

    await t.test("las consultas se ocultan por defecto y se cuentan aparte", async () => {
      const r = await pagina("pageSize=100");
      assert.deepEqual(ids(r), [9, 8, 7, 4, 3, 2, 1].map(id));
      assert.equal(r.total, 7);
      assert.equal(r.totalAcotado, false);
      assert.equal(r.consultasOcultas, 2);
      assert.equal(r.siguiente, null);
      const todas = await pagina("consultas=1&pageSize=100");
      assert.equal(todas.total, 9);
      assert.equal(todas.consultasOcultas, 0);
      // Naming a consultation asks for it.
      const informes = await pagina("accion=INFORME_CONSULTADO");
      assert.deepEqual(ids(informes), [id(5)]);
      assert.equal(informes.consultasOcultas, 0);
    });

    await t.test("cada filtro acota con su columna", async () => {
      const filtrar = async (query: string) =>
        ids(await pagina(`${query}&consultas=1&pageSize=100`));
      assert.deepEqual(await filtrar("entidad=IMPORTACION"), [9, 8, 2, 1].map(id));
      assert.deepEqual(await filtrar("resultado=DENEGADO"), [id(4)]);
      assert.deepEqual(await filtrar("resultado=FALLO"), [id(7)]);
      assert.deepEqual(await filtrar("origen=SISTEMA"), [id(7)]);
      assert.deepEqual(await filtrar(`actorId=${p}-ger`), [id(6), id(5)]);
      assert.deepEqual(await filtrar(`correlacionId=${C}`), [7, 2, 1].map(id));
      assert.deepEqual(await filtrar(`solicitudId=${p}-r2`), [id(2)]);
      assert.deepEqual(await filtrar(`recursoId=${p}-imp`), [id(2), id(1)]);
      assert.deepEqual(await filtrar(`q=${p}-imp`), [id(2), id(1)]);
      assert.deepEqual(await filtrar(`q=${C}`), [7, 2, 1].map(id));
      assert.deepEqual(await filtrar("accion=EMPLEADO_ACTUALIZADO"), [id(3)]);
      assert.deepEqual(await filtrar("entidad=IMPORTACION&resultado=FALLO"), []);
      // Both ends of the period are inclusive.
      assert.deepEqual(
        await filtrar(`desde=${minuto(2).toISOString()}&hasta=${minuto(4).toISOString()}`),
        [4, 3, 2].map(id),
      );
    });

    await t.test("las páginas siguen la posición: sin repetidos ni faltantes aunque dos eventos compartan el instante", async () => {
      const vistos: string[] = [];
      const tamanos: number[] = [];
      let cursor = "";
      for (let vuelta = 0; vuelta < 10; vuelta++) {
        const r = await pagina(`consultas=1&pageSize=2${cursor ? `&cursor=${cursor}` : ""}`);
        tamanos.push(r.items.length);
        vistos.push(...ids(r));
        assert.equal(r.total, 9, "el total no depende de la página");
        if (!r.siguiente) break;
        cursor = r.siguiente;
      }
      assert.deepEqual(tamanos, [2, 2, 2, 2, 1]);
      assert.deepEqual(vistos, [9, 8, 7, 6, 5, 4, 3, 2, 1].map(id));
      // A newer event arriving between two requests does not shift the next page.
      const primera = await pagina("consultas=1&pageSize=2");
      await crear(10, {});
      const segunda = await pagina(`consultas=1&pageSize=2&cursor=${primera.siguiente}`);
      assert.deepEqual(ids(segunda), [id(7), id(6)]);
      assert.deepEqual(ids(await pagina("consultas=1&pageSize=1")), [id(10)]);
      await db.eventoAuditoria.delete({ where: { eventoId: id(10) } });
    });

    await t.test("el total se corta en el tope y lo dice", async () => {
      const corto = await pagina("consultas=1&pageSize=2", { conteoMaximo: 4 });
      assert.deepEqual([corto.total, corto.totalAcotado], [4, true]);
      const exacto = await pagina("consultas=1&pageSize=2", { conteoMaximo: 9 });
      assert.deepEqual([exacto.total, exacto.totalAcotado], [9, false]);
    });

    await t.test("cada lectura deja un evento con quién, qué filtros y la solicitud", async () => {
      const antes = (await lecturasDelLector()).length;
      await pagina("entidad=IMPORTACION&pageSize=3");
      const despues = await lecturasDelLector();
      assert.equal(despues.length, antes + 1);
      const evento = despues.find((e) => (e.detalles as { pageSize?: number }).pageSize === 3)!;
      assert.equal(evento.accion, "AUDITORIA_CONSULTADA");
      assert.equal(evento.entidad, "AUDITORIA");
      assert.equal(evento.recursoId, "eventos");
      assert.equal(evento.sujetoId, S);
      assert.equal(evento.solicitudId, lector.solicitudId);
      assert.equal(evento.actorRol, "RRHH");
      assert.deepEqual(evento.detalles, {
        vista: "lista",
        filtros: { sujetoId: S, entidad: "IMPORTACION", consultas: false, desde: minuto(-1).toISOString(), hasta: minuto(59).toISOString() },
        pageSize: 3,
        continuacion: false,
      });
      // A real-clock read never shows in the window the data lives in, and reads stay hidden anyway.
      assert.ok(!(await pagina("pageSize=100")).items.some((e) => e.accion === "AUDITORIA_CONSULTADA"));
    });

    await t.test("el detalle trae todas las columnas, la etiqueta del catálogo y los nombres", async () => {
      const { evento, operacion, cambiosCalculados } = await obtenerDetalle(db, id(3), lector);
      assert.equal(evento.etiqueta, "Modificó los datos laborales de una persona");
      assert.deepEqual(evento.cambios, [{ campo: "teamId", antes: "EQ-01", despues: "EQ-02" }]);
      assert.equal(evento.justificacion, "Reasignación acordada");
      assert.deepEqual([evento.origen, evento.resultado, evento.actorNombre, evento.actorRol], ["WEB", "EXITO", "Analista", "RRHH"]);
      assert.equal(evento.createdAt, minuto(3).toISOString());
      assert.ok(!("clave" in evento));
      assert.equal(cambiosCalculados, false);
      assert.equal(operacion, null);

      await crear(14, { sujetoId: "EMP-001", createdAt: minuto(14) });
      const persona = await db.empleado.findUniqueOrThrow({ where: { employeeId: "EMP-001" } });
      const nombrado = (await obtenerDetalle(db, id(14), lector)).evento;
      assert.equal(nombrado.sujetoNombre, persona.nombre, "el nombre se resuelve al leer, no se guarda");
      assert.equal(nombrado.recursoNombre, persona.nombre);

      const denegado = (await obtenerDetalle(db, id(4), lector)).evento;
      assert.deepEqual([denegado.resultado, denegado.motivo], ["DENEGADO", "SIN_PERMISO"]);
      assert.deepEqual((await obtenerDetalle(db, id(1), lector)).operacion, { id: C, eventos: 3 });
      // An older import event points to the operation made of its resource.
      assert.deepEqual((await obtenerDetalle(db, id(8), lector)).operacion, { id: `${p}-legado`, eventos: 2 });
      await assert.rejects(obtenerDetalle(db, "no-existe", lector), (e: ErrorConsulta) => e.status === 404);
    });

    await t.test("una publicación de reglas anterior a los cambios guardados se explica con las versiones", async () => {
      await db.configuracionIndice.createMany({
        data: [
          { version: versiones[0], effectiveFrom: new Date("2098-01-06"), weights: { HE: 0.3, DS: 0.3, CT: 0.25, VP: 0.15 }, thresholds: { HE: 8, DS: 6, CT: 0.35, VP: 10 }, mediumLimit: 40, highLimit: 70, minExceededFactors: 2, createdBy: p },
          { version: versiones[1], effectiveFrom: new Date("2098-01-13"), weights: { HE: 0.25, DS: 0.3, CT: 0.3, VP: 0.15 }, thresholds: { HE: 8, DS: 6, CT: 0.35, VP: 10 }, mediumLimit: 40, highLimit: 72, minExceededFactors: 2, createdBy: p },
        ],
      });
      const publicada = { accion: "REGLAS_PUBLICADAS", entidad: "REGLAS", recursoId: versiones[1], sujetoId: null, detalles: { version: versiones[1], versionAnterior: versiones[0] } };
      await crear(11, { ...publicada, createdAt: minuto(11) });
      const { evento, cambiosCalculados } = await obtenerDetalle(db, id(11), lector);
      assert.equal(cambiosCalculados, true);
      assert.deepEqual(evento.cambios, [
        { campo: "effectiveFrom", antes: "2098-01-06", despues: "2098-01-13" },
        { campo: "weights.HE", antes: 0.3, despues: 0.25 },
        { campo: "weights.CT", antes: 0.25, despues: 0.3 },
        { campo: "highLimit", antes: 70, despues: 72 },
      ]);
      // Changes that were stored with the event are shown as stored.
      await crear(12, { ...publicada, cambios: [{ campo: "highLimit", antes: 70, despues: 72 }], createdAt: minuto(12) });
      const guardado = await obtenerDetalle(db, id(12), lector);
      assert.equal(guardado.cambiosCalculados, false);
      assert.equal(guardado.evento.cambios!.length, 1);
    });

    await t.test("la operación reúne los eventos de varias entidades, del más antiguo al más reciente", async () => {
      const r = await obtenerOperacion(db, C, lector);
      assert.deepEqual(r.eventos.map((e) => e.eventoId), [1, 2, 7].map(id));
      assert.deepEqual([r.total, r.truncada, r.operacionId], [3, false, C]);
      const legado = await obtenerOperacion(db, `${p}-legado`, lector);
      assert.deepEqual(legado.eventos.map((e) => e.eventoId), [8, 9].map(id));
      const corta = await obtenerOperacion(db, C, lector, { maxEventos: 2 });
      assert.deepEqual([corta.eventos.length, corta.total, corta.truncada], [2, 3, true]);
      await assert.rejects(obtenerOperacion(db, `${p}-inexistente`, lector), (e: ErrorConsulta) => e.status === 404);
      const lecturas = await db.eventoAuditoria.findMany({ where: { actorId: lector.actorId, recursoId: C } });
      assert.ok(lecturas.length >= 2);
      for (const lectura of lecturas) {
        assert.equal(lectura.accion, "AUDITORIA_CONSULTADA");
        assert.equal(lectura.correlacionId, null, "la lectura no entra en la operación que mira");
      }
    });

    await t.test("exportar registra la exportación con sus filtros y recorta en el tope", async () => {
      const { filtros } = consultar("consultas=1");
      const solicitudId = randomUUID();
      const completa = await exportarEventos(db, { filtros, formato: "csv", actor: lector, solicitudId });
      assert.deepEqual(completa.eventos.map((e) => e.eventoId), [9, 8, 7, 6, 5, 4, 3, 2, 1].map(id));
      assert.equal(completa.truncado, false);
      assert.ok(!completa.eventos.some((e) => "sujetoNombre" in e), "el archivo lleva identificadores, no nombres");
      const evento = await db.eventoAuditoria.findFirstOrThrow({ where: { accion: "EXPORTACION_GENERADA", recursoId: solicitudId } });
      assert.deepEqual(evento.detalles, {
        dataset: "AUDITORIA",
        formato: "csv",
        filtros: { sujetoId: S, consultas: true, desde: minuto(-1).toISOString(), hasta: minuto(59).toISOString() },
        filas: 9,
        truncado: false,
        limite: 10_000,
      });
      assert.deepEqual([evento.entidad, evento.sujetoId, evento.actorId], ["EXPORTACION", S, lector.actorId]);
      const corta = await exportarEventos(db, { filtros, formato: "json", actor: lector, solicitudId: randomUUID() }, { maxFilas: 4 });
      assert.deepEqual(corta.eventos.map((e) => e.eventoId), [9, 8, 7, 6].map(id));
      assert.equal(corta.truncado, true);
      const registradas = await db.eventoAuditoria.findMany({ where: { accion: "EXPORTACION_GENERADA", actorId: lector.actorId } });
      const cortas = registradas.filter((e) => (e.detalles as { limite: number }).limite === 4);
      assert.equal(cortas.length, 1);
      assert.deepEqual([(cortas[0].detalles as { filas: number }).filas, (cortas[0].detalles as { truncado: boolean }).truncado], [4, true]);
    });

    await t.test("si la lectura no se puede registrar no se devuelve nada", async () => {
      const { filtros } = consultar("pageSize=5");
      const antes = await db.eventoAuditoria.count();
      await assert.rejects(listarEventos(sinRegistro, { filtros, cursor: null, pageSize: 5, actor: lector }), /FALLO_AUDITORIA/);
      await assert.rejects(obtenerDetalle(sinRegistro, id(1), lector), /FALLO_AUDITORIA/);
      await assert.rejects(obtenerOperacion(sinRegistro, C, lector), /FALLO_AUDITORIA/);
      await assert.rejects(exportarEventos(sinRegistro, { filtros, formato: "csv", actor: lector }), /FALLO_AUDITORIA/);
      assert.equal(await db.eventoAuditoria.count(), antes);
      mock.method(console, "error", () => {});
      try {
        const respuesta = await crearHttpAuditoria(sinRegistro)(new Request(`http://local/api/auditoria?sujetoId=${S}`));
        assert.equal(respuesta.status, 500);
        const cuerpo = await respuesta.json();
        assert.equal(cuerpo.items, undefined);
        assert.equal(cuerpo.error.mensaje, "No se pudo consultar la auditoría.");
      } finally {
        mock.restoreAll();
      }
    });

    await t.test("HTTP: RR. HH. y Gerencia leen y exportan; un Team Lead y un empleado no, y queda constancia", async () => {
      const listar = proteger(db, "AUDITORIA", crearHttpAuditoria(db));
      const detalle = proteger<[string]>(db, "AUDITORIA", crearHttpAuditoriaDetalle(db));
      const operacion = proteger<[string]>(db, "AUDITORIA", crearHttpAuditoriaOperacion(db));
      // The same wiring as auditoria-runtime.ts, which tests/auditoria-consulta.test.ts pins.
      const exportar = proteger(db, "EXPORTAR", crearHttpAuditoriaExportacion(db));
      const pedir = (usuario: string | null, ruta: string) =>
        new Request(`http://local${ruta}`, { headers: usuario ? { Cookie: `nexo_demo=${tokenDemo(usuario)}` } : {} });
      const registrar = (r: Response) => {
        const solicitud = r.headers.get("x-request-id")!;
        assert.ok(solicitud, "toda respuesta lleva X-Request-Id");
        solicitudes.push(solicitud);
        return solicitud;
      };
      for (const usuario of ["demo-rrhh", "demo-gerencia"]) {
        const r = await listar(pedir(usuario, `/api/auditoria?sujetoId=${S}&${VENTANA}&pageSize=2`));
        assert.equal(r.status, 200, usuario);
        assert.equal(r.headers.get("cache-control"), "no-store");
        const solicitud = registrar(r);
        assert.equal(((await r.json()) as PaginaAuditoria).items.length, 2);
        // The trace of this very read carries the id the client received.
        const lectura = await db.eventoAuditoria.findFirstOrThrow({ where: { solicitudId: solicitud } });
        assert.deepEqual([lectura.accion, lectura.actorId, lectura.origen], ["AUDITORIA_CONSULTADA", usuario, "WEB"]);
        const d = await detalle(pedir(usuario, `/api/auditoria/${id(1)}`), id(1));
        assert.equal(d.status, 200);
        registrar(d);
        assert.equal((await d.json()).evento.eventoId, id(1));
        const o = await operacion(pedir(usuario, `/api/auditoria/operaciones/${C}`), C);
        assert.equal(o.status, 200);
        registrar(o);
        const x = await exportar(pedir(usuario, `/api/auditoria/exportacion?formato=json&sujetoId=${S}&${VENTANA}`));
        assert.equal(x.status, 200, usuario);
        registrar(x);
        const archivo = await x.json();
        assert.equal(archivo.filas, 7);
        assert.equal(archivo.truncado, false);
      }
      const mala = await listar(pedir("demo-rrhh", "/api/auditoria?x=1"));
      assert.equal(mala.status, 400);
      registrar(mala);
      assert.equal((await detalle(pedir("demo-rrhh", "/api/auditoria/no-existe"), "no-existe")).status, 404);
      assert.equal((await listar(pedir(null, "/api/auditoria"))).status, 401);
      for (const usuario of ["demo-tl-01", "demo-empleado"]) {
        const lista = await listar(pedir(usuario, "/api/auditoria"));
        assert.equal(lista.status, 403, usuario);
        const solicitud = registrar(lista);
        assert.equal((await db.eventoAuditoria.findFirstOrThrow({ where: { solicitudId: solicitud } })).accion, "ACCESO_DENEGADO");
        const ficha = await detalle(pedir(usuario, `/api/auditoria/${id(1)}`), id(1));
        assert.equal(ficha.status, 403);
        registrar(ficha);
      }
      // A Team Lead holds EXPORTAR but not AUDITORIA: the export refuses and records the attempt.
      const tl = await exportar(pedir("demo-tl-01", "/api/auditoria/exportacion?formato=csv"));
      assert.equal(tl.status, 403);
      const solicitudTl = registrar(tl);
      const denegado = await db.eventoAuditoria.findFirstOrThrow({ where: { solicitudId: solicitudTl } });
      assert.deepEqual(
        [denegado.accion, denegado.resultado, denegado.motivo, denegado.actorId, denegado.actorRol],
        ["ACCESO_DENEGADO", "DENEGADO", "SIN_PERMISO", "demo-tl-01", "TEAM_LEAD"],
      );
      assert.equal((denegado.detalles as { permiso: string }).permiso, "AUDITORIA");
      // Scoped to this request: other suites share the DB and the trail is append-only.
      assert.equal(await db.eventoAuditoria.count({ where: { accion: "EXPORTACION_GENERADA", solicitudId: solicitudTl } }), 0);
      const empleado = await exportar(pedir("demo-empleado", "/api/auditoria/exportacion?formato=csv"));
      assert.equal(empleado.status, 403);
      registrar(empleado);
    });

    await t.test("HTTP: el CSV sale con encabezados de descarga y sin fórmulas activas", async () => {
      await crear(13, { actorNombre: '=HYPERLINK("http://malo.example","clic")', justificacion: "+cmd", createdAt: minuto(13) });
      const exportar = proteger(db, "EXPORTAR", crearHttpAuditoriaExportacion(db));
      const instante = minuto(13).toISOString();
      const r = await exportar(
        new Request(`http://local/api/auditoria/exportacion?formato=csv&sujetoId=${S}&desde=${instante}&hasta=${instante}`, {
          headers: { Cookie: `nexo_demo=${tokenDemo("demo-rrhh")}` },
        }),
      );
      solicitudes.push(r.headers.get("x-request-id")!);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("content-type"), "text/csv; charset=utf-8");
      assert.equal(r.headers.get("content-disposition"), 'attachment; filename="auditoria_20261001T121300Z_20261001T121300Z.csv"');
      assert.deepEqual(
        [r.headers.get("x-exportacion-filas"), r.headers.get("x-exportacion-truncada"), r.headers.get("x-content-type-options"), r.headers.get("cache-control")],
        ["1", "false", "nosniff", "no-store"],
      );
      // Response.text() drops a BOM, so the bytes are checked.
      const bytes = Buffer.from(await r.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      const texto = bytes.toString("utf8");
      assert.ok(texto.includes(`"'=HYPERLINK(""http://malo.example"",""clic"")"`));
      assert.ok(texto.includes(`"'+cmd"`));
      assert.ok(!/(^|,)"[=+@-]/m.test(texto.slice(1)));
      assert.ok(texto.endsWith("\r\n"));
    });
  } finally {
    await db.eventoAuditoria.deleteMany({
      where: {
        OR: [
          { eventoId: { startsWith: p } },
          { actorId: { startsWith: p } },
          { recursoId: { startsWith: p } },
          { sujetoId: S },
          { solicitudId: { in: solicitudes } },
        ],
      },
    });
    await db.configuracionIndice.deleteMany({ where: { version: { in: versiones } } });
    await db.$disconnect();
  }
});
