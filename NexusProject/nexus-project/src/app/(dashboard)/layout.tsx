import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";

// The shell reads the pathname, which is URL data: it renders inside Suspense.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
