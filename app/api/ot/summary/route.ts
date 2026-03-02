import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { buildOtSummary } from "@/lib/ot";
import { clampSelection } from "@/lib/periods";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const selection = clampSelection({
    period: Number(searchParams.get("period")) === 2 ? 2 : 1,
    month: Number(searchParams.get("month")) || undefined,
    year: Number(searchParams.get("year")) || undefined
  });

  const summary = await buildOtSummary(session.factoryId, selection);
  return NextResponse.json(summary);
}
