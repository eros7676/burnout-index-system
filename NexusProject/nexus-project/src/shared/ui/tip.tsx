"use client";
// Tooltips (work/graficos/propuesta.md › Tooltip rules). Two entry points share one bubble:
//  - <Tip> wraps one trigger: a level, a metric's name, an abbreviated date.
//  - useLectura gives a chart one tab stop and a readout per mark (hover, arrow keys, tap).
// Behaviour follows WCAG 2.2 SC 1.4.13 (dismissible with Escape, hoverable, persistent) and the
// WAI-ARIA tooltip pattern. The bubble is visual only: the same text reaches assistive technology
// through aria-description (Tip) or a polite live region (charts), so nothing is announced twice.
import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import s from "./tip.module.css";

/** A readout: the value leads, its label follows. `clave` keys a row with a series' colour. */
export type Lectura = {
  titulo: string;
  filas: { etiqueta: string; valor: string; clave?: string }[];
  nota?: string;
};

export const textoLectura = (l: Lectura) =>
  [l.titulo, ...l.filas.map((f) => `${f.etiqueta}: ${f.valor}`), l.nota]
    .filter(Boolean)
    .join(". ");

const DEMORA_ABRIR = 200;
const DEMORA_CERRAR = 120;
const MARGEN = 8;

type Rect = { left: number; top: number; width: number; height: number };

/** The bubble, in a portal, above its anchor (below when there is no room), inside the viewport. */
function Burbuja({
  ancla,
  children,
  onPointerEnter,
  onPointerLeave,
}: {
  ancla: Rect;
  children: ReactNode;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const centro = ancla.left + ancla.width / 2;
    const left = Math.min(
      Math.max(MARGEN, centro - width / 2),
      window.innerWidth - width - MARGEN,
    );
    const arriba = ancla.top - height - MARGEN;
    const top = arriba >= MARGEN ? arriba : ancla.top + ancla.height + MARGEN;
    setPos({ left, top });
  }, [ancla.left, ancla.top, ancla.width, ancla.height, children]);
  return createPortal(
    <div
      ref={ref}
      className={s.burbuja}
      data-burbuja
      aria-hidden="true"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      data-visible={pos ? true : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>,
    document.body,
  );
}

/** The readout's body: title, then value-first rows, then a note. */
export function CuerpoLectura({ lectura }: { lectura: Lectura }) {
  return (
    <>
      <span className={s.titulo}>{lectura.titulo}</span>
      {lectura.filas.length > 0 && (
        <span className={s.filas}>
          {lectura.filas.map((f) => (
            <span key={f.etiqueta} className={s.fila}>
              {/* Rows without a key keep the key's room, so the values line up. */}
              {lectura.filas.some((g) => g.clave) && (
                <span
                  className={s.clave}
                  style={{ background: f.clave ?? "transparent" }}
                />
              )}
              <strong className={s.valor}>{f.valor}</strong>
              <span className={s.etiqueta}>{f.etiqueta}</span>
            </span>
          ))}
        </span>
      )}
      {lectura.nota && <span className={s.nota}>{lectura.nota}</span>}
    </>
  );
}

const rectDe = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** Open/close timing shared by both entry points. */
function useApertura() {
  const temporizador = useRef<number | undefined>(undefined);
  const limpiar = () => window.clearTimeout(temporizador.current);
  useEffect(() => limpiar, []);
  const despues = useCallback((ms: number, fn: () => void) => {
    limpiar();
    temporizador.current = window.setTimeout(fn, ms);
  }, []);
  return { despues, limpiar };
}

/**
 * A tooltip on one trigger. Use it only for what the screen does not already say (a rule, a
 * definition, a full date); never to repeat a visible label. `enfocable` adds a tab stop for a
 * trigger that is not focusable itself; leave it off for content repeated on every table row.
 */
