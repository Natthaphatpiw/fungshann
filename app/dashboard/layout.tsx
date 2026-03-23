import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { getSession, isRequestUploaderSession } from "@/lib/auth";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (isRequestUploaderSession(session)) {
    redirect("/request-center");
  }

  return <DashboardShell session={session}>{children}</DashboardShell>;
}
