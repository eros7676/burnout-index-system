// The report's explanation comes from the server (T10) with system codes in it
// ("nivel ALTO", "(SOSTENIDO)", "HE, DS") and the demo disclaimer, which the
// shell already says once. This reads it in words; numbers and order stay as
// the server wrote them.
import type { Factor, Nivel, Persistencia } from "@/shared/contracts";
import { FACTOR, NIVEL } from "@/shared/formato";

const CIERRE =
  / ?Parámetros demostrativos; no es un diagnóstico de burnout y no dispara una acción automática\./;
const VERSION_SUELTA = / ?Versión [^\s.]+(?:\.[^\s.]+)*\./;
const LISTA_FACTORES = /\b(?:HE|DS|CT|VP)(?:, (?:HE|DS|CT|VP))*\b/g;

const MOTIVO: Record<Persistencia["motivo"], string> = {
  SOSTENIDO: "sostenida",
  NO_SOSTENIDO: "no sostenida",
  HISTORIAL_INSUFICIENTE: "sin semana anterior",
};

const enMinuscula = (texto: string) =>
  texto.charAt(0).toLowerCase() + texto.slice(1);

function factoresEnPalabras(lista: string) {
  const nombres = lista
    .split(", ")
    .map((f) => enMinuscula(FACTOR[f as Factor]));
  return nombres.length > 1
    ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`
    : nombres[0];
}

const MAYUSCULA = (texto: string) =>
  texto.charAt(0).toUpperCase() + texto.slice(1);

export function explicacionEnPalabras(texto: string) {
  return MAYUSCULA(
    texto
      // "88,95 puntos, nivel ALTO." opens every text and repeats the figures shown beside it.
      .replace(/^[\d.,]+ puntos, nivel [A-Z_]+[.,]\s*/, "")
      .replace(CIERRE, "")
      // The rules version is shown beside the result; a sentence that only names it goes.
      .replace(VERSION_SUELTA, "")
      .replace(/de la versión (\S+?)([.,])/g, "de las reglas $1$2")
      // A reason that only repeats the sentence around it ("Se cumple la persistencia (SOSTENIDO)").
      .replace(/ \((?:SOSTENIDO|HISTORIAL_INSUFICIENTE)\)/g, "")
      .replace(
        /\b(NO_SOSTENIDO|SOSTENIDO|HISTORIAL_INSUFICIENTE)\b/g,
        (codigo) => MOTIVO[codigo as Persistencia["motivo"]],
      )
      .replace(/\b(BAJO|MEDIO|ALTO|INCOMPLETO)\b/g, (codigo) =>
        NIVEL[codigo as Nivel],
      )
      .replace(LISTA_FACTORES, factoresEnPalabras)
      .trim()
  );
}
