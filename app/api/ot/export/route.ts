import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

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

  const header = [
    "รหัสพนักงาน",
    "ชื่อพนักงาน",
    "แผนก",
    "ตำแหน่ง",
    "จำนวนวันที่ทำงาน",
    "OT 1.5 หลังเลิกงาน",
    "OT 2 หลังเลิกงาน",
    "OT 3 หลังเลิกงาน",
    "OT1-หลังทำเรื่องขอโอที",
    "OT2-หลังทำเรื่องขอโอที",
    "OT3-request",
    "มูลค่า OT หลังเลิกงาน",
    "OT 1.5 หลัง (x1.5)",
    "OT 2 หลัง (x2)",
    "OT 3 หลัง (x3)",
    ...summary.days.map((day) => `${day.dayNumber} ${day.weekdayShort}`)
  ];

  const rows = summary.rows.map((row) => [
    row.employeeId,
    row.employeeName,
    row.department,
    row.position,
    row.workDays,
    row.ot1,
    row.ot2,
    row.ot3,
    row.ot1AfterRequest,
    row.ot2AfterRequest,
    row.ot3AfterRequest,
    row.otPay,
    row.otPay1x5,
    row.otPay2x,
    row.otPay3x,
    ...summary.days.map((day) => row.dayTotals[day.key] || 0)
  ]);
  const totalRow = [
    "TOTAL",
    "",
    "",
    "",
    summary.totals.workDays,
    summary.totals.ot1,
    summary.totals.ot2,
    summary.totals.ot3,
    summary.totals.ot1AfterRequest,
    summary.totals.ot2AfterRequest,
    summary.totals.ot3AfterRequest,
    summary.totals.otPay,
    summary.totals.otPay1x5,
    summary.totals.otPay2x,
    summary.totals.otPay3x,
    ...summary.days.map((day) =>
      summary.rows.reduce(
        (total, row) => Number((total + (row.dayTotals[day.key] || 0)).toFixed(2)),
        0
      )
    )
  ];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("OT");

  worksheet.addRow(header);
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.addRow(totalRow);
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

  worksheet.columns.forEach((column, index) => {
    if (index <= 3) {
      column.width = 22;
      return;
    }

    column.width = index <= 10 ? 16 : 12;
  });

  const totalExcelRow = worksheet.rowCount;
  worksheet.getRow(totalExcelRow).font = {
    bold: true,
    color: { argb: "FF12315F" }
  };
  worksheet.getRow(totalExcelRow).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF7FAFF" }
  };

  const buffer = await workbook.xlsx.writeBuffer();

  const filename = `ot-${session.factoryId}-${selection.year}-${String(selection.month).padStart(2, "0")}-p${selection.period}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
