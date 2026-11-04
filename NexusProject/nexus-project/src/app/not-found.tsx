import type { Metadata } from "next";
import { ButtonLink } from "@/shared/ui";
import s from "./not-found.module.css";

export const metadata: Metadata = { title: "Página no encontrada" };

/**
 * Any unknown address, in the product's language and type (screen-audit blocker: the default 404 was
 * English). Title, explanation and action follow one another on the page's single gap.
 */
export default function NotFound() {
  return (
    <main className={s.page}>
      <h1 className={s.title}>Página no encontrada</h1>
      <p className={s.texto}>
        La dirección no corresponde a ninguna pantalla. Verifique la dirección o ingrese desde el
        inicio.
      </p>
      <div>
        <ButtonLink href="/">Ir al inicio</ButtonLink>
      </div>
    </main>
  );
}
