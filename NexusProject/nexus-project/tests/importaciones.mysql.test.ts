import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import type {
  ResultadoImportacion,
  VistaPrevia,
} from "../src/shared/contracts";
import { ErrorDominio } from "../src/shared/errors";
import { crearHttpCu01 } from "../src/server/http/cu01";
import { alPublicarAlerta } from "../src/server/services/alertas";
import { construirInforme } from "../src/server/services/informes";
import { completarPar } from "../src/server/repositories/procesamientos";
import type { OpcionesImportacion } from "../src/server/services/importaciones";
import { publicarConfiguracion } from "../src/server/services/publicar-reglas";

const ejemplo = readFileSync("templates/ejemplo-dos-semanas.csv", "utf8");

/** Transporte HTTP real sobre el mismo adaptador que usan los Route Handlers. */
async function servidor(db: PrismaClient, opciones: OpcionesImportacion) {
  const http = crearHttpCu01(db, opciones);
  const server = createServer(async (req, res) => {
    try {
      const request = new Request(`http://127.0.0.1${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(req.method === "GET"
          ? {}
          : { body: Readable.toWeb(req), duplex: "half" }),
      } as RequestInit & { duplex?: "half" });
      const ruta = new URL(request.url).pathname;
      let response: Response;
      let match: RegExpMatchArray | null;
      if (ruta === "/api/importaciones/validar" && req.method === "POST")
        response = await http.validar(request);
      else if (
        (match = ruta.match(/^\/api\/importaciones\/([^/]+)\/confirmar$/)) &&
        req.method === "POST"
      )
        response = await http.confirmar(request, match[1]);
      else if (
        (match = ruta.match(/^\/api\/importaciones\/([^/]+)$/)) &&
        req.method === "DELETE"
      )
        response = await http.cancelar(request, match[1]);
      else if (
        (match = ruta.match(/^\/api\/procesamientos\/([^/]+)\/reintentar$/)) &&
        req.method === "POST"
      )
        response = await http.reintentar(request, match[1]);
      else if (
        (match = ruta.match(/^\/api\/procesamientos\/([^/]+)$/)) &&
        req.method === "GET"
      )
        response = await http.consultar(request, match[1]);
      else response = new Response(null, { status: 404 });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    url: `http://127.0.0.1:${address.port}`,
    cerrar: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}

async function escenario(
  db: PrismaClient,
  comprobar: (s: Awaited<ReturnType<typeof crear>>) => Promise<void>,
  opciones: OpcionesImportacion = {},
) {
  const s = await crear(db, opciones);
  try {
    await comprobar(s);
  } finally {
    await s.cerrar();
    const importId = { in: s.imports };
    const periodos = await db.periodoEmpleado.findMany({
      where: { registros: { some: { sourceImportId: importId } } },
    });
    const periodoId = { in: periodos.map((p) => p.periodoId) };
    await db.$transaction(async (tx) => {
      await tx.processingJobPar.deleteMany({
        where: { OR: [{ job: { importId } }, { periodoId }] },
      });
      await tx.processingJob.deleteMany({ where: { importId } });
      await tx.alerta.deleteMany({ where: { evaluacion: { periodoId } } });
      await tx.periodoEmpleado.updateMany({
        where: { periodoId },
        data: { registroVigenteId: null, evaluacionVigenteId: null },
      });
      await tx.evaluacion.updateMany({
        where: { periodoId },
        data: { supersedesEvaluationId: null },
      });
      await tx.evaluacion.deleteMany({ where: { periodoId } });
      await tx.registroLaboral.deleteMany({ where: { periodoId } });
      await tx.periodoEmpleado.deleteMany({ where: { periodoId } });
      await tx.importacionTemporal.deleteMany({ where: { importId } });
      await tx.importacion.deleteMany({ where: { importId } });
      await tx.empleado.delete({ where: { employeeId: s.employeeId } });
    });
  }
}

async function crear(db: PrismaClient, opciones: OpcionesImportacion) {
  const employeeId = `T04-${randomUUID()}`;
  await db.empleado.create({
    data: {
      employeeId,
      nombre: "Persona ficticia T04",
      tipo: "TECNICO",
      teamId: "EQ-01",
      responsableId: "TL-01",
    },
  });
  const server = await servidor(db, opciones);
  const imports: string[] = [];
  const csv = ejemplo.replaceAll("EMP-001", employeeId);
  async function validar(texto = csv, nombre = "datos.csv", mime = "text/csv") {
    const form = new FormData();
    form.append("file", new File([texto], nombre, { type: mime }));
    const response = await fetch(`${server.url}/api/importaciones/validar`, {
      method: "POST",
      body: form,
    });
    const body = await response.json();
    const vista: VistaPrevia | undefined =
      body.vistaPrevia ?? (body.importId ? body : undefined);
    if (vista) imports.push(vista.importId);
    return { status: response.status, body, vista: vista! };
  }
  async function llamar(path: string, method = "POST") {
    const response = await fetch(`${server.url}/api/${path}`, {
      method,
      ...(method === "POST"
        ? { headers: { "content-type": "application/json" }, body: "{}" }
        : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  async function confirmar(id: string) {
    const r = await llamar(`importaciones/${id}/confirmar`);
    return {
      status: r.status,
      resultado: r.body as ResultadoImportacion,
      body: r.body,
    };
  }
  async function importar(texto = csv) {
    const v = await validar(texto);
    assert.equal(v.status, 200);
    const c = await confirmar(v.vista.importId);
    assert.equal(c.status, 200);
    return c.resultado;
  }
  return {
    ...server,
    employeeId,
    csv,
    imports,
    validar,
    llamar,
    confirmar,
    importar,
  };
}

test("MySQL T04: CU01 por HTTP, atomicidad y recuperación", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.match(new URL(url).pathname, /^\/[A-Za-z0-9_]+_test$/);
  const db = new PrismaClient({ datasourceUrl: url });
  await db.$transaction((tx) => sembrarBase(tx));
  try {
    await t.test(
      "ejemplo: 83,71 INCOMPLETO, 91,21 ALTO, informe y alerta únicos",
      () =>
        escenario(db, async (s) => {
          const v = await s.validar();
          assert.equal(v.status, 200);
          assert.equal(v.vista.nuevas, 2);
          assert.equal(
            await db.registroLaboral.count({
              where: { employeeId: s.employeeId },
            }),
            0,
          );
          assert.equal(
            await db.importacionTemporal.count({
              where: { importId: v.vista.importId },
            }),
            1,
          );
          assert.equal(
            Date.parse(v.vista.expiresAt) -
              (
                await db.importacion.findUniqueOrThrow({
                  where: { importId: v.vista.importId },
                })
              ).uploadedAt.getTime(),
            30 * 60_000,
          );
          const { resultado, status } = await s.confirmar(v.vista.importId);
          assert.equal(status, 200);
          assert.equal(resultado.insertados, 2);
          assert.equal(resultado.afectados.length, 2);
          assert.equal(resultado.procesamiento?.estado, "COMPLETADO");
          assert.equal(resultado.procesamiento.completados, 2);
          const evaluaciones = await db.evaluacion.findMany({
            where: { employeeId: s.employeeId },
            orderBy: { createdAt: "asc" },
          });
          assert.deepEqual(
            evaluaciones.map((e) => [Number(e.indice), e.nivel]),
            [
              [83.71, "INCOMPLETO"],
              [91.21, "ALTO"],
            ],
          );
          const informe = await construirInforme(
            db,
            evaluaciones[1].evaluationId,
          );
          assert.equal(informe.alerta?.destinatarioId, "TL-01");
          assert.equal(informe.alerta.canal, "INTERNO");
          assert.equal(informe.alerta.estadoEnvio, "NO_APLICA");
          assert.equal(informe.alerta.vigencia, "ACTIVA");
          assert.equal(
            await db.alerta.count({ where: { employeeId: s.employeeId } }),
            1,
          );
          assert.equal(
            await db.importacionTemporal.count({
              where: { importId: v.vista.importId },
            }),
            0,
          );
          assert.deepEqual(
            (await s.confirmar(v.vista.importId)).resultado,
            resultado,
          );
          const consulta = await s.llamar(
            `procesamientos/${resultado.procesamiento.jobId}`,
            "GET",
          );
          assert.equal(consulta.body.estado, "COMPLETADO");
          const repetida = await s.importar(s.csv.replace(/\n/g, "\r\n"));
          assert.equal(repetida.insertados, 0);
          assert.equal(repetida.omitidos, 2);
          assert.equal(repetida.procesamiento, null);
          assert.equal(
            (
              await s.llamar(
                `procesamientos/${resultado.procesamiento.jobId}/reintentar`,
              )
            ).body.estado,
            "COMPLETADO",
          );
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            2,
          );
        }),
    );

    await t.test(
      "rechazo total, formato, cancelación idempotente e IDs inexistentes",
      () =>
        escenario(db, async (s) => {
          const v = await s.validar(s.csv.replace(",16,16,", ",-1,16,"));
          assert.equal(v.status, 422);
          assert.equal(v.vista.status, "RECHAZADA");
          assert.ok(
            v.body.error.detalles.some(
              (e: { campo: string }) => e.campo === "horas_extra",
            ),
          );
          assert.equal((await s.confirmar(v.vista.importId)).status, 409);
          assert.equal(
            await db.registroLaboral.count({
              where: { employeeId: s.employeeId },
            }),
            0,
          );
          assert.equal((await s.validar(s.csv, "a.xlsx")).status, 415);
          assert.equal(
            (await s.validar("archivo sin encabezados")).status,
            400,
          );
          const valida = (await s.validar()).vista;
          const path = `importaciones/${valida.importId}`;
          assert.equal(
            (await s.llamar(path, "DELETE")).body.status,
            "CANCELADA",
          );
          assert.equal(
            (await s.llamar(path, "DELETE")).body.status,
            "CANCELADA",
          );
          assert.equal((await s.confirmar(valida.importId)).status, 409);
          assert.equal(
            await db.importacionTemporal.count({
              where: { importId: valida.importId },
            }),
            0,
          );
          assert.equal((await s.confirmar("inexistente")).status, 404);
          assert.equal(
            (await s.llamar("procesamientos/inexistente", "GET")).status,
            404,
          );
          assert.equal(
            (await s.llamar("procesamientos/inexistente/reintentar")).status,
            404,
          );
        }),
    );

    await t.test(
      "vencimiento elimina temporal, conserva metadatos y no vence confirmadas",
      async () => {
        let ahora = new Date();
        await escenario(
          db,
          async (s) => {
            const confirmada = await s.importar();
            const v = await s.validar();
            ahora = new Date(ahora.getTime() + 30 * 60_000);
            assert.equal((await s.confirmar(v.vista.importId)).status, 410);
            assert.equal(
              (await s.llamar(`importaciones/${v.vista.importId}`, "DELETE"))
                .status,
              410,
            );
            assert.equal(
              await db.importacionTemporal.count({
                where: { importId: v.vista.importId },
              }),
              0,
            );
            assert.ok(
              await db.importacion.findUnique({
                where: { importId: v.vista.importId },
              }),
            );
            assert.deepEqual(
              (await s.confirmar(confirmada.importId)).resultado,
              confirmada,
            );
            assert.equal(
              (await s.llamar(`importaciones/${confirmada.importId}`, "DELETE"))
                .status,
              409,
            );
          },
          { ahora: () => ahora },
        );
      },
    );

    await t.test(
      "confirmar revalida catálogo, todas las filas y conflictos sin parciales",
      () =>
        escenario(db, async (s) => {
          const v = await s.validar();
          await db.empleado.update({
            where: { employeeId: s.employeeId },
            data: { activo: false },
          });
          assert.equal((await s.confirmar(v.vista.importId)).status, 409);
          assert.equal(
            await db.registroLaboral.count({
              where: { employeeId: s.employeeId },
            }),
            0,
          );
          await db.empleado.update({
            where: { employeeId: s.employeeId },
            data: { activo: true },
          });
          const otro = await s.validar(s.csv.replace(",16,9,", ",15,9,"));
          await s.importar(s.csv.split("\n").slice(0, 2).join("\n"));
          assert.equal((await s.confirmar(otro.vista.importId)).status, 409);
          assert.equal(
            await db.registroLaboral.count({
              where: { employeeId: s.employeeId },
            }),
            1,
          );
          const previo = (
            await db.registroLaboral.findFirstOrThrow({
              where: { employeeId: s.employeeId },
            })
          ).recordId;
          const c = await s.confirmar(v.vista.importId);
          assert.equal(c.resultado.insertados, 1);
          assert.equal(c.resultado.omitidos, 1);
          assert.equal(
            await db.registroLaboral.count({ where: { recordId: previo } }),
            1,
          );
        }),
    );

    await t.test(
      "confirmaciones concurrentes del mismo ID y lotes idénticos no duplican",
      () =>
        escenario(db, async (s) => {
          const [v1, v2] = await Promise.all([s.validar(), s.validar()]);
          const resultados = await Promise.all([
            s.confirmar(v1.vista.importId),
            s.confirmar(v1.vista.importId),
            s.confirmar(v2.vista.importId),
          ]);
          assert.ok(resultados.every((r) => r.status === 200));
          assert.equal(
            await db.registroLaboral.count({
              where: { employeeId: s.employeeId },
            }),
            2,
          );
          assert.equal(
            await db.processingJob.count({
              where: { importId: { in: s.imports } },
            }),
            1,
          );
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            2,
          );
          assert.equal(
            await db.alerta.count({ where: { employeeId: s.employeeId } }),
            1,
          );
        }),
    );

    await t.test(
      "carrera de lotes conflictivos confirma uno y rechaza el otro sin mezclarlos",
      () =>
        escenario(db, async (s) => {
          const a = await s.validar(),
            b = await s.validar(s.csv.replace(",16,9,", ",15,9,"));
          const resultados = await Promise.all([
            s.confirmar(a.vista.importId),
            s.confirmar(b.vista.importId),
          ]);
          assert.deepEqual(resultados.map((r) => r.status).sort(), [200, 409]);
          const registros = await db.registroLaboral.findMany({
            where: { employeeId: s.employeeId },
          });
          assert.equal(registros.length, 2);
          assert.equal(new Set(registros.map((r) => r.sourceImportId)).size, 1);
        }),
    );

    await t.test(
      "fallo después de insertar el lote revierte registros, períodos, estado y job",
      async () => {
        let fallar = true;
        const cliente = db.$extends({
          query: {
            registroLaboral: {
              async createMany({ args, query }) {
                const resultado = await query(args);
                if (fallar) throw new Error("Fallo de escritura inyectado.");
                return resultado;
              },
            },
          },
        }) as unknown as PrismaClient;
        await escenario(cliente, async (s) => {
          const v = await s.validar();
          assert.equal((await s.confirmar(v.vista.importId)).status, 500);
          assert.equal(
            await db.registroLaboral.count({
              where: { employeeId: s.employeeId },
            }),
            0,
          );
          assert.equal(
            await db.periodoEmpleado.count({
              where: { employeeId: s.employeeId },
            }),
            0,
          );
          assert.equal(
            await db.processingJob.count({
              where: { importId: v.vista.importId },
            }),
            0,
          );
          const carga = await db.importacion.findUniqueOrThrow({
            where: { importId: v.vista.importId },
            include: { temporal: true },
          });
          assert.equal(carga.status, "VALIDADA");
          assert.ok(carga.temporal);
          fallar = false;
          assert.equal(
            (await s.confirmar(v.vista.importId)).resultado.procesamiento!
              .estado,
            "COMPLETADO",
          );
        });
      },
    );

    await t.test(
      "fallo en el segundo bloque de 201 filas revierte también el primer bloque y permite recuperar",
      async () => {
        let bloques = 0,
          fallar = true;
        const cliente = db.$extends({
          query: {
            registroLaboral: {
              async createMany({ args, query }) {
                const resultado = await query(args);
                bloques++;
                if (fallar && bloques === 2)
                  throw new Error("Fallo del segundo bloque.");
                return resultado;
              },
            },
          },
        }) as unknown as PrismaClient;
        await escenario(
          cliente,
          async (s) => {
            const fecha = (dias: number) =>
              new Date(Date.UTC(2026, 0, 5 + dias)).toISOString().slice(0, 10);
            const csv = [
              s.csv.split("\n")[0],
              ...Array.from(
                { length: 201 },
                (_, i) =>
                  `${s.employeeId},${fecha(i * 7)},${fecha(i * 7 + 6)},0,0,0,0,0,0,,`,
              ),
            ].join("\n");
            const previa = await s.validar(csv);
            assert.equal(previa.status, 200);
            assert.equal(
              (await s.confirmar(previa.vista.importId)).status,
              500,
            );
            assert.equal(bloques, 2);
            assert.equal(
              await db.registroLaboral.count({
                where: { employeeId: s.employeeId },
              }),
              0,
            );
            assert.equal(
              await db.periodoEmpleado.count({
                where: { employeeId: s.employeeId },
              }),
              0,
            );
            assert.equal(
              await db.processingJob.count({
                where: { importId: previa.vista.importId },
              }),
              0,
            );
            assert.equal(
              (
                await db.importacion.findUniqueOrThrow({
                  where: { importId: previa.vista.importId },
                })
              ).status,
              "VALIDADA",
            );
            fallar = false;
            const recuperada = await s.confirmar(previa.vista.importId);
            assert.equal(
              recuperada.resultado.procesamiento?.estado,
              "COMPLETADO",
            );
            assert.equal(recuperada.resultado.insertados, 201);
            assert.equal(
              await db.evaluacion.count({
                where: { employeeId: s.employeeId },
              }),
              201,
            );
          },
          { ahora: () => new Date("2031-01-01T12:00:00Z") },
        );
      },
    );

    await t.test(
      "fallo T11 desde HTTP conserva el commit y revierte solo el par fallido; reintento idempotente",
      async () => {
        let fallar = true;
        await escenario(
          db,
          async (s) => {
            const carga = await s.importar();
            const jobId = carga.procesamiento!.jobId;
            assert.equal(carga.status, "CONFIRMADA");
            assert.equal(carga.procesamiento!.estado, "FALLIDO");
            assert.equal(carga.procesamiento!.completados, 1);
            assert.equal(
              carga.procesamiento!.errores[0].par.periodStart,
              "2026-10-12",
            );
            assert.equal(
              await db.registroLaboral.count({
                where: { employeeId: s.employeeId },
              }),
              2,
            );
            assert.equal(
              await db.evaluacion.count({
                where: { employeeId: s.employeeId },
              }),
              1,
            );
            assert.equal(
              await db.alerta.count({ where: { employeeId: s.employeeId } }),
              0,
            );
            fallar = false;
            const retry = await s.llamar(`procesamientos/${jobId}/reintentar`);
            assert.equal(retry.status, 200);
            assert.equal(retry.body.estado, "COMPLETADO");
            assert.equal(retry.body.completados, 2);
            assert.deepEqual(retry.body.errores, []);
            assert.equal(
              await db.evaluacion.count({
                where: { employeeId: s.employeeId },
              }),
              2,
            );
            assert.equal(
              await db.alerta.count({ where: { employeeId: s.employeeId } }),
              1,
            );
            assert.deepEqual(
              (await s.confirmar(carga.importId)).resultado,
              carga,
            ); // Snapshot original; GET job entrega el estado actual.
          },
          {
            alPublicar: async (tx, evaluacion) => {
              await alPublicarAlerta(tx, evaluacion);
              if (fallar && evaluacion.nivel === "ALTO")
                throw new ErrorDominio(
                  "REQUIERE_REPROCESO",
                  "Fallo de T11 inyectado.",
                );
            },
          },
        );
      },
    );

    await t.test(
      "informe falla después de publicación y el par solo completa al recuperarlo",
      async () => {
        let fallar = true;
        await escenario(
          db,
          async (s) => {
            const carga = await s.importar();
            assert.equal(carga.procesamiento!.estado, "FALLIDO");
            assert.equal(carga.procesamiento!.completados, 0);
            assert.equal(
              await db.evaluacion.count({
                where: { employeeId: s.employeeId },
              }),
              1,
            );
            fallar = false;
            const retry = await s.llamar(
              `procesamientos/${carga.procesamiento!.jobId}/reintentar`,
            );
            assert.equal(retry.body.estado, "COMPLETADO");
            assert.equal(
              await db.evaluacion.count({
                where: { employeeId: s.employeeId },
              }),
              2,
            );
          },
          {
            informe: async (cliente, id) => {
              if (fallar) throw new Error("Fallo de informe inyectado.");
              return construirInforme(cliente, id);
            },
          },
        );
      },
    );

    await t.test(
      "carga fuera de orden reprocesa sucesor inmediato y conserva historial",
      () =>
        escenario(db, async (s) => {
          const filas = s.csv.trim().split(/\r?\n/);
          const segunda = await s.importar([filas[0], filas[2]].join("\n"));
          assert.equal(segunda.procesamiento!.totalPares, 1);
          const inicial = await db.evaluacion.findFirstOrThrow({
            where: { employeeId: s.employeeId },
          });
          assert.equal(inicial.nivel, "INCOMPLETO");
          const primera = await s.importar([filas[0], filas[1]].join("\n"));
          assert.deepEqual(
            primera.afectados.map((p) => p.periodStart),
            ["2026-10-05", "2026-10-12"],
          );
          assert.equal(
            await db.evaluacion.count({ where: { employeeId: s.employeeId } }),
            3,
          );
          const actual = await db.evaluacion.findFirstOrThrow({
            where: { employeeId: s.employeeId, nivel: "ALTO" },
          });
          assert.equal(actual.supersedesEvaluationId, inicial.evaluationId);
          assert.equal(
            (await construirInforme(db, actual.evaluationId)).alerta?.vigencia,
            "ACTIVA",
          );
        }),
    );

    await t.test(
      "job pendiente o lease vencido se recupera; lease vigente devuelve 409",
      async () => {
        let fallar = true;
        await escenario(
          db,
          async (s) => {
            const carga = await s.importar();
            const jobId = carga.procesamiento!.jobId;
            const par = await db.processingJobPar.findFirstOrThrow({
              where: { jobId },
            });
            await db.$executeRaw`UPDATE ProcessingJob SET estado = 'PROCESANDO', ownerToken = 'otro', leaseUntil = TIMESTAMPADD(SECOND,120,UTC_TIMESTAMP(3)) WHERE jobId = ${jobId}`;
            assert.equal(
              (await s.llamar(`procesamientos/${jobId}/reintentar`)).status,
              409,
            );
            await assert.rejects(
              completarPar(db, { jobId, ownerToken: "viejo" }, par.periodoId),
              { estadoHttp: 409 },
            );
            await db.$executeRaw`UPDATE ProcessingJob SET leaseUntil = TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE jobId = ${jobId}`;
            assert.equal(
              (await s.llamar(`procesamientos/${jobId}`, "GET")).body.estado,
              "PENDIENTE",
            );
            fallar = false;
            const retry = await s.llamar(`procesamientos/${jobId}/reintentar`);
            assert.equal(retry.body.estado, "COMPLETADO");
            await db.processingJob.update({
              where: { jobId },
              data: { estado: "PENDIENTE", ownerToken: null, leaseUntil: null },
            });
            assert.equal(
              (await s.llamar(`procesamientos/${jobId}/reintentar`)).body
                .estado,
              "COMPLETADO",
            );
            assert.equal(
              await db.evaluacion.count({
                where: { employeeId: s.employeeId },
              }),
              2,
            );
          },
          {
            alPublicar: async (tx, evaluacion) => {
              if (fallar) throw new Error("Fallo previo a reinicio.");
              await alPublicarAlerta(tx, evaluacion);
            },
          },
        );
      },
    );

    await t.test(
      "pérdida del token durante informe impide al ejecutor cerrar pares o job",
      async () => {
        let cambiar = true;
        await escenario(
          db,
          async (s) => {
            const carga = await s.importar();
            const jobId = carga.procesamiento!.jobId;
            assert.equal(carga.procesamiento!.completados, 0);
            const job = await db.processingJob.findUniqueOrThrow({
              where: { jobId },
            });
            assert.equal(job.ownerToken, "nuevo-propietario");
            assert.equal(job.estado, "PROCESANDO");
            await db.$executeRaw`UPDATE ProcessingJob SET leaseUntil = TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE jobId = ${jobId}`;
            assert.equal(
              (await s.llamar(`procesamientos/${jobId}/reintentar`)).body
                .estado,
              "COMPLETADO",
            );
          },
          {
            informe: async (cliente, id) => {
              const informe = await construirInforme(cliente, id);
              if (cambiar) {
                cambiar = false;
                await cliente.processingJob.updateMany({
                  where: {
                    importId: informe.evaluacion.snapshot.actual.sourceImportId,
                  },
                  data: { ownerToken: "nuevo-propietario" },
                });
              }
              return informe;
            },
          },
        );
      },
    );

    await t.test(
      "dos reintentos HTTP simultáneos tienen un solo ejecutor y renuevan lease a 120 s",
      async () => {
        let fallar = true,
          bloquear = false;
        let entrar!: () => void, salir!: () => void;
        const dentro = new Promise<void>((resolve) => {
          entrar = resolve;
        });
        const continuar = new Promise<void>((resolve) => {
          salir = resolve;
        });
        await escenario(
          db,
          async (s) => {
            const carga = await s.importar();
            const jobId = carga.procesamiento!.jobId;
            fallar = false;
            bloquear = true;
            const primero = s.llamar(`procesamientos/${jobId}/reintentar`);
            try {
              await dentro;
              const segundo = await s.llamar(
                `procesamientos/${jobId}/reintentar`,
              );
              assert.equal(segundo.status, 409);
              const [lease] = await db.$queryRaw<
                { segundos: bigint }[]
              >`SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(3), leaseUntil) AS segundos FROM ProcessingJob WHERE jobId = ${jobId}`;
              assert.ok(
                Number(lease.segundos) > 110 && Number(lease.segundos) <= 120,
              );
            } finally {
              salir();
            }
            assert.equal((await primero).body.estado, "COMPLETADO");
            assert.equal(
              await db.evaluacion.count({
                where: { employeeId: s.employeeId },
              }),
              2,
            );
          },
          {
            alPublicar: async (tx, evaluacion) => {
              if (fallar) throw new Error("Fallo para preparar reintento.");
              await alPublicarAlerta(tx, evaluacion);
            },
            informe: async (cliente, id) => {
              if (bloquear) {
                bloquear = false;
                entrar();
                await continuar;
              }
              return construirInforme(cliente, id);
            },
          },
        );
      },
    );

    await t.test(
      "reintento HTTP de reglas reemplaza ALTO por ALTO y supera la alerta previa",
      async () => {
        const version = `T04-${randomUUID()}`;
        let fallar = false;
        try {
          await escenario(
            db,
            async (s) => {
              await s.importar();
              const anterior = await db.evaluacion.findFirstOrThrow({
                where: { employeeId: s.employeeId, nivel: "ALTO" },
              });
              const informe = await construirInforme(db, anterior.evaluationId);
              const publicada = await db.$transaction((tx) =>
                publicarConfiguracion(tx, {
                  ...informe.evaluacion.snapshot.reglas,
                  version,
                  effectiveFrom: "2026-10-12",
                  mediumLimit: 39,
                }),
              );
              fallar = true;
              const fallido = await s.llamar(
                `procesamientos/${publicada.jobId}/reintentar`,
              );
              assert.equal(fallido.body.estado, "FALLIDO");
              assert.equal(
                (await construirInforme(db, anterior.evaluationId)).alerta!
                  .vigencia,
                "ACTIVA",
              );
              fallar = false;
              assert.equal(
                (await s.llamar(`procesamientos/${publicada.jobId}/reintentar`))
                  .body.estado,
                "COMPLETADO",
              );
              assert.equal(
                (await construirInforme(db, anterior.evaluationId)).alerta!
                  .vigencia,
                "SUPERADA",
              );
              assert.equal(
                await db.alerta.count({
                  where: { employeeId: s.employeeId, vigencia: "ACTIVA" },
                }),
                1,
              );
              assert.equal(
                await db.alerta.count({ where: { employeeId: s.employeeId } }),
                2,
              );
              const nueva = await db.evaluacion.findFirstOrThrow({
                where: { employeeId: s.employeeId, rulesVersion: version },
              });
              assert.equal(nueva.supersedesEvaluationId, anterior.evaluationId);
            },
            {
              alPublicar: async (tx, evaluacion) => {
                await alPublicarAlerta(tx, evaluacion);
                if (fallar)
                  throw new Error("Fallo de alerta durante cambio de reglas.");
              },
            },
          );
        } finally {
          await db.processingJobPar.deleteMany({
            where: { job: { rulesVersion: version } },
          });
          await db.processingJob.deleteMany({
            where: { rulesVersion: version },
          });
          await db.configuracionIndice.deleteMany({ where: { version } });
        }
      },
    );

    await t.test(
      "plantilla completa: 138 filas, 49 evaluables y resultados T03",
      () =>
        escenario(db, async (s) => {
          const plantilla = readFileSync("templates/indicadores.csv", "utf8");
          const resultado = await s.importar(plantilla);
          assert.equal(resultado.insertados, 138);
          assert.equal(resultado.procesamiento!.estado, "COMPLETADO");
          assert.equal(resultado.procesamiento!.completados, 138);
          const registros = await db.registroLaboral.findMany({
            where: { sourceImportId: resultado.importId },
          });
          assert.equal(new Set(registros.map((r) => r.employeeId)).size, 49);
          const esperados = readFileSync(
            "tests/data/resultados_esperados.csv",
            "utf8",
          )
            .trim()
            .split(/\r?\n/);
          const columnas = esperados.shift()!.split(",");
          for (const fila of esperados) {
            const valores = fila.split(",");
            const e = Object.fromEntries(
              columnas.map((c, i) => [c, valores[i]]),
            );
            const evaluacion = await db.evaluacion.findFirstOrThrow({
              where: {
                employeeId: e.employee_id,
                periodo: {
                  periodStart: new Date(`${e.period_start}T00:00:00Z`),
                },
              },
            });
            assert.equal(Number(evaluacion.indice), Number(e.indice));
            assert.equal(evaluacion.nivel, e.nivel);
          }
        }),
    );
  } finally {
    await db.$disconnect();
  }
});
