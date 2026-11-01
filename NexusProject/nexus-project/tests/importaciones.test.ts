import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { crearHttpCu01, respuestaCu01 } from "../src/server/http/cu01";
import {
  comprobarArchivoCsv,
  MAX_ARCHIVO_CSV,
} from "../src/server/services/importaciones";
import { ErrorDominio } from "../src/shared/errors";

test("T04: HTTP rechaza peticiones mal formadas antes de consultar la base", async () => {
  const db = new PrismaClient(); // No abre conexión; ningún caso debe alcanzar Prisma.
  const http = crearHttpCu01(db);
  const post = (body: string, type = "application/json") =>
    new Request("http://localhost/", {
      method: "POST",
      headers: { "content-type": type },
      body,
    });
  for (const body of ["", "{", "null", "[]", '{"actorId":"otro"}'])
    assert.equal((await http.confirmar(post(body), "inexistente")).status, 400);
  assert.equal(
    (await http.reintentar(post("{}", "text/plain"), "inexistente")).status,
    400,
  );
  assert.equal((await http.confirmar(post("{}"), "x".repeat(37))).status, 400);
  assert.equal((await http.validar(post("{}"))).status, 400);
  assert.equal(
    (
      await http.validar(
        post("mal multipart", "multipart/form-data; boundary=test"),
      )
    ).status,
    400,
  );
  for (const valor of ["texto", new File(["a"], "datos.csv")]) {
    const form = new FormData();
    form.append("file", valor);
    form.append("extra", "no permitido");
    assert.equal(
      (
        await http.validar(
          new Request("http://localhost", { method: "POST", body: form }),
        )
      ).status,
      400,
    );
  }
  const doble = new FormData();
  doble.append("file", new File(["a"], "uno.csv"));
  doble.append("file", new File(["b"], "dos.csv"));
  assert.equal(
    (
      await http.validar(
        new Request("http://localhost", { method: "POST", body: doble }),
      )
    ).status,
    400,
  );
  await db.$disconnect();
});

test("T04: límites de bytes se aplican antes de cargar el cuerpo completo", async () => {
  const db = new PrismaClient();
  const http = crearHttpCu01(db);
  let enviados = 0,
    cancelado = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      enviados++;
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelado = true;
    },
  });
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  assert.equal((await http.validar(request)).status, 413);
  assert.ok(cancelado);
  assert.ok(enviados <= 8);
  const porHeader = new Request("http://localhost", {
    method: "POST",
    body: "a",
    headers: {
      "content-type": "multipart/form-data; boundary=x",
      "content-length": String(MAX_ARCHIVO_CSV + 100_000),
    },
  });
  assert.equal((await http.validar(porHeader)).status, 413);
  const grande = new FormData();
  grande.append(
    "file",
    new File([new Uint8Array(MAX_ARCHIVO_CSV + 1)], "a.csv"),
  );
  assert.equal(
    (
      await http.validar(
        new Request("http://localhost", { method: "POST", body: grande }),
      )
    ).status,
    413,
  );
  await db.$disconnect();
});

test("T04: formato CSV y errores uniformes sin revelar detalles técnicos", async () => {
  for (const [nombre, mime] of [
    ["a.xlsx", "application/octet-stream"],
    ["a.csv", "application/json"],
  ]) {
    assert.throws(
      () => comprobarArchivoCsv(new File(["a"], nombre, { type: mime })),
      { estadoHttp: 415 },
    );
  }
  comprobarArchivoCsv(new File(["a"], "DATOS.CSV", { type: "text/csv" }));
  const interno = await respuestaCu01(async () => {
    throw new Error("mysql://secreto");
  });
  assert.equal(interno.status, 500);
  assert.doesNotMatch(await interno.text(), /secreto/);
  const dominio = await respuestaCu01(async () => {
    throw new ErrorDominio("CONFIGURACION_INVALIDA", "Reglas inválidas.");
  });
  assert.equal(dominio.status, 422);
  assert.equal(dominio.headers.get("cache-control"), "no-store");
});
