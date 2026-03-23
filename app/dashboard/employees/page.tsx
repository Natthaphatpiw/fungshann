import { redirect } from "next/navigation";

import { EmployeeDirectory } from "@/components/employee-directory";
import { getSession, isVisitorSession } from "@/lib/auth";

export default async function EmployeesPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (isVisitorSession(session)) {
    redirect("/dashboard/ot");
  }

  return <EmployeeDirectory />;
}
