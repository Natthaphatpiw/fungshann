import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { readEmployees } from "@/lib/employees";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const employees = await readEmployees(session.factoryId);
  const columns = employees.length
    ? Object.keys(employees[0]).filter((key) => !key.startsWith("__"))
    : [];
  const rows = employees.map((employee) =>
    Object.fromEntries(columns.map((column) => [column, employee[column] || ""]))
  );

  return NextResponse.json({
    columns,
    rows,
    factoryLabel: session.factoryLabel
  });
}
