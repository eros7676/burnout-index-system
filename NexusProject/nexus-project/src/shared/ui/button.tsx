import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import s from "./button.module.css";

type Variante = "primary" | "secondary" | "quiet";
const clase = (variante: Variante, extra?: string) =>
  [s.button, s[variante], extra].filter(Boolean).join(" ");

/** One verb per button; the label says what happens ("Validar archivo", not "Enviar"). */
export function Button({
  variante = "secondary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button type={type} className={clase(variante, className)} {...props} />;
}

export function ButtonLink({
  variante = "secondary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={clase(variante, className)} {...props} />;
}
