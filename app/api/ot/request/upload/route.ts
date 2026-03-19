import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { processOtRequestUpload, MAX_OT_REQUEST_FILES } from "@/lib/ot-request";
import { clampSelection } from "@/lib/periods";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
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
      factoryId: session.factoryId,
      username: session.username,
      selection,
      files
    });

    return NextResponse.json({
      message:
        `อัปโหลดใบขอ OT สำเร็จ ${result.processedFileCount} รูป ` +
        `สกัดข้อมูล ${result.extractedEntryCount} รายการ ` +
        `จับคู่พนักงานได้ ${result.matchedEntryCount} รายการ`,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถประมวลผลใบขอ OT ได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}

