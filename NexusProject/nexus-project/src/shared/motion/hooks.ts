"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useGSAP } from "@gsap/react";
import {
  movimientoReducido,
  ordenLectura,
  pourIn,
  registrar,
  revealRows,
  settle,
} from "./motion";

type Fase = "espera" | "entrando" | "lista";
type Pieza = { fase: Fase; promesa: Promise<void>; resolver: () => void };
/** Resolves when the element's piece may show data; `true` means the data should settle. */
export type ReadyFor = (el: HTMLElement | null) => Promise<boolean>;

/**
 * Pours the page in once, piece by piece (`data-enter`, in reading order),
 * and hands back `readyFor` so data waits for its own piece.
 */
export function usePageEnter(pageRef: RefObject<HTMLElement | null>) {
  const piezas = useRef(new Map<Element, Pieza>());
  const marcar = (el: Element, fase: Fase) => {
    const pieza = piezas.current.get(el);
    if (!pieza) return;
    pieza.fase = fase;
    if (fase === "lista") pieza.resolver();
  };
  useGSAP(
    () => {
      const raiz = pageRef.current;
      if (!raiz) return;
      registrar();
      const orden = ordenLectura(raiz.querySelectorAll<HTMLElement>("[data-enter]"));
      for (const el of orden) {
        let resolver = () => {};
        const promesa = new Promise<void>((r) => (resolver = r));
        piezas.current.set(el, { fase: "espera", promesa, resolver });
      }
      const tl = pourIn(orden, {
        onStart: (el) => marcar(el, "entrando"),
        onComplete: (el) => marcar(el, "lista"),
      });
      if (!tl) orden.forEach((el) => marcar(el, "lista"));
    },
    { scope: pageRef },
  );
  const readyFor = useCallback<ReadyFor>(async (el) => {
    if (!el || movimientoReducido()) return false;
    const raiz = el.closest("[data-enter]");
    const pieza = raiz && piezas.current.get(raiz);
    // Not part of the cascade, or still waiting its turn: the data enters inside it.
    if (!pieza || pieza.fase === "espera") return false;
    if (pieza.fase === "entrando") await pieza.promesa;
    return true;
  }, []);
  return { readyFor };
}

/** Holds a server value back until its piece is ready, then settles it in place. */
export function useArrival<T>(
  readyFor: ReadyFor,
  cajaRef: RefObject<HTMLElement | null>,
  valor: T,
): T {
  const [mostrado, setMostrado] = useState(valor);
  const asentar = useRef(false);
  useEffect(() => {
    let vivo = true;
    readyFor(cajaRef.current).then((debe) => {
      if (!vivo) return;
      asentar.current = debe;
      setMostrado(valor);
    });
    return () => {
      vivo = false;
    };
  }, [valor, readyFor, cajaRef]);
  useLayoutEffect(() => {
    if (!asentar.current || !cajaRef.current) return;
    asentar.current = false;
    settle(cajaRef.current);
  }, [mostrado, cajaRef]);
  return mostrado;
}

/** Staggers a table body's rows each time `clave` changes (a new page of data). */
export function useRowsEnter(
  cuerpoRef: RefObject<HTMLElement | null>,
  clave: unknown,
) {
  useLayoutEffect(() => {
    if (cuerpoRef.current && clave !== undefined) revealRows(cuerpoRef.current);
  }, [clave, cuerpoRef]);
}
