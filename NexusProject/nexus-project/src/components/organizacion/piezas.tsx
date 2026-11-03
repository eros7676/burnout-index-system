"use client";
// Small pieces the people and teams screens share.
import { useRef, type ReactNode } from "react";
import { semana as textoSemana } from "@/shared/formato";
import { usePageEnter } from "@/shared/motion";
import { SelectField } from "@/shared/ui";
import s from "./organizacion.module.css";

/** A screen of this module: the page pours in piece by piece (`data-enter`). */
export function PaginaOrg({ children }: { children: ReactNode }) {
  const pagina = useRef<HTMLDivElement>(null);
  usePageEnter(pagina);
  return (
    <div ref={pagina} className={s.page}>
      {children}
    </div>
  );
}

/** The Sunday that closes the week starting on `inicio` (YYYY-MM-DD, no time zone involved). */
export function finDeSemana(inicio: string) {
  const [anio, mes, dia] = inicio.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + 6)).toISOString().slice(0, 10);
}

/** The loaded weeks, newest first, named as a date range. */
export function SelectorSemanas({
  semanas,
  valor,
  onCambio,
}: {
  semanas: string[];
  valor: string;
  onCambio: (periodStart: string) => void;
}) {
  return (
    <SelectField
      etiqueta="Semana"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
    >
      {semanas.map((inicio) => (
        <option key={inicio} value={inicio}>
          {textoSemana(inicio, finDeSemana(inicio))}
        </option>
      ))}
    </SelectField>
  );
}

/** Today in Buenos Aires (UTC-3 all year), as the server reads it. */
export const hoyLocal = () =>
  new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
