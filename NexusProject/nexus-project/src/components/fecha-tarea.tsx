import { Tip } from "@/shared/ui";
import { diaCompleto } from "@/shared/formato";
import { fechaTarea } from "./tareas/textos";

/** A task date as the table shows it; a day without its year carries the full date in a tooltip. */
export function FechaTarea({
  fecha,
  referencia,
}: {
  fecha: string | null;
  referencia: string;
}) {
  const texto = fechaTarea(fecha, referencia);
  if (!fecha || /\d{4}$/.test(texto)) return <>{texto}</>;
  return (
    <Tip contenido={diaCompleto(fecha.slice(0, 10))} enfocable={false}>
      {texto}
    </Tip>
  );
}
