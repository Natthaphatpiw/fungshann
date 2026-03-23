import { NextResponse } from "next/server";

import { getSession, isRequestUploaderSession, isVisitorSession } from "@/lib/auth";
import { readOtRequestHistory } from "@/lib/ot-request";
import { clampSelection } from "@/lib/periods";
import { FactoryId } from "@/lib/types";

function parseFactoryId(value: string | null): FactoryId | null {
  return value === "factory1" || value === "factory3" ? value : null;
}

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (isVisitorSession(session)) {
    return NextResponse.json({ message: "บัญชี visitor ไม่มีสิทธิ์ดูประวัติคำขอ OT" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedFactoryId = parseFactoryId(searchParams.get("factoryId"));
  const factoryId = isRequestUploaderSession(session) ? requestedFactoryId : session.factoryId;

  if (!factoryId) {
    return NextResponse.json({ message: "กรุณาเลือกโรงงาน" }, { status: 400 });
  }

  const selection = clampSelection({
    period: Number(searchParams.get("period")) === 2 ? 2 : 1,
    month: Number(searchParams.get("month")) || undefined,
    year: Number(searchParams.get("year")) || undefined
  });

  try {
    const history = await readOtRequestHistory(factoryId, selection);
    return NextResponse.json(history);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถโหลดประวัติคำขอ OT ได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}
