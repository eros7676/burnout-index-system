import type { InputHTMLAttributes } from "react";
import s from "./field.module.css";

/** A date input with a visible label, styled like the kit's other fields. */
export function DateField({
  etiqueta,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { etiqueta: string }) {
  return (
    <label className={s.field}>
      <span className={s.label}>{etiqueta}</span>
      <input type="date" className={s.control} {...props} />
    </label>
  );
}
