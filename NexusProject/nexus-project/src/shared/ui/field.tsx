import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Icon } from "./icons";
import s from "./field.module.css";

/** A select with a visible label; options carry names, values carry ids. */
export function SelectField({
  etiqueta,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span className={s.label}>{etiqueta}</span>
      <select className={s.control} {...props}>
        {children}
      </select>
    </label>
  );
}

export function SearchField({
  etiqueta,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  return (
    <label className={s.field}>
      <span className={s.label}>{etiqueta}</span>
      <span className={s.search}>
        <Icon nombre="buscar" size={16} />
        <input type="search" className={s.control} {...props} />
      </span>
    </label>
  );
}

/** A row of filters above a list, inside its Section. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className={s.toolbar}>{children}</div>;
}

/**
 * The page's filters, week included, together in one left-aligned bar between the
 * header and the content (R14). Controls share the control line (R11).
 */
export function FilterBar({
  children,
  etiqueta = "Filtros",
}: {
  children: ReactNode;
  etiqueta?: string;
}) {
  return (
    <div className={s.filterBar} role="group" aria-label={etiqueta} data-enter>
      {children}
    </div>
  );
}
