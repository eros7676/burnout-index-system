import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Icon } from "./icons";
import s from "./field.module.css";

/**
 * A select with a visible label; options carry names, values carry ids. The label
 * points at the control by id instead of wrapping it, so its text is only the name.
 */
export function SelectField({
  etiqueta,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {etiqueta}
      </label>
      <select id={id} className={s.control} {...props}>
        {children}
      </select>
    </div>
  );
}

export function SearchField({
  etiqueta,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  const id = useId();
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {etiqueta}
      </label>
      <span className={s.search}>
        <Icon nombre="buscar" size={16} />
        <input id={id} type="search" className={s.control} {...props} />
      </span>
    </div>
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
