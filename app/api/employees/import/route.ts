import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { getSession, isRequestUploaderSession, isVisitorSession } from "@/lib/auth";
import { parseCsvContent } from "@/lib/csv";
import { readEmployeeHeaders, readEmployeeRows, writeEmployeeRows } from "@/lib/employees";

function buildRowsFromWorksheet(worksheet: ExcelJS.Worksheet): Record<string, string>[] {
  const headerCells = worksheet.getRow(1).values as Array<string | number | null>;
  const headers = headerCells
    .slice(1)
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const rows: Record<string, string>[] = [];

  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const worksheetRow = worksheet.getRow(rowIndex);
    const row = Object.fromEntries(
      headers.map((header, index) => {
        const cell = worksheetRow.getCell(index + 1);
        const rawValue =
          typeof cell.value === "object" && cell.value && "text" in cell.value
            ? String(cell.value.text ?? "")
            : cell.text || String(cell.value ?? "");
        return [header, rawValue.trim()];
      })
    );

    const hasValue = Object.values(row).some((value) => value.length > 0);
    if (hasValue) {
      rows.push(row);
    }
  }

  return rows;
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (isVisitorSession(session)) {
    return NextResponse.json({ message: "บัญชี visitor ไม่มีสิทธิ์นำเข้าข้อมูลพนักงาน" }, { status: 403 });
  }

  if (isRequestUploaderSession(session)) {
    return NextResponse.json({ message: "บัญชีนี้ไม่มีสิทธิ์นำเข้าข้อมูลพนักงาน" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "ไม่พบไฟล์สำหรับนำเข้า" }, { status: 400 });
  }

  const currentHeaders = await readEmployeeHeaders(session.factoryId);
  const currentRows = await readEmployeeRows(session.factoryId);
  let importedRows: Record<string, string>[] = [];

  if (file.name.toLowerCase().endsWith(".csv")) {
    importedRows = parseCsvContent(await file.text()).rows;
  } else if (file.name.toLowerCase().endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    const xlsxData = Buffer.from(
      await file.arrayBuffer()
    ) as unknown as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(xlsxData);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return NextResponse.json({ message: "ไม่พบ worksheet ในไฟล์" }, { status: 400 });
    }

    importedRows = buildRowsFromWorksheet(worksheet);
  } else {
    return NextResponse.json(
      { message: "รองรับเฉพาะไฟล์ .csv และ .xlsx" },
      { status: 400 }
    );
  }

  if (importedRows.length === 0) {
    return NextResponse.json({ message: "ไม่พบข้อมูลพนักงานในไฟล์" }, { status: 400 });
  }

  const rows = [...currentRows];
  const indexById = new Map(
    rows.map((row, index) => [String(row["รหัสพนักงาน"] ?? "").trim(), index])
  );

  let insertedCount = 0;
  let updatedCount = 0;

  for (const importedRow of importedRows) {
    const employeeId = String(importedRow["รหัสพนักงาน"] ?? "").trim();

    if (!employeeId) {
      continue;
    }

    const importedFields = Object.fromEntries(
      currentHeaders
        .filter((header) => importedRow[header] !== undefined)
        .map((header) => [header, String(importedRow[header] ?? "")])
    );

    const existingIndex = indexById.get(employeeId);

    if (existingIndex === undefined) {
      const nextRow = Object.fromEntries(
        currentHeaders.map((header) => [header, String(importedRow[header] ?? "")])
      );
      rows.push(nextRow);
      indexById.set(employeeId, rows.length - 1);
      insertedCount += 1;
      continue;
    }

    rows[existingIndex] = {
      ...rows[existingIndex],
      ...importedFields
    };
    updatedCount += 1;
  }

  await writeEmployeeRows(session.factoryId, rows, currentHeaders);

  return NextResponse.json({
    message: `นำเข้าสำเร็จ เพิ่ม ${insertedCount} รายการ และอัปเดต ${updatedCount} รายการ`
  });
}
