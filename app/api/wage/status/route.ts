import { NextResponse } from "next/server";

import { getSession, isRequestUploaderSession, isVisitorSession } from "@/lib/auth";
import { buildPeriodLabel, clampSelection } from "@/lib/periods";
import { ensureEmployeeHasPayrollColumns, getWageStatusForPeriod } from "@/lib/wage";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (isVisitorSession(session)) {
    return NextResponse.json({ message: "บัญชี visitor ไม่มีสิทธิ์เข้าถึงข้อมูลค่าจ้าง" }, { status: 403 });
  }

  if (isRequestUploaderSession(session)) {
    return NextResponse.json({ message: "บัญชีนี้ไม่มีสิทธิ์เข้าถึงข้อมูลค่าจ้าง" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const selection = clampSelection({
    period: Number(searchParams.get("period")) === 2 ? 2 : 1,
    month: Number(searchParams.get("month")) || undefined,
    year: Number(searchParams.get("year")) || undefined
  });

  await ensureEmployeeHasPayrollColumns(session.factoryId);
  const status = await getWageStatusForPeriod(session.factoryId, selection);

  return NextResponse.json({
    ...status,
    selection,
    periodLabel: buildPeriodLabel(selection)
  });
}
