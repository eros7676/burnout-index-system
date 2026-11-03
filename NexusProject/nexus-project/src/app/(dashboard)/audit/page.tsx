import type { Metadata } from "next";
import { Suspense } from "react";
import { Auditoria } from "@/components/auditoria/auditoria";

export const metadata: Metadata = { title: "Auditoría" };

// The list reads its filters from the URL, which is only known per request.
export default function Page() {
  return (
    <Suspense>
      <Auditoria />
    </Suspense>
  );
}
