// The motion kit: the only module that imports gsap. Pages call the helpers
// and hooks exported from ./index; they never tween on their own.
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

/** Mirrors --motion-* and --ease-standard in globals.css (seconds and px). */
export const MOTION = {
  fast: 0.12,
  base: 0.18,
  slow: 0.24,
  page: 0.3,
  cascade: 0.035,
  rows: 0.025,
  travel: { cascade: 12, rows: 8, settle: 6 },
  rowsCap: 24,
} as const;

let registrado = false;
export function registrar() {
  if (registrado || typeof window === "undefined") return;
  gsap.registerPlugin(useGSAP, CustomEase);
  CustomEase.create("standard", ".2,0,0,1");
  gsap.ticker.lagSmoothing(0);
  registrado = true;
}

let reducido: boolean | undefined;
/** The one switch: read once; under it every helper leaves the DOM at rest. */
export function movimientoReducido() {
  if (typeof window === "undefined") return true;
  reducido ??= window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reducido;
}

const CAPA = "transform, opacity";
export const promover = (els: HTMLElement[]) =>
  els.forEach((el) => (el.style.willChange = CAPA));
export const liberar = (els: HTMLElement[]) =>
  els.forEach((el) => el.style.removeProperty("will-change"));

/** Visual reading order: top to bottom, then left to right (DOM order fails on grids). */
export function ordenLectura(els: Iterable<HTMLElement>) {
  return [...els]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .sort((a, b) =>
      Math.abs(a.r.top - b.r.top) > 4 ? a.r.top - b.r.top : a.r.left - b.r.left,
    )
    .map(({ el }) => el);
}

type Fases = {
  onStart?: (el: HTMLElement) => void;
  onComplete?: (el: HTMLElement) => void;
};
/** Page entry: one piece after another, 35 ms apart, each rising 12 px. */
export function pourIn(piezas: HTMLElement[], fases: Fases = {}) {
  if (movimientoReducido() || !piezas.length) return null;
  registrar();
  promover(piezas);
  const tl = gsap.timeline({ onComplete: () => liberar(piezas) });
  piezas.forEach((pieza, i) =>
    tl.from(
      pieza,
      {
        opacity: 0,
        y: MOTION.travel.cascade,
        duration: MOTION.page,
        ease: "standard",
        clearProps: "opacity,transform",
        onStart: () => fases.onStart?.(pieza),
        onComplete: () => fases.onComplete?.(pieza),
      },
      i * MOTION.cascade,
    ),
  );
  return tl;
}

const piezaEnCurso = (el: HTMLElement) => {
  const pieza = el.closest<HTMLElement>("[data-enter]");
  return !!pieza && gsap.isTweening(pieza);
};

/** Data that replaced its skeleton: a 6 px fade-up, skipped while its piece still enters. */
export function settle(contenedor: HTMLElement) {
  if (movimientoReducido() || piezaEnCurso(contenedor)) return;
  const hijos = [...contenedor.children] as HTMLElement[];
  if (!hijos.length) return;
  registrar();
  promover(hijos);
  gsap.from(hijos, {
    opacity: 0,
    y: MOTION.travel.settle,
    duration: MOTION.base,
    ease: "standard",
    clearProps: "opacity,transform",
    onComplete: () => liberar(hijos),
  });
}

/** Rows of a freshly loaded table: 25 ms apart, capped; skipped while the card enters. */
export function revealRows(cuerpo: HTMLElement) {
  if (movimientoReducido() || piezaEnCurso(cuerpo)) return;
  const filas = ([...cuerpo.children] as HTMLElement[]).slice(0, MOTION.rowsCap);
  if (!filas.length) return;
  registrar();
  promover(filas);
  gsap.from(filas, {
    opacity: 0,
    y: MOTION.travel.rows,
    duration: MOTION.base,
    ease: "standard",
    stagger: MOTION.rows,
    clearProps: "opacity,transform",
    onComplete: () => liberar(filas),
  });
}

export { gsap };
