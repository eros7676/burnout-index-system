import Link from "next/link";
import { useId, type HTMLAttributes, type ReactNode } from "react";
import { Icon } from "./icons";
import s from "./layout.module.css";

/** Title, one line of scope, the page's actions. Every screen opens with it. */
export function PageHeader({
  titulo,
  contexto,
  acciones,
  volver,
}: {
  titulo: ReactNode;
  contexto?: ReactNode;
  acciones?: ReactNode;
  volver?: { href: string; texto: string };
}) {
  return (
    <header className={s.header} data-enter>
      {volver && (
        <Link className={s.back} href={volver.href}>
          <Icon nombre="volver" size={16} />
          {volver.texto}
        </Link>
      )}
      <div className={s.titleRow}>
        <div>
          <h1 className={s.title}>{titulo}</h1>
          {contexto && <p className={s.context}>{contexto}</p>}
        </div>
        {acciones && <div className={s.actions}>{acciones}</div>}
      </div>
    </header>
  );
}

/** A titled block of a page; it enters as one piece of the cascade. */
export function Section({
  titulo,
  aside,
  children,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  titulo?: ReactNode;
  aside?: ReactNode;
}) {
  const id = useId();
  return (
    <section
      className={[s.section, className].filter(Boolean).join(" ")}
      aria-labelledby={titulo ? id : undefined}
      data-enter
      {...rest}
    >
      {(titulo || aside) && (
        <div className={s.sectionHead}>
          {titulo && <h2 id={id}>{titulo}</h2>}
          {aside && <div className={s.aside}>{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A labelled figure: the number first, its meaning beneath. */
export function Figure({
  valor,
  etiqueta,
  detalle,
  tono,
}: {
  valor: ReactNode;
  etiqueta: ReactNode;
  detalle?: ReactNode;
  tono?: "alto" | "neutro";
}) {
  return (
    <div className={s.figure} data-tono={tono}>
      <span className={s.figureLabel}>{etiqueta}</span>
      <strong className={`${s.figureValue} num`}>{valor}</strong>
      {detalle && <span className={s.figureDetail}>{detalle}</span>}
    </div>
  );
}
