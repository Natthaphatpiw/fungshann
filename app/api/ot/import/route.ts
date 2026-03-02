import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { computeOtRecords, saveOtRecords } from "@/lib/ot";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "ไม่พบไฟล์สำหรับประมวลผล" }, { status: 400 });
  }

  const content = await file.text();
  const records = await computeOtRecords(session.factoryId, content);
  await saveOtRecords(session.factoryId, records);

  return NextResponse.json({
    message: `ประมวลผลสำเร็จ ${records.length} รายการ และบันทึกทับไฟล์ผลลัพธ์ล่าสุดแล้ว`
  });
}
