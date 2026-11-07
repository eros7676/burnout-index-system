import type { Metadata } from "next";
import { Suspense } from "react";
import { Ingreso } from "@/components/ingreso/ingreso";

export const metadata: Metadata = { title: "Ingreso" };

// `?empresa=` preselects a company (switching from a profile that company lacks); it is
// request data under Cache Components, so it is read inside a Suspense boundary.
export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Suspense>
      {searchParams.then(({ empresa }) => (
        <Ingreso empresa={typeof empresa === "string" ? empresa : undefined} />
      ))}
    </Suspense>
  );
}
