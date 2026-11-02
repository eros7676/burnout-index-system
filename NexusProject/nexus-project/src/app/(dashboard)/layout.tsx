import { AppShell } from "@/components/shell/app-shell";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
