import { useId, type InputHTMLAttributes } from "react";
import s from "./field.module.css";

/** A date input with a visible label, styled like the kit's other fields. */
export function DateField({
  etiqueta,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { etiqueta: string }) {
  const id = useId();
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {etiqueta}
      </label>
      <input id={id} type="date" className={s.control} {...props} />
    </div>
  );
}
