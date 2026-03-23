import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { getSession, isRequestUploaderSession, isVisitorSession } from "@/lib/auth";
import { readEmployeeHeaders } from "@/lib/employees";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (isVisitorSession(session)) {
    return NextResponse.json({ message: "บัญชี visitor ไม่มีสิทธิ์ดาวน์โหลดเทมเพลตพนักงาน" }, { status: 403 });
  }

  if (isRequestUploaderSession(session)) {
    return NextResponse.json({ message: "บัญชีนี้ไม่มีสิทธิ์ดาวน์โหลดเทมเพลตพนักงาน" }, { status: 403 });
  }

  const headers = await readEmployeeHeaders(session.factoryId);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Template");

  worksheet.addRow(headers);
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.getRow(1).font = {
    bold: true,
    color: { argb: "FF12315F" }
  };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF2F6FC" }
  };

  worksheet.columns.forEach((column) => {
    column.width = 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="employee-template-${session.factoryId}.xlsx"`
    }
  });
}
