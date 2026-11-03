import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import {
  calcularCambios,
  registrarEvento,
} from "../src/server/repositories/auditoria";
import {
  CATALOGO_AUDITORIA,
  ENTIDADES_AUDITORIA,
} from "../src/shared/auditoria-catalogo";

type Fila = Record<string, unknown>;
function txFalsa() {
  const filas: Fila[] = [];
  const tx = {
    eventoAuditoria: {
      create: async ({ data }: { data: Fila }) => {
        filas.push(data);
        return data;
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, filas };
}

test("D9: el catálogo cabe en las columnas y cada entidad tiene etiqueta", () => {
  for (const [accion, d] of Object.entries(CATALOGO_AUDITORIA)) {
    assert.ok(accion.length <= 40, `${accion} excede accion VarChar(40)`);
    assert.ok(d.entidad.length <= 20, `${accion}: entidad excede VarChar(20)`);
    assert.ok(ENTIDADES_AUDITORIA[d.entidad], `${accion}: entidad sin etiqueta`);
    if ("esLectura" in d)
      assert.equal(d.operacion, "CONSULTAR", `${accion}: lectura no es consulta`);
  }
});

test("D9: un evento único conserva su clave; uno repetible obtiene una clave nueva", async () => {
  const { tx, filas } = txFalsa();
  await registrarEvento(tx, {
    accion: "IMPORTACION_CONFIRMADA",
    recursoId: "imp-1",
    actor: "demo-local",
    detalles: {},
  });
  for (let i = 0; i < 2; i++)
    await registrarEvento(tx, {
      accion: "EMPLEADO_ACTUALIZADO",
      recursoId: "EMP-001",
      actor: "demo-rrhh",
      detalles: {},
    });
  assert.equal(filas[0].clave, "IMPORTACION:imp-1:IMPORTACION_CONFIRMADA");
  assert.equal(filas[0].entidad, "IMPORTACION");
  assert.match(String(filas[1].clave), /^EMPLEADO_ACTUALIZADO:EMP-001:[0-9a-f-]{36}$/);
  assert.notEqual(filas[1].clave, filas[2].clave);
  for (const fila of filas) assert.ok(String(fila.clave).length <= 180);
});

test("D9: el contexto de la solicitud llega completo al evento", async () => {
  const { tx, filas } = txFalsa();
  await registrarEvento(tx, {
    accion: "EMPLEADO_ACTUALIZADO",
    recursoId: "EMP-007",
    sujetoId: "EMP-007",
    actor: {
      actorId: "demo-rrhh",
      actorNombre: "RRHH",
      actorRol: "RRHH",
      origen: "WEB",
      solicitudId: "5b0c1f4e-0000-4000-8000-000000000001",
    },
    correlacionId: "op-1",
    cambios: [{ campo: "teamId", antes: "EQ-01", despues: "EQ-02" }],
    detalles: { motivo: "CAMBIO_EQUIPO" },
  });
  assert.deepEqual(
    {
      sujetoId: filas[0].sujetoId,
      actorId: filas[0].actorId,
      actorNombre: filas[0].actorNombre,
      actorRol: filas[0].actorRol,
      origen: filas[0].origen,
      solicitudId: filas[0].solicitudId,
      resultado: filas[0].resultado,
      correlacionId: filas[0].correlacionId,
      cambios: filas[0].cambios,
    },
    {
      sujetoId: "EMP-007",
      actorId: "demo-rrhh",
      actorNombre: "RRHH",
      actorRol: "RRHH",
      origen: "WEB",
      solicitudId: "5b0c1f4e-0000-4000-8000-000000000001",
      resultado: "EXITO",
      correlacionId: "op-1",
      cambios: [{ campo: "teamId", antes: "EQ-01", despues: "EQ-02" }],
    },
  );
});

test("D9: exige justificación, motivo de rechazo y una acción del catálogo", async () => {
  const { tx, filas } = txFalsa();
  await assert.rejects(
    registrarEvento(tx, {
      accion: "EMPLEADO_DESACTIVADO",
      recursoId: "EMP-001",
      actor: "demo-rrhh",
      justificacion: "   ",
      detalles: {},
    }),
    /justification/,
  );
  await assert.rejects(
    registrarEvento(tx, {
      accion: "ACCESO_DENEGADO",
      recursoId: "/api/personas",
      actor: "demo-tl-01",
      resultado: "DENEGADO",
      detalles: {},
    }),
    /reason code/,
  );
  await assert.rejects(
    registrarEvento(tx, {
      accion: "BORRAR_TODO" as "ACCESO_DENEGADO",
      recursoId: "x",
      actor: "demo-rrhh",
      detalles: {},
    }),
    /Unknown audit action/,
  );
  assert.equal(filas.length, 0);
});

test("D9: los cambios listan solo los campos modificados", () => {
  assert.deepEqual(
    calcularCambios(
      { nombre: "Ana", teamId: "EQ-01", enCobertura: true },
      { nombre: "Ana", teamId: "EQ-02", enCobertura: true },
    ),
    [{ campo: "teamId", antes: "EQ-01", despues: "EQ-02" }],
  );
});

test("D9: la auditoría es de solo agregado en todo el código de producción", () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? archivos(join(dir, e.name))
        : /\.(ts|tsx)$/.test(e.name)
          ? [join(dir, e.name)]
          : [],
    );
  for (const archivo of [...archivos("src"), ...archivos("prisma")])
    assert.doesNotMatch(
      readFileSync(archivo, "utf8"),
      /eventoAuditoria\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/,
      `${archivo} modifica o borra eventos de auditoría`,
    );
});
