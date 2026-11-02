import { Button } from "./button";
import s from "./pagination.module.css";

/** Previous/next through a paged list, with "Página n de m" between them. */
export function Pagination({
  pagina,
  paginas,
  onCambio,
  etiqueta = "Paginación",
}: {
  pagina: number;
  paginas: number;
  onCambio: (pagina: number) => void;
  etiqueta?: string;
}) {
  const ultima = Math.max(1, paginas);
  return (
    <nav className={s.pager} aria-label={etiqueta}>
      <Button
        variante="secondary"
        disabled={pagina <= 1}
        onClick={() => onCambio(pagina - 1)}
      >
        Anterior
      </Button>
      <span className={`${s.position} num`} aria-live="polite">
        Página {pagina} de {ultima}
      </span>
      <Button
        variante="secondary"
        disabled={pagina >= ultima}
        onClick={() => onCambio(pagina + 1)}
      >
        Siguiente
      </Button>
    </nav>
  );
}
