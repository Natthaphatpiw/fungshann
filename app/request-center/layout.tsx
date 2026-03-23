import { redirect } from "next/navigation";

import { RequestCenterShell } from "@/components/request-center-shell";
import { getSession, isRequestUploaderSession } from "@/lib/auth";

export default async function RequestCenterLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!isRequestUploaderSession(session)) {
    redirect("/dashboard");
  }

  return <RequestCenterShell session={session}>{children}</RequestCenterShell>;
}
