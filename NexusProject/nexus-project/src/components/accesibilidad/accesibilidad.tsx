"use client";
import { useId, useSyncExternalStore } from "react";
import {
  FIRMA_POR_DEFECTO,
  PREFERENCIAS,
  cambiarPreferencia,
  firmaPreferencias,
  restablecerPreferencias,
  suscribirPreferencias,
  type Preferencia,
  type Preferencias,
} from "@/shared/accesibilidad";
import { Button, Icon } from "@/shared/ui";
import s from "./accesibilidad.module.css";

const GRUPOS: { preferencia: Preferencia; titulo: string }[] = [
  { preferencia: "texto", titulo: "Tamaño del texto" },
  { preferencia: "contraste", titulo: "Contraste" },
  { preferencia: "fondo", titulo: "Fondo" },
];

/**
 * The display options: text size, contrast and background, applied at once to the whole app and
 * kept in this browser. A native popover, so Escape and a click outside close it.
 * `lateral` closes the sidebar of the signed-in screens; `pagina` sits on the login page.
 */
export function Accesibilidad({ variante }: { variante: "lateral" | "pagina" }) {
  const id = useId();
  const actuales = JSON.parse(
    useSyncExternalStore(
      suscribirPreferencias,
      firmaPreferencias,
      () => FIRMA_POR_DEFECTO,
    ),
  ) as Preferencias;
  return (
    <div className={s.raiz}>
      <button
        type="button"
        className={s.boton}
        data-variante={variante}
        popoverTarget={id}
      >
        <Icon nombre="accesibilidad" />
        Accesibilidad
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-titulo`}
        className={s.panel}
        data-variante={variante}
        data-lenis-prevent
      >
        <h2 id={`${id}-titulo`}>Accesibilidad</h2>
        <p className={s.nota}>
          Se aplica a toda la aplicación y queda guardado en este navegador.
        </p>
        {GRUPOS.map(({ preferencia, titulo }) => (
          <fieldset key={preferencia} className={s.grupo}>
            <legend>{titulo}</legend>
            <div className={s.opciones}>
              {PREFERENCIAS[preferencia].map((o) => (
                <label key={o.valor} className={s.opcion}>
                  <input
                    type="radio"
                    name={`${id}-${preferencia}`}
                    value={o.valor}
                    checked={actuales[preferencia] === o.valor}
                    onChange={() => cambiarPreferencia(preferencia, o.valor)}
                  />
                  <span>{o.texto}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className={s.acciones}>
          <Button
            variante="quiet"
            alinearTexto
            onClick={restablecerPreferencias}
          >
            Restablecer
          </Button>
          <Button
            variante="primary"
            popoverTarget={id}
            popoverTargetAction="hide"
          >
            Listo
          </Button>
        </div>
      </div>
    </div>
  );
}
