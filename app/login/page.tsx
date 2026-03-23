import { redirect } from "next/navigation";

import { getSession, isRequestUploaderSession } from "@/lib/auth";
import { readEmployeeDepartments } from "@/lib/employees";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect(isRequestUploaderSession(session) ? "/request-center" : "/dashboard");
  }

  const [factory1Departments, factory3Departments] = await Promise.all([
    readEmployeeDepartments("factory1").catch(() => []),
    readEmployeeDepartments("factory3").catch(() => [])
  ]);

  return (
    <LoginForm
      departmentsByFactory={{
        factory1: factory1Departments,
        factory3: factory3Departments
      }}
    />
  );
}
