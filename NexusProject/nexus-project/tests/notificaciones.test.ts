import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { simularCorreo } from "../src/lib/mail";
import {
  crearHttpNotificaciones,
  validarSolicitud,
} from "../src/server/http/notificaciones";

test("T12: simulador distingue éxito, fallo y ausencia de destinatario sin correo real", () => {
  assert.equal(simularCorreo("TL-01", "EXITO").estado, "ENVIADO");
  assert.match(simularCorreo("TL-01", "EXITO").detalle!, /simulado/);
  assert.equal(simularCorreo("TL-01", "FALLO").estado, "FALLIDO");
  for (const resultado of ["EXITO", "FALLO"] as const)
    assert.equal(simularCorreo(null, resultado).estado, "SIN_DESTINATARIO");
});
test("T12: HTTP valida las solicitudes antes de tocar la base y no expone errores internos", async () => {
  const requestId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(validarSolicitud({ requestId, resultado: "EXITO" }), {
    requestId,
    resultado: "EXITO",
  });
  for (const valor of [
    null,
    [],
    {},
    { requestId, resultado: "SMTP" },
    { requestId, resultado: "FALLO", correo: "externo" },
    { requestId: "x", resultado: "EXITO" },
  ])
    assert.throws(() => validarSolicitud(valor));
  const http = crearHttpNotificaciones({} as PrismaClient);
  const req = (body: string) =>
    new Request("http://local/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  for (const body of ["{", "null", "{}", "x".repeat(1025)])
    assert.equal((await http.preparar(req(body), "alerta")).status, 400);
  assert.equal(
    (await http.listar(new Request("http://local/api?q=1"), "alerta")).status,
    400,
  );
  assert.equal(
    (await http.listar(new Request("http://local/api"), "../x")).status,
    400,
  );
  assert.equal(
    (await http.procesar(req("{}"), "alerta", "intento")).status,
    400,
  );
  const error = await http.listar(new Request("http://local/api"), "alerta");
  assert.equal(error.status, 500);
  assert.equal(error.headers.get("cache-control"), "no-store");
  assert.equal(
    (await error.json()).error.mensaje,
    "No se pudo completar la simulación.",
  );
});
