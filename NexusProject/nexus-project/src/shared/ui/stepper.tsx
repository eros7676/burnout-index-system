import s from "./stepper.module.css";

/**
 * The steps of a flow, with the current one marked (`aria-current="step"`).
 * `actual` past the last step marks every step as done.
 */
export function Stepper({
  pasos,
  actual,
  etiqueta = "Pasos",
}: {
  pasos: readonly string[];
  actual: number;
  etiqueta?: string;
}) {
  return (
    <ol className={s.steps} aria-label={etiqueta} data-enter>
      {pasos.map((texto, i) => {
        const n = i + 1;
        const estado =
          n < actual ? "hecho" : n === actual ? "actual" : "pendiente";
        return (
          <li
            key={texto}
            className={s.step}
            data-estado={estado}
            aria-current={estado === "actual" ? "step" : undefined}
          >
            <span className={s.mark} aria-hidden="true">
              {estado === "hecho" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                n
              )}
            </span>
            <span className={s.label}>
              {texto}
              {estado === "hecho" && <span className="sr-only">, listo</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
