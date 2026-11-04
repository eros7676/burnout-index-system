import assert from "node:assert/strict";
import test from "node:test";
import { configCorreo, motivoFallo } from "../src/server/correo";

const COMPLETA = {
  SMTP_HOST: "mail.example.test",
  SMTP_USER: "nexo@example.test",
  SMTP_PASSWORD: "secreta",
  MAIL_FROM: "Nexo Laboral <nexo@example.test>",
  MAIL_DESTINO_DEMO: "demo@example.test",
};

test("sin la configuración completa el correo sigue simulado", () => {
  assert.equal(configCorreo({}), null);
  for (const falta of Object.keys(COMPLETA))
    assert.equal(configCorreo({ ...COMPLETA, [falta]: " " }), null, falta);
  assert.equal(configCorreo({ ...COMPLETA, SMTP_PORT: "puerto" }), null);
});

test("con la configuración completa usa el puerto 465 y la dirección local por defecto", () => {
  assert.deepEqual(configCorreo(COMPLETA), {
    host: "mail.example.test",
    port: 465,
    usuario: "nexo@example.test",
    clave: "secreta",
    remitente: "Nexo Laboral <nexo@example.test>",
    destinoDemo: "demo@example.test",
    appUrl: "http://127.0.0.1:3000",
  });
  const otra = configCorreo({ ...COMPLETA, SMTP_PORT: "587", APP_URL: "https://nexo.example.test/" });
  assert.equal(otra?.port, 587);
  assert.equal(otra?.appUrl, "https://nexo.example.test");
});

test("el motivo de un fallo es el código SMTP, nunca el mensaje que puede traer la clave", () => {
  assert.equal(motivoFallo(Object.assign(new Error("535 secreta"), { code: "EAUTH", responseCode: 535 })), "EAUTH, SMTP 535");
  assert.equal(motivoFallo(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), "ETIMEDOUT");
  assert.equal(motivoFallo(new Error("secreta")), "error desconocido");
});