export function Tip({
  contenido,
  children,
  enfocable = true,
  className,
}: {
  /** Plain text: it is both the bubble and the trigger's accessible description. */
  contenido: string;
  children: ReactNode;
  enfocable?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [ancla, setAncla] = useState<Rect | null>(null);
  const { despues, limpiar } = useApertura();
  const abrir = useCallback(() => {
    if (ref.current) setAncla(rectDe(ref.current));
  }, []);
  const cerrar = useCallback(() => setAncla(null), []);

  useEffect(() => {
    if (!ancla) return;
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    const fuera = (e: globalThis.PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) cerrar();
    };
    const mover = () => cerrar();
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("scroll", mover, true);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("scroll", mover, true);
    };
  }, [ancla, cerrar]);

  return (
    <span
      ref={ref}
      className={`${s.ancla} ${className ?? ""}`}
      tabIndex={enfocable ? 0 : undefined}
      // A plain-text description (ARIA 1.3): no DOM text, so the cell or header around the
      // trigger keeps its own name and text content.
      aria-description={contenido}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") despues(DEMORA_ABRIR, abrir);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") despues(DEMORA_CERRAR, cerrar);
      }}
      onPointerUp={(e) => {
        if (e.pointerType === "touch") (ancla ? cerrar : abrir)();
      }}
      onFocus={() => {
        limpiar();
        abrir();
      }}
      onBlur={() => {
        limpiar();
        cerrar();
      }}
    >
      {children}
      {ancla && (
        <Burbuja
          ancla={ancla}
          onPointerEnter={limpiar}
          onPointerLeave={() => despues(DEMORA_CERRAR, cerrar)}
        >
          <span className={s.texto}>{contenido}</span>
        </Burbuja>
      )}
    </span>
  );
}

/**
 * A chart's readout. The container is one tab stop: arrow keys move between marks, Home/End jump
 * to the ends, Escape hides. A mark shows its readout on hover and on tap. Every mark element
 * passes `marca(i)`; the container spreads `contenedor`; render `burbuja` and `vivo` inside it.
 */
export function useLectura(total: number, lectura: (i: number) => Lectura) {
  // The active mark, where its bubble anchors, and whether the keyboard moved there (announced).
  const [estado, setEstado] = useState<{
    i: number;
    ancla: Rect;
    teclado: boolean;
  } | null>(null);
  const ultimo = useRef<number | null>(null);
  const marcas = useRef<(HTMLElement | SVGElement | null)[]>([]);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const { despues, limpiar } = useApertura();

  const mostrar = useCallback((i: number, teclado: boolean) => {
    const el = marcas.current[i];
    if (!el) return;
    ultimo.current = i;
    setEstado({ i, ancla: rectDe(el), teclado });
  }, []);
  const ocultar = useCallback(() => setEstado(null), []);
  const visible = estado !== null;

  useEffect(() => {
    if (!visible) return;
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") ocultar();
    };
    const fuera = (e: globalThis.PointerEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) ocultar();
    };
    const mover = () => ocultar();
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("scroll", mover, true);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("scroll", mover, true);
    };
  }, [visible, ocultar]);

  const contenedor = {
    ref: contenedorRef,
    tabIndex: total > 0 ? 0 : undefined,
    onKeyDown: (e: KeyboardEvent) => {
      if (total === 0) return;
      const actual = estado?.i ?? ultimo.current ?? total - 1;
      const siguiente =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? Math.min(total - 1, actual + 1)
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? Math.max(0, actual - 1)
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? total - 1
                : null;
      if (siguiente === null) return;
      e.preventDefault();
      mostrar(siguiente, true);
    },
    onFocus: (e: FocusEvent) => {
      if (e.target !== e.currentTarget || total === 0) return;
      mostrar(ultimo.current ?? total - 1, true);
    },
    onBlur: () => ocultar(),
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType !== "touch") despues(DEMORA_CERRAR, ocultar);
    },
  };

  const marca = (i: number) => ({
    ref: (el: HTMLElement | SVGElement | null) => {
      marcas.current[i] = el;
    },
    "data-activo": estado?.i === i ? true : undefined,
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      limpiar();
      mostrar(i, false);
    },
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (estado?.i === i) ocultar();
      else mostrar(i, false);
    },
  });

  const datos = estado && estado.i < total ? lectura(estado.i) : null;
  const burbuja =
    estado && datos ? (
      <Burbuja
        ancla={estado.ancla}
        onPointerEnter={limpiar}
        onPointerLeave={() => despues(DEMORA_CERRAR, ocultar)}
      >
        <CuerpoLectura lectura={datos} />
      </Burbuja>
    ) : null;
  // Arrow-key moves are announced; hover is not (it would talk over the pointer).
  const vivo = (
    <span className="sr-only" aria-live="polite">
      {estado?.teclado && datos ? textoLectura(datos) : ""}
    </span>
  );
  return { activo: estado?.i ?? null, contenedor, marca, burbuja, vivo };
}
