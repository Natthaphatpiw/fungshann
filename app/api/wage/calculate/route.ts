import { NextResponse } from "next/server";

import { getSession, isRequestUploaderSession, isVisitorSession } from "@/lib/auth";
import { buildPeriodLabel, clampSelection } from "@/lib/periods";
import { calculateWageForPeriod, ensureEmployeeHasPayrollColumns } from "@/lib/wage";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (isVisitorSession(session)) {
    return NextResponse.json({ message: "บัญชี visitor ไม่มีสิทธิ์คำนวณค่าจ้าง" }, { status: 403 });
  }

  if (isRequestUploaderSession(session)) {
    return NextResponse.json({ message: "บัญชีนี้ไม่มีสิทธิ์คำนวณค่าจ้าง" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        period?: number;
        month?: number;
        year?: number;
      }
    | null;

  const selection = clampSelection({
    period: body?.period === 2 ? 2 : 1,
    month: body?.month,
    year: body?.year
  });

  await ensureEmployeeHasPayrollColumns(session.factoryId);

  try {
    const result = await calculateWageForPeriod(session.factoryId, selection);

    return NextResponse.json({
      ...result,
      selection,
      periodLabel: buildPeriodLabel(selection)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถคำนวณค่าจ้างได้";
    const status =
      message.includes("ไม่พบข้อมูล OT") || message.includes("ยังไม่ครบ") ? 409 : 500;

    return NextResponse.json({ message }, { status });
  }
}
