import type { Metadata } from "next";
import { ButtonLink, Empty } from "@/shared/ui";
import s from "./not-found.module.css";

export const metadata: Metadata = { title: "Página no encontrada" };

/** Any unknown address, in the product's language and type (screen-audit blocker: the default 404 was English). */
export default function NotFound() {
  return (
    <main className={s.page}>
      <h1 className={s.title}>Página no encontrada</h1>
      <Empty
        titulo="La dirección no corresponde a ninguna pantalla."
        accion={<ButtonLink href="/">Ir al inicio</ButtonLink>}
      >
        Verifique la dirección o ingrese desde el inicio.
      </Empty>
    </main>
  );
}
