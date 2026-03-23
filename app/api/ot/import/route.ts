import { NextResponse } from "next/server";

import { getSession, isRequestUploaderSession, isVisitorSession } from "@/lib/auth";
import {
  appendScansToStorage,
  computeOtRecordsFromScans,
  loadStoredScans,
  parseBiometricLog,
  saveOtRecords
} from "@/lib/ot";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (isVisitorSession(session)) {
    return NextResponse.json({ message: "บัญชี visitor ไม่มีสิทธิ์นำเข้าข้อมูลสแกนหน้า" }, { status: 403 });
  }

  if (isRequestUploaderSession(session)) {
    return NextResponse.json({ message: "บัญชีนี้ไม่มีสิทธิ์นำเข้าข้อมูลสแกนหน้า" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "ไม่พบไฟล์สำหรับประมวลผล" }, { status: 400 });
  }

  const content = await file.text();
  const parsedScans = parseBiometricLog(content);

  if (parsedScans.length === 0) {
    return NextResponse.json(
      { message: "ไม่พบข้อมูลสแกนหน้าที่ถูกต้องในไฟล์" },
      { status: 400 }
    );
  }

  const scanResult = await appendScansToStorage(session.factoryId, parsedScans);
  const accumulatedScans = await loadStoredScans(session.factoryId);
  const records = await computeOtRecordsFromScans(session.factoryId, accumulatedScans);
  await saveOtRecords(session.factoryId, records);

  return NextResponse.json({
    message:
      `นำเข้าไฟล์สำเร็จ เพิ่มข้อมูลสแกนใหม่ ${scanResult.addedCount} รายการ ` +
      `(ข้ามข้อมูลซ้ำ ${scanResult.duplicateCount} รายการ) ` +
      `และคำนวณวันทำงาน/OT จากข้อมูลสะสมแล้ว ${records.length} รายการ`
  });
}
