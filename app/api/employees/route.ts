import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  EMPLOYEE_SPECIAL_COLUMNS,
  getEmployeeDataColumns,
  readEmployeeHeaders,
  readEmployeeRows,
  writeEmployeeRows
} from "@/lib/employees";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const columns = await readEmployeeHeaders(session.factoryId);
  const rows = await readEmployeeRows(session.factoryId);
  const specialColumns = EMPLOYEE_SPECIAL_COLUMNS.filter((column) => columns.includes(column));
  const dataColumns = getEmployeeDataColumns(columns);

  return NextResponse.json({
    columns,
    dataColumns,
    specialColumns,
    rows,
    factoryLabel: session.factoryLabel
  });
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { row?: Record<string, string> }
    | null;

  const row = body?.row;
  const employeeId = String(row?.["รหัสพนักงาน"] ?? "").trim();

  if (!employeeId) {
    return NextResponse.json({ message: "กรุณาระบุรหัสพนักงาน" }, { status: 400 });
  }

  const headers = await readEmployeeHeaders(session.factoryId);
  const rows = await readEmployeeRows(session.factoryId);

  if (rows.some((item) => String(item["รหัสพนักงาน"] ?? "").trim() === employeeId)) {
    return NextResponse.json({ message: "มีรหัสพนักงานนี้อยู่แล้ว" }, { status: 409 });
  }

  rows.push(
    Object.fromEntries(headers.map((header) => [header, String(row?.[header] ?? "")]))
  );
  await writeEmployeeRows(session.factoryId, rows, headers);

  return NextResponse.json({ message: "เพิ่มพนักงานเรียบร้อย" });
}

export async function PUT(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { employeeId?: string; row?: Record<string, string> }
    | null;

  const employeeId = String(body?.employeeId ?? "").trim();
  const nextRow = body?.row;

  if (!employeeId || !nextRow) {
    return NextResponse.json({ message: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  const headers = await readEmployeeHeaders(session.factoryId);
  const rows = await readEmployeeRows(session.factoryId);
  const index = rows.findIndex(
    (item) => String(item["รหัสพนักงาน"] ?? "").trim() === employeeId
  );

  if (index < 0) {
    return NextResponse.json({ message: "ไม่พบพนักงานที่ต้องการแก้ไข" }, { status: 404 });
  }

  const updatedId = String(nextRow["รหัสพนักงาน"] ?? "").trim();

  if (!updatedId) {
    return NextResponse.json({ message: "กรุณาระบุรหัสพนักงาน" }, { status: 400 });
  }

  const duplicate = rows.some(
    (item, rowIndex) =>
      rowIndex !== index && String(item["รหัสพนักงาน"] ?? "").trim() === updatedId
  );

  if (duplicate) {
    return NextResponse.json({ message: "รหัสพนักงานซ้ำกับข้อมูลที่มีอยู่" }, { status: 409 });
  }

  rows[index] = Object.fromEntries(headers.map((header) => [header, String(nextRow[header] ?? "")]));
  await writeEmployeeRows(session.factoryId, rows, headers);

  return NextResponse.json({ message: "บันทึกการแก้ไขเรียบร้อย" });
}

export async function DELETE(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const employeeId = String(searchParams.get("employeeId") ?? "").trim();

  if (!employeeId) {
    return NextResponse.json({ message: "ไม่พบรหัสพนักงานที่ต้องการลบ" }, { status: 400 });
  }

  const headers = await readEmployeeHeaders(session.factoryId);
  const rows = await readEmployeeRows(session.factoryId);
  const filteredRows = rows.filter(
    (item) => String(item["รหัสพนักงาน"] ?? "").trim() !== employeeId
  );

  if (filteredRows.length === rows.length) {
    return NextResponse.json({ message: "ไม่พบพนักงานที่ต้องการลบ" }, { status: 404 });
  }

  await writeEmployeeRows(session.factoryId, filteredRows, headers);

  return NextResponse.json({ message: "ลบพนักงานเรียบร้อย" });
}
