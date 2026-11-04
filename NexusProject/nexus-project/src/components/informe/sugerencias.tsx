import { sugerencia } from "../alertas/aviso";
import s from "./sugerencias.module.css";

/**
 * Suggestions for human review, in ranking order. Each line names its factor before a colon
 * («Horas extra: 16 h extra…»); the name is set in bold so the list scans by factor. Lines from
 * older alerts, written before that form, show as they are.
 */
export function Sugerencias({ lineas }: { lineas: readonly string[] }) {
  return (
    <ul className={s.lista}>
      {lineas.map((linea) => {
        const texto = sugerencia(linea);
        const corte = texto.indexOf(": ");
        return (
          <li key={linea}>
            {corte > 0 ? (
              <>
                <strong className={s.factor}>{texto.slice(0, corte + 1)}</strong>{" "}
                {texto.slice(corte + 2)}
              </>
            ) : (
              texto
            )}
          </li>
        );
      })}
    </ul>
  );
}
