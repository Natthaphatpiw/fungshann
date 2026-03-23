import { redirect } from "next/navigation";

import { SalaryWorkspace } from "@/components/salary-workspace";
import { getSession, isVisitorSession } from "@/lib/auth";

export default async function SalaryPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (isVisitorSession(session)) {
    redirect("/dashboard/ot");
  }

  return <SalaryWorkspace />;
}
