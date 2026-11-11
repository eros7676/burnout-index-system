// Display preferences (text size, contrast, background), kept per browser. They are data
// attributes on <html> that redefine the tokens in globals.css, so every screen follows.

export const PREFERENCIAS = {
  texto: [
    { valor: "normal", texto: "Normal" },
    { valor: "grande", texto: "Grande" },
    { valor: "muy-grande", texto: "Muy grande" },
  ],
  contraste: [
    { valor: "normal", texto: "Normal" },
    { valor: "alto", texto: "Alto" },
  ],
  fondo: [
    { valor: "claro", texto: "Claro" },
    { valor: "calido", texto: "Cálido" },
    { valor: "oscuro", texto: "Oscuro" },
  ],
} as const;

export type Preferencia = keyof typeof PREFERENCIAS;
export type Preferencias = {
  [P in Preferencia]: (typeof PREFERENCIAS)[P][number]["valor"];
};

export const POR_DEFECTO: Preferencias = {
  texto: "normal",
  contraste: "normal",
  fondo: "claro",
};
export const CLAVE = "accesibilidad";
const EVENTO = "accesibilidad";

const permitidos = Object.fromEntries(
  Object.entries(PREFERENCIAS).map(([p, opciones]) => [
    p,
    opciones.map((o) => o.valor),
  ]),
) as Record<Preferencia, string[]>;

/**
 * Runs in <head> before the first paint, so a saved preference never flashes the default.
 * Plain ES5 with the allowed values inlined; anything else in storage is ignored, and so is
 * each list's first value (the default, which is the absence of the attribute).
 */
export const SCRIPT_INICIAL = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  CLAVE,
)})||"{}"),a=${JSON.stringify(permitidos)},d=document.documentElement;for(var k in a)if(a[k].indexOf(p[k])>0)d.setAttribute("data-"+k,p[k])}catch(e){}})()`;

/** What <html> shows now; the defaults on the server. */
export function leerPreferencias(): Preferencias {
  if (typeof document === "undefined") return POR_DEFECTO;
  const d = document.documentElement;
  const valor = <P extends Preferencia>(p: P) => {
    const v = d.getAttribute(`data-${p}`);
    return (
      permitidos[p].includes(v ?? "") ? v : POR_DEFECTO[p]
    ) as Preferencias[P];
  };
  return {
    texto: valor("texto"),
    contraste: valor("contraste"),
    fondo: valor("fondo"),
  };
}

/** A stable snapshot for useSyncExternalStore: equal strings for equal preferences. */
export function firmaPreferencias() {
  return JSON.stringify(leerPreferencias());
}
export const FIRMA_POR_DEFECTO = JSON.stringify(POR_DEFECTO);

/** Applies one preference, saves all of them and tells every open control. */
export function cambiarPreferencia<P extends Preferencia>(
  p: P,
  valor: Preferencias[P],
) {
  guardar({ ...leerPreferencias(), [p]: valor });
}

export function restablecerPreferencias() {
  guardar(POR_DEFECTO);
}

function guardar(preferencias: Preferencias) {
  const d = document.documentElement;
  for (const p of Object.keys(preferencias) as Preferencia[]) {
    // The default is the absence of the attribute, as the server renders it.
    if (preferencias[p] === POR_DEFECTO[p]) d.removeAttribute(`data-${p}`);
    else d.setAttribute(`data-${p}`, preferencias[p]);
  }
  try {
    localStorage.setItem(CLAVE, JSON.stringify(preferencias));
  } catch {
    // Storage blocked (private window): the choice still holds until the page reloads.
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** For useSyncExternalStore: changes from this tab and from other tabs. */
export function suscribirPreferencias(aviso: () => void) {
  const otraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE) return;
    let p: Partial<Preferencias> = {};
    try {
      p = JSON.parse(e.newValue ?? "{}");
    } catch {}
    const d = document.documentElement;
    for (const k of Object.keys(permitidos) as Preferencia[]) {
      const v = p[k];
      if (v && v !== POR_DEFECTO[k] && permitidos[k].includes(v))
        d.setAttribute(`data-${k}`, v);
      else d.removeAttribute(`data-${k}`);
    }
    aviso();
  };
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", otraPestana);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", otraPestana);
  };
}
