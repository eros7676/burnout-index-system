import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { sembrarBase } from "../prisma/seed-base";
import { crearHttpConsultas } from "../src/server/http/consultas";
import { crearHttpExportaciones } from "../src/server/http/exportaciones";
import { proteger, tokenDemo } from "../src/server/http/permisos-demo";
import { abrirSeguimiento, actualizarSeguimiento } from "../src/server/services/seguimiento";
import { conAlerta, sesion } from "./alerta-fixture";

const rrhh = sesion("demo-rrhh");
const sumarDias = (dias: number) =>
  new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

test("MySQL exportaciones y lista de alertas: alcance, filtros, seguimiento, auditoría y protección", async (t) => {
  assert.match(
    new URL(process.env.TEST_DATABASE_URL!).pathname,
    /^\/[A-Za-z0-9_]+_test$/,
  );
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const exportaciones = crearHttpExportaciones(db);
  const guardada = proteger(db, "EXPORTAR", exportaciones.descargar);
  const consultas = crearHttpConsultas(db);
  const alertasGuardadas = proteger(db, "LEER", consultas.alertas);
  const como = (userId: string, ruta: string) =>
    new Request(`http://localhost${ruta}`, {
      headers: { Cookie: `nexo_demo=${tokenDemo(userId)}` },
    });
  const descargar = async (userId: string, tipo: string, consulta = "") => {
    const respuesta = await guardada(
      como(userId, `/api/exportaciones/${tipo}${consulta}`),
      tipo,
    );
    if (!respuesta.ok) return { respuesta, texto: await respuesta.json() };
    // `Response.text()` drops the BOM; the file's bytes are what Excel reads.
    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    return { respuesta, texto: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) };
  };
  try {
    await db.$transaction((tx) => sembrarBase(tx));
    await t.test("alertas: archivo para Excel, alcance del Team Lead, seguimiento, auditoría y protección contra fórmulas", async () => {
      await conAlerta(db, { nombre: '=HYPERLINK("http://malo.example","clic")' }, async (a) => {
        await conAlerta(db, { teamId: "EQ-02" }, async (b) => {
          const [alertaA] = await a.alertas();
          const filtroA = `?employeeId=${a.employeeId}`;
          const filtroB = `?employeeId=${b.employeeId}`;

          // RR. HH.: the file, its headers and its first lines.
          const { respuesta, texto } = await descargar("demo-rrhh", "alertas", filtroA);
          assert.equal(respuesta.status, 200);
          assert.equal(respuesta.headers.get("content-type"), "text/csv; charset=utf-8");
          assert.match(respuesta.headers.get("content-disposition")!, /^attachment; filename="alertas-\d{4}-\d{2}-\d{2}\.csv"$/);
          assert.equal(respuesta.headers.get("cache-control"), "no-store");
          assert.equal(respuesta.headers.get("x-content-type-options"), "nosniff");
          assert.equal(respuesta.headers.get("x-total-filas"), "1");
          assert.ok((texto as string).startsWith("﻿Alertas con seguimiento\r\n"));
          assert.match(texto as string, /Generado el \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(hora de Buenos Aires\) por RR\. HH\./);
          assert.match(texto as string, /Documento confidencial/);
          assert.match(texto as string, /\r\nLegajo;Persona;Equipo;Tipo;Semana desde;/);
          // The name that would run as a formula is neutralized, quoted because it holds the separator-free quotes.
          assert.match(texto as string, /;"'=HYPERLINK\(""http:\/\/malo\.example"",""clic""\)";/);
          assert.doesNotMatch(texto as string, /;=HYPERLINK/);
          assert.match(texto as string, /Sin seguimiento/);

          // Scope: a Team Lead gets their team's alerts and is refused another team's.
          const propio = await descargar("demo-tl-01", "alertas");
          assert.equal(propio.respuesta.status, 200);
          assert.match(propio.texto as string, new RegExp(a.employeeId));
          assert.doesNotMatch(propio.texto as string, new RegExp(b.employeeId));
          assert.match(propio.texto as string, /Alcance: Célula ficticia 1\./);
          for (const ajena of [`?teamId=EQ-02`, filtroB])
            assert.equal((await descargar("demo-tl-01", "alertas", ajena)).respuesta.status, 403);
          // Gerencia reads all (D11); the employee role may not export.
          const todo = await descargar("demo-gerencia", "alertas");
          assert.match(todo.texto as string, new RegExp(b.employeeId));
          assert.equal((await descargar("demo-empleado", "alertas")).respuesta.status, 403);
          assert.equal((await descargar("demo-rrhh", "alertas", "?pageSize=5")).respuesta.status, 400);
          assert.equal((await descargar("demo-rrhh", "alertas", "?seguimiento=XX")).respuesta.status, 400);
          assert.equal((await descargar("demo-rrhh", "equipos", "?employeeId=EMP-001")).respuesta.status, 400);
          assert.equal((await descargar("demo-rrhh", "otra")).respuesta.status, 404);

          // The follow-up status travels in the file and the follow-up filters narrow it.
          const caso = (await abrirSeguimiento(db, alertaA.alertId, {}, rrhh)).caso!;
          const vence = sumarDias(7);
          await actualizarSeguimiento(db, alertaA.alertId, { estado: "EN_CURSO", vence }, rrhh);
          const conCaso = await descargar("demo-rrhh", "alertas", `${filtroA}&seguimiento=EN_CURSO`);
          assert.match(conCaso.texto as string, new RegExp(`;En curso;Team Lead, Célula ficticia 1;${vence};No;`));
          assert.equal(conCaso.respuesta.headers.get("x-total-filas"), "1");
          assert.match(conCaso.texto as string, /Seguimiento = En curso/);
          for (const otro of ["SIN_SEGUIMIENTO", "CERRADO", "NUEVO"])
            assert.equal(
              (await descargar("demo-rrhh", "alertas", `${filtroA}&seguimiento=${otro}`)).respuesta.headers.get("x-total-filas"),
              "0",
            );
          assert.equal(
            (await descargar("demo-rrhh", "alertas", `${filtroA}&asignadoA=demo-tl-01`)).respuesta.headers.get("x-total-filas"),
            "1",
          );
          assert.equal(
            (await descargar("demo-rrhh", "alertas", `${filtroA}&vencido=1`)).respuesta.headers.get("x-total-filas"),
            "0",
          );
          await db.casoSeguimiento.update({ where: { casoId: caso.casoId }, data: { vence: new Date("2026-01-01T00:00:00Z") } });
          assert.equal(
            (await descargar("demo-rrhh", "alertas", `${filtroA}&vencido=1`)).respuesta.headers.get("x-total-filas"),
            "1",
          );

          // Audit: the event exists before the data is read by anyone, with who, what and how many; no data.
          const id = respuesta.headers.get("x-request-id")!;
          const evento = await db.eventoAuditoria.findFirstOrThrow({
            where: { accion: "EXPORTACION_GENERADA", recursoId: id },
          });
          assert.equal(evento.entidad, "EXPORTACION");
          assert.equal(evento.actorId, "demo-rrhh");
          assert.equal(evento.actorRol, "RRHH");
          assert.equal(evento.solicitudId, id);
          assert.deepEqual(evento.detalles, {
            dataset: "ALERTAS",
            formato: "CSV",
            filtros: { employeeId: a.employeeId },
            filas: 1,
            alcance: null,
          });
          const tl = await db.eventoAuditoria.findFirstOrThrow({
            where: { accion: "EXPORTACION_GENERADA", recursoId: propio.respuesta.headers.get("x-request-id")! },
          });
          assert.equal((tl.detalles as { alcance: string }).alcance, "EQ-01");
          assert.doesNotMatch(JSON.stringify(evento.detalles), /Persona ficticia|HYPERLINK/);
          // The refusals are recorded too.
          assert.ok(
            (await db.eventoAuditoria.count({
              where: { accion: "ACCESO_DENEGADO", actorId: "demo-tl-01", resultado: "DENEGADO" },
            })) >= 2,
          );
        });
      });
    });

    await t.test("personas: una semana, con su nivel, y el Team Lead solo ve su equipo", async () => {
      await conAlerta(db, {}, async (a) => {
        const { respuesta, texto } = await descargar("demo-rrhh", "personas", `?periodStart=2026-10-12&employeeId=${a.employeeId}`);
        assert.equal(respuesta.status, 200);
        assert.match(respuesta.headers.get("content-disposition")!, /personas-2026-10-12\.csv/);
        const fila = (texto as string).split("\r\n").find((l) => l.startsWith(a.employeeId))!;
        assert.match(fila, /;Técnico;Team Lead ficticio 1;2026-10-12;2026-10-18;Alto;91,21;16;16;10;7;5;14;Sí$/);
        // Default week is the latest loaded; a Team Lead of another team gets none of it.
        const ultima = await descargar("demo-rrhh", "personas", `?employeeId=${a.employeeId}`);
        assert.match(ultima.texto as string, /Semana = 12–18 oct 2026/);
        assert.equal((await descargar("demo-tl-02", "personas", `?employeeId=${a.employeeId}`)).respuesta.status, 403);
        const delEquipo = await descargar("demo-tl-02", "personas", "?periodStart=2026-10-12");
        assert.doesNotMatch(delEquipo.texto as string, new RegExp(a.employeeId));
        // Every person in scope has a row, also without data that week.
        const filas = (delEquipo.texto as string).split("\r\n").filter((l) => /^(EMP|TL)-/.test(l));
        assert.equal(
          filas.length,
          await db.empleado.count({ where: { teamId: "EQ-02", activo: true, enCobertura: true, tipo: { in: ["TECNICO", "TEAM_LEAD"] } } }),
        );
        assert.ok(filas.every((l) => /;Sin datos;/.test(l)));
      });
    });

    await t.test("equipos: resumen de la semana; un grupo de menos de cinco no muestra cifras", async () => {
      const chico = `B7-${randomUUID().slice(0, 8)}`;
      await db.equipo.create({ data: { teamId: chico, nombre: "Equipo de prueba chico", liderId: null, gerenteId: "GER-01" } });
      try {
        await conAlerta(db, {}, async (a) => {
          await conAlerta(db, { teamId: chico }, async () => {
            const { texto, respuesta } = await descargar("demo-rrhh", "equipos", "?periodStart=2026-10-12");
            assert.equal(respuesta.status, 200);
            const lineas = (texto as string).split("\r\n");
            const miembros = await db.empleado.count({ where: { teamId: "EQ-01", activo: true, enCobertura: true, tipo: { in: ["TECNICO", "TEAM_LEAD"] } } });
            const eq1 = lineas.find((l) => l.startsWith("Célula ficticia 1;"))!;
            // Personas; with result; Bajo; Medio; Alto; Incompleto; average; alerts; open; late.
            assert.equal(eq1, `Célula ficticia 1;2026-10-12;2026-10-18;${miembros};1;0;0;1;0;91,21;1;0;0;`);
            // Two people: the headcount, and nothing else about the group.
            const pequeno = lineas.find((l) => l.startsWith("Equipo de prueba chico;"))!;
            assert.equal(
              pequeno,
              "Equipo de prueba chico;2026-10-12;2026-10-18;1;;;;;;;;;;Grupo de menos de 5 personas: indicadores no mostrados.",
            );
            // A Team Lead of a larger team gets only that team.
            const tl = await descargar("demo-tl-01", "equipos", "?periodStart=2026-10-12");
            assert.doesNotMatch(tl.texto as string, /Equipo de prueba chico|Célula ficticia 2;/);
            assert.match(tl.texto as string, /Célula ficticia 1;/);
            void a;
          });
        });
      } finally {
        await db.equipo.delete({ where: { teamId: chico } });
      }
    });

    await t.test("la lista de alertas lleva nombres, semana, serie y seguimiento, y admite sus filtros", async () => {
      await conAlerta(db, {}, async (a) => {
        const [alerta] = await a.alertas();
        const lista = async (consulta: string, userId = "demo-rrhh") => {
          const r = await alertasGuardadas(como(userId, `/api/alertas?employeeId=${a.employeeId}${consulta}`));
          return { status: r.status, cuerpo: await r.json() };
        };
        const sin = await lista("");
        assert.equal(sin.status, 200);
        assert.equal(sin.cuerpo.total, 1);
        const item = sin.cuerpo.items[0];
        assert.equal(item.alertId, alerta.alertId);
        assert.equal(item.persona.equipo, "Célula ficticia 1");
        assert.equal(item.persona.tipo, "TECNICO");
        assert.equal(item.destinatario, "Team Lead ficticio 1");
        assert.deepEqual(
          item.semana,
          { periodStart: "2026-10-12", periodEnd: "2026-10-18", nivel: "ALTO", indice: 91.21, actualizado: true },
        );
        assert.deepEqual(item.serie.map((s: { periodStart: string }) => s.periodStart), ["2026-10-05", "2026-10-12"]);
        assert.equal(item.seguimiento, null);
        assert.ok(sin.cuerpo.equipos.length >= 4);
        assert.equal(sin.cuerpo.personas, 1);
        // «Dirigidas a usted»: a technician's alert is addressed to their Team Lead, not to Gerencia.
        assert.equal((await lista("&dirigidas=1", "demo-tl-01")).cuerpo.total, 1);
        assert.equal((await lista("&dirigidas=1", "demo-gerencia")).cuerpo.total, 0);
        assert.equal((await lista("", "demo-gerencia")).cuerpo.total, 1);
        assert.equal((await lista("&dirigidas=1")).cuerpo.total, 1);
        // Filters.
        assert.equal((await lista("&seguimiento=SIN_SEGUIMIENTO")).cuerpo.total, 1);
        assert.equal((await lista("&seguimiento=EN_CURSO")).cuerpo.total, 0);
        await abrirSeguimiento(db, alerta.alertId, {}, rrhh);
        const abierta = await lista("&seguimiento=NUEVO");
        assert.equal(abierta.cuerpo.total, 1);
        assert.deepEqual(
          { ...abierta.cuerpo.items[0].seguimiento, casoId: "x" },
          { casoId: "x", estado: "NUEVO", asignadoA: { userId: "demo-tl-01", nombre: "Team Lead, Célula ficticia 1" }, vence: null, vencido: false },
        );
        assert.equal((await lista("&seguimiento=SIN_SEGUIMIENTO")).cuerpo.total, 0);
        assert.equal((await lista("&asignadoA=demo-tl-01")).cuerpo.total, 1);
        assert.equal((await lista("&asignadoA=demo-rrhh")).cuerpo.total, 0);
        assert.equal((await lista("&periodStart=2026-10-12")).cuerpo.total, 1);
        assert.equal((await lista("&periodStart=2026-10-05")).cuerpo.total, 0);
        // Paging keeps the total.
        const pagina2 = await lista("&pageSize=1&page=2");
        assert.equal(pagina2.cuerpo.total, 1);
        assert.equal(pagina2.cuerpo.items.length, 0);
        // Bad filters, repeated keys and unknown keys are refused.
        for (const mala of ["&seguimiento=XX", "&vencido=2", "&dirigidas=0", "&seguimiento=NUEVO&seguimiento=EN_CURSO", "&desconocido=1", "&asignadoA=a b"])
          assert.equal((await lista(mala)).status, 400, mala);
        // A Team Lead keeps to their team: the team filter of another is refused, and the options are theirs.
        assert.equal((await lista("&teamId=EQ-02", "demo-tl-01")).status, 403);
        const delTl = await lista("", "demo-tl-01");
        assert.equal(delTl.cuerpo.total, 1);
        assert.deepEqual(delTl.cuerpo.equipos, [{ teamId: "EQ-01", nombre: "Célula ficticia 1" }]);
        // Another team's Team Lead cannot even ask about this person.
        assert.equal((await lista("", "demo-tl-02")).status, 403);
        assert.equal((await lista("", "demo-empleado")).status, 403);
      });
    });
  } finally {
    await db.$disconnect();
  }
});
