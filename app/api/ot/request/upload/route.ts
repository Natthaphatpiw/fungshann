import { NextResponse } from "next/server";

import { getSession, isRequestUploaderSession, isVisitorSession } from "@/lib/auth";
import { processOtRequestUpload, MAX_OT_REQUEST_FILES } from "@/lib/ot-request";
import { clampSelection } from "@/lib/periods";
import { FactoryId } from "@/lib/types";

function parseFactoryId(value: FormDataEntryValue | null): FactoryId | null {
  const factoryId = String(value ?? "").trim();
  return factoryId === "factory1" || factoryId === "factory3" ? factoryId : null;
}

function normalizeUploadErrorMessage(rawMessage: string): string {
  if (
    /hr_ot_request_batches|hr_ot_request_entries|hr_ot_request_logs|Could not find the table|relation .*does not exist/i.test(
      rawMessage
    )
  ) {
    return (
      "ยังไม่พบตารางระบบใบคำขอ OT ในฐานข้อมูล " +
      "กรุณารัน SQL migration จากไฟล์ supabase/ot-request-migration.sql บนโปรเจกต์ Supabase ปัจจุบันก่อน"
    );
  }

  return rawMessage;
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (isVisitorSession(session)) {
    return NextResponse.json({ message: "บัญชี visitor ไม่มีสิทธิ์อัปโหลดใบคำขอ OT" }, { status: 403 });
  }

  const formData = await request.formData();
  const requestedFactoryId = parseFactoryId(formData.get("factoryId"));
  const factoryId = isRequestUploaderSession(session) ? requestedFactoryId : session.factoryId;

  if (!factoryId) {
    return NextResponse.json({ message: "กรุณาเลือกโรงงานก่อนอัปโหลดใบคำขอ OT" }, { status: 400 });
  }

  const files = [...formData.getAll("files"), ...formData.getAll("files[]")].filter(
    (item): item is File => item instanceof File
  );

  if (files.length === 0) {
    return NextResponse.json({ message: "ไม่พบไฟล์รูปใบคำขอโอที" }, { status: 400 });
  }

  if (files.length > MAX_OT_REQUEST_FILES) {
    return NextResponse.json(
      { message: `อัปโหลดได้สูงสุด ${MAX_OT_REQUEST_FILES} รูปต่อครั้ง` },
      { status: 400 }
    );
  }

  const selection = clampSelection({
    period: Number(formData.get("period")) === 2 ? 2 : 1,
    month: Number(formData.get("month")) || undefined,
    year: Number(formData.get("year")) || undefined
  });

  try {
    const result = await processOtRequestUpload({
      factoryId,
      username: session.username,
      selection,
      files
    });

    const message =
      result.processedFileCount === 0 && result.duplicateFileCount > 0
        ? `ไฟล์ที่อัปโหลดซ้ำทั้งหมด ระบบจึงข้ามการประมวลผล ${result.duplicateFileCount} รูป`
        : `อัปโหลดใบขอ OT สำเร็จ ${result.processedFileCount} รูป ` +
          `สกัดข้อมูล ${result.extractedEntryCount} รายการ ` +
          `จับคู่พนักงานได้ ${result.matchedEntryCount} รายการ ` +
          `และบันทึกประวัติ ${result.loggedRequestCount} รายการ` +
          (result.duplicateFileCount > 0 ? ` | ข้ามไฟล์ซ้ำ ${result.duplicateFileCount} รูป` : "");

    return NextResponse.json({
      message,
      ...result
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? normalizeUploadErrorMessage(error.message)
        : "ไม่สามารถประมวลผลใบขอ OT ได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}
