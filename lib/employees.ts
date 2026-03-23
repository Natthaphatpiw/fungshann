import { EmployeeRecord, FactoryId } from "@/lib/types";
import { chunkArray, fetchAllRows, getSupabaseAdmin } from "@/lib/supabase";

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

const BASE_HEADERS = [
  "ลำดับ",
  "รหัสพนักงาน",
  "ชื่อ",
  "สกุล",
  "แผนก",
  "ตำแหน่ง",
  "เพศ",
  "เชื้อชาติ",
  "สัญชาติ",
  "ศาสนา",
  "อายุ",
  "ที่อยู่",
  "ที่อยู่ 2",
  "ตำบล/แขวง",
  "อำเภอ/เขต",
  "จังหวัด",
  "วันที่จ้าง",
  "การจ้างงาน",
  "ค่าแรงต่อวัน"
] as const;

interface EmployeeSchemaRow {
  columns: unknown;
}

interface EmployeeDbRow {
  employee_id: string;
  order_no: number;
  row_data: Record<string, unknown> | null;
}

function getDefaultHeaders(factoryId: FactoryId): string[] {
  const salaryHeader = factoryId === "factory1" ? "เงินเดือน" : "เงินเดือน 40(1)";
  return [...BASE_HEADERS, salaryHeader, ...EMPLOYEE_SPECIAL_COLUMNS];
}

function normaliseHeaders(headers: string[]): string[] {
  const unique = new Set<string>();
  const ordered: string[] = [];

  for (const header of headers) {
    const trimmed = String(header ?? "").trim();
    if (!trimmed || unique.has(trimmed)) {
      continue;
    }
    unique.add(trimmed);
    ordered.push(trimmed);
  }

  return ordered;
}

async function saveEmployeeHeaders(factoryId: FactoryId, headers: string[]): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const normalised = normaliseHeaders(headers);
  const { error } = await supabase.from("hr_employee_schemas").upsert(
    {
      factory_id: factoryId,
      columns: normalised
    },
    {
      onConflict: "factory_id"
    }
  );

  if (error) {
    throw new Error(`[hr_employee_schemas] ${error.message}`);
  }

  return normalised;
}

export async function readEmployeeHeaders(factoryId: FactoryId): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("hr_employee_schemas")
    .select("columns")
    .eq("factory_id", factoryId)
    .maybeSingle<EmployeeSchemaRow>();

  if (error) {
    throw new Error(`[hr_employee_schemas] ${error.message}`);
  }

  const storedHeaders = Array.isArray(data?.columns)
    ? data!.columns.map((column) => String(column ?? ""))
    : getDefaultHeaders(factoryId);
  const merged = normaliseHeaders([
    ...storedHeaders,
    ...EMPLOYEE_SPECIAL_COLUMNS.filter((column) => !storedHeaders.includes(column))
  ]);

  if (!data || merged.length !== storedHeaders.length) {
    return saveEmployeeHeaders(factoryId, merged);
  }

  return merged;
}

export async function readEmployeeRows(factoryId: FactoryId): Promise<Record<string, string>[]> {
  const headers = await readEmployeeHeaders(factoryId);
  const dbRows = await fetchAllRows<EmployeeDbRow>(
    "hr_employees",
    "employee_id,order_no,row_data",
    (query) =>
      query
        .eq("factory_id", factoryId)
        .order("order_no", { ascending: true })
        .order("employee_id", { ascending: true })
  );

  return dbRows.map((dbRow, index) => {
    const source = dbRow.row_data ?? {};
    const row = Object.fromEntries(headers.map((header) => [header, String(source[header] ?? "")]));
    row["ลำดับ"] = String(index + 1);

    if (!row["รหัสพนักงาน"]) {
      row["รหัสพนักงาน"] = String(dbRow.employee_id ?? "");
    }

    return row;
  });
}

export async function readEmployees(factoryId: FactoryId): Promise<EmployeeRecord[]> {
  const rows = await readEmployeeRows(factoryId);

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

export async function readEmployeeDepartments(factoryId: FactoryId): Promise<string[]> {
  const employees = await readEmployees(factoryId);
  return [...new Set(employees.map((employee) => employee.__department.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, "th")
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
  const supabase = getSupabaseAdmin();
  const finalHeaders = await saveEmployeeHeaders(factoryId, headers ?? (await readEmployeeHeaders(factoryId)));
  const normalisedRows = rows
    .map((row, index) => normaliseEmployeeRow(row, finalHeaders, index))
    .filter((row) => String(row["รหัสพนักงาน"] ?? "").trim().length > 0);

  const existingRows = await fetchAllRows<{ employee_id: string }>(
    "hr_employees",
    "employee_id",
    (query) => query.eq("factory_id", factoryId)
  );
  const existingIds = new Set(existingRows.map((row) => String(row.employee_id ?? "").trim()));

  const nextPayload = normalisedRows.map((row, index) => {
    const employeeId = String(row["รหัสพนักงาน"] ?? "").trim();
    const rowData = Object.fromEntries(finalHeaders.map((header) => [header, String(row[header] ?? "")]));

    return {
      factory_id: factoryId,
      employee_id: employeeId,
      order_no: index + 1,
      first_name: String(row["ชื่อ"] ?? ""),
      last_name: String(row["สกุล"] ?? ""),
      department: String(row["แผนก"] ?? ""),
      position: String(row["ตำแหน่ง"] ?? ""),
      row_data: rowData
    };
  });
  const nextIds = new Set(nextPayload.map((row) => row.employee_id));

  for (const chunk of chunkArray(nextPayload, 500)) {
    const { error } = await supabase.from("hr_employees").upsert(chunk, {
      onConflict: "factory_id,employee_id"
    });

    if (error) {
      throw new Error(`[hr_employees] ${error.message}`);
    }
  }

  const toDelete = [...existingIds].filter((employeeId) => !nextIds.has(employeeId));

  for (const chunk of chunkArray(toDelete, 200)) {
    const { error } = await supabase
      .from("hr_employees")
      .delete()
      .eq("factory_id", factoryId)
      .in("employee_id", chunk);

    if (error) {
      throw new Error(`[hr_employees] ${error.message}`);
    }
  }
}

export function buildEmptyEmployeeRow(headers: string[], nextIndex: number): Record<string, string> {
  return Object.fromEntries(
    headers.map((header) => [header, header === "ลำดับ" ? String(nextIndex) : ""])
  );
}
