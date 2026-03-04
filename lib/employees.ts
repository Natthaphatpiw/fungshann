import { getEmployeeCsvPath, parseCsvFile, readCsvHeaders, writeCsvFile } from "@/lib/csv";
import { EmployeeRecord, FactoryId } from "@/lib/types";

export const EMPLOYEE_SPECIAL_COLUMNS = [
  "ค่าตำแหน่ง",
  "เบี้ยขยัน",
  "ค่ากะ",
  "ค่าโทรศัพท์",
  "ค่าครองชีพ",
  "ค่าพิเศษ",
  "ค่าอื่นๆ",
  "ค่าอื่นๆ(พิเศษ)",
  "คืนเบี้ยขยัน",
  "คืนพักร้อน",
  "โบนัสรายเดือน",
  "มาสาย",
  "ขาดงาน",
  "ลากิจ",
  "หัก กยศ.",
  "สหกรณ์",
  "งานเสีย",
  "หักค่าพิเศษ",
  "หักค่าอื่นๆ"
] as const;

export const EMPLOYEE_IDENTITY_COLUMNS = ["ลำดับ", "รหัสพนักงาน", "ชื่อ", "สกุล"] as const;

export async function readEmployees(factoryId: FactoryId): Promise<EmployeeRecord[]> {
  const rows = await parseCsvFile(getEmployeeCsvPath(factoryId));

  return rows.map((row) => {
    const employeeId = (row["รหัสพนักงาน"] || "").trim();
    const firstName = (row["ชื่อ"] || "").trim();
    const lastName = (row["สกุล"] || "").trim();
    const department = (row["แผนก"] || "").trim();
    const position = (row["ตำแหน่ง"] || "").trim();

    return {
      ...row,
      __id: employeeId,
      __fullName: [firstName, lastName].filter(Boolean).join(" "),
      __department: department,
      __position: position
    };
  });
}

export async function readEmployeeMap(factoryId: FactoryId): Promise<Map<string, EmployeeRecord>> {
  const employees = await readEmployees(factoryId);
  return new Map(employees.map((employee) => [employee.__id, employee]));
}

export async function readEmployeeHeaders(factoryId: FactoryId): Promise<string[]> {
  const headers = await readCsvHeaders(getEmployeeCsvPath(factoryId));
  return [
    ...headers,
    ...EMPLOYEE_SPECIAL_COLUMNS.filter((column) => !headers.includes(column))
  ];
}

export async function readEmployeeRows(factoryId: FactoryId): Promise<Record<string, string>[]> {
  const headers = await readEmployeeHeaders(factoryId);
  const rows = await parseCsvFile(getEmployeeCsvPath(factoryId));

  return rows.map((row) =>
    Object.fromEntries(headers.map((header) => [header, row[header] ?? ""]))
  );
}

export function getEmployeeDataColumns(headers: string[]): string[] {
  return headers.filter((header) => !EMPLOYEE_SPECIAL_COLUMNS.includes(header as never));
}

export function normaliseEmployeeRow(
  row: Record<string, string>,
  headers: string[],
  index: number
): Record<string, string> {
  const normalised = Object.fromEntries(
    headers.map((header) => [header, String(row[header] ?? "").trim()])
  );

  normalised["ลำดับ"] = String(index + 1);

  return normalised;
}

export async function writeEmployeeRows(
  factoryId: FactoryId,
  rows: Array<Record<string, string>>,
  headers?: string[]
): Promise<void> {
  const finalHeaders = headers ?? (await readEmployeeHeaders(factoryId));
  const normalisedRows = rows.map((row, index) => normaliseEmployeeRow(row, finalHeaders, index));

  await writeCsvFile(getEmployeeCsvPath(factoryId), finalHeaders, normalisedRows);
}

export function buildEmptyEmployeeRow(headers: string[], nextIndex: number): Record<string, string> {
  return Object.fromEntries(
    headers.map((header) => [header, header === "ลำดับ" ? String(nextIndex) : ""])
  );
}
