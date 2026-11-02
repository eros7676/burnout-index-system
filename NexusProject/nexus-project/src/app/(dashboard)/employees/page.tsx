import type { Metadata } from "next";
import { Suspense } from "react";
import { ListaPersonas } from "@/components/personas/lista-personas";

export const metadata: Metadata = { title: "Personas" };

// The list reads ?equipo= from the URL, which is only known per request.
export default function Page() {
  return (
    <Suspense>
      <ListaPersonas />
    </Suspense>
  );
}
