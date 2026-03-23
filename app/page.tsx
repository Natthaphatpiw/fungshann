import { redirect } from "next/navigation";

import { getSession, isRequestUploaderSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  redirect(isRequestUploaderSession(session) ? "/request-center" : "/dashboard");
}
