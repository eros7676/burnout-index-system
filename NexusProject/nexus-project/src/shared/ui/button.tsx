import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import s from "./button.module.css";

type Variante = "primary" | "secondary" | "quiet";
const clase = (variante: Variante, extra?: string) =>
  [s.button, s[variante], extra].filter(Boolean).join(" ");

/**
 * One verb per button; the label says what happens ("Validar archivo", not "Enviar").
 * Every button is one control height (`--control-h`). `alinearTexto` offsets a quiet
 * button's padding so its text continues the column it sits in (R36).
 */
export function Button({
  variante = "secondary",
  alinearTexto,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  alinearTexto?: boolean;
}) {
  return (
    <button
      type={type}
      className={clase(variante, className)}
      data-alinear-texto={alinearTexto || undefined}
      {...props}
    />
  );
}

export function ButtonLink({
  variante = "secondary",
  alinearTexto,
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variante?: Variante;
  alinearTexto?: boolean;
}) {
  return (
    <Link
      className={clase(variante, className)}
      data-alinear-texto={alinearTexto || undefined}
      {...props}
    />
  );
}
