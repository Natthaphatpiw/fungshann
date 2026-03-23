import { redirect } from "next/navigation";

import { OtWorkspace } from "@/components/ot-workspace";
import { getSession } from "@/lib/auth";

export default async function OtPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <OtWorkspace session={session} />;
}
