"use client";
// Form fields for dedicated create/edit pages (DESIGN.md › Forms; research visual-system R41–R44).
// Labels above, one column, required by default and «(opcional)» marked; help and errors below the control.
import {
  useId,
  type FormHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Icon } from "./icons";
import s from "./field.module.css";

type Campo = {
  etiqueta: string;
  /** One line under the control; replaced by the error when there is one. */
  ayuda?: string;
  error?: string;
  opcional?: boolean;
  /** Field width matched to its content (R41): "corto" for codes, dates and numbers. */
  ancho?: "corto" | "completo";
};

function Envoltorio({
  id,
  etiqueta,
  ayuda,
  error,
  opcional,
  ancho = "completo",
  children,
}: Campo & { id: string; children: ReactNode }) {
  return (
    <div className={s.field} data-ancho={ancho}>
      <label className={s.label} htmlFor={id}>
        {etiqueta}
        {opcional && <span className={s.optional}> (opcional)</span>}
      </label>
      {children}
      {error ? (
        <p className={s.error} id={`${id}-nota`}>
          <Icon nombre="error" />
          {error}
        </p>
      ) : (
        ayuda && (
          <p className={s.help} id={`${id}-nota`}>
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}

const accesible = (id: string, campo: Campo) => ({
  id,
  "aria-invalid": campo.error ? true : undefined,
  "aria-describedby": campo.error || campo.ayuda ? `${id}-nota` : undefined,
});

export function TextField({
  etiqueta,
  ayuda,
  error,
  opcional,
  ancho,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & Campo) {
  const id = useId();
  const campo = { etiqueta, ayuda, error, opcional, ancho };
  return (
    <Envoltorio id={id} {...campo}>
      <input
        className={s.control}
        required={!opcional}
        {...accesible(id, campo)}
        {...props}
      />
    </Envoltorio>
  );
}

export function TextAreaField({
  etiqueta,
  ayuda,
  error,
  opcional,
  ancho,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & Campo) {
  const id = useId();
  const campo = { etiqueta, ayuda, error, opcional, ancho };
  return (
    <Envoltorio id={id} {...campo}>
      <textarea
        className={`${s.control} ${s.textarea}`}
        required={!opcional}
        rows={3}
        {...accesible(id, campo)}
        {...props}
      />
    </Envoltorio>
  );
}

/** A select inside a form; filters keep using SelectField. */
export function SelectFormField({
  etiqueta,
  ayuda,
  error,
  opcional,
  ancho,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & Campo & { children: ReactNode }) {
  const id = useId();
  const campo = { etiqueta, ayuda, error, opcional, ancho };
  return (
    <Envoltorio id={id} {...campo}>
      <select
        className={s.control}
        required={!opcional}
        {...accesible(id, campo)}
        {...props}
      >
        {children}
      </select>
    </Envoltorio>
  );
}

export function CheckboxField({
  etiqueta,
  ayuda,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  etiqueta: string;
  ayuda?: string;
}) {
  const id = useId();
  return (
    <div className={s.check}>
      <input
        type="checkbox"
        id={id}
        aria-describedby={ayuda ? `${id}-nota` : undefined}
        {...props}
      />
      <label htmlFor={id}>{etiqueta}</label>
      {ayuda && (
        <p className={s.help} id={`${id}-nota`}>
          {ayuda}
        </p>
      )}
    </div>
  );
}

/** One column of fields with the page's spacing; groups go in FormGroup. */
export function Form({
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  return (
    <form className={s.form} noValidate {...props}>
      {children}
    </form>
  );
}

/** Related fields under one heading; `fila` puts short related fields on one row (Desde–Hasta). */
export function FormGroup({
  titulo,
  descripcion,
  fila,
  children,
}: {
  titulo?: string;
  descripcion?: string;
  fila?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className={s.group}>
      {titulo && <legend className={s.legend}>{titulo}</legend>}
      {descripcion && <p className={s.help}>{descripcion}</p>}
      <div className={fila ? s.row : s.stack}>{children}</div>
    </fieldset>
  );
}

/** Buttons at the bottom left, primary first (R43). */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className={s.formActions}>{children}</div>;
}

/** Key facts of a record: equal-width term/value pairs (R38, R46). */
export function KeyFacts({
  items,
}: {
  items: { termino: string; valor: ReactNode }[];
}) {
  return (
    <dl className={s.facts}>
      {items.map((item) => (
        <div key={item.termino} className={s.fact}>
          <dt>{item.termino}</dt>
          <dd>{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
