import {
  readEmployeeHeaders,
  readEmployeeRows,
  readEmployees,
  writeEmployeeRows
} from "@/lib/employees";
import { loadOtRecords } from "@/lib/ot";
import { getPeriodRange, toIsoDate } from "@/lib/periods";
import { chunkArray, fetchAllRows, getSupabaseAdmin } from "@/lib/supabase";
import { FactoryId, PeriodSelection } from "@/lib/types";

const WAGE_REQUIRED_HEADERS = [
  "โรงงาน",
  "งวดรอบ",
  "งวดเดือน",
  "งวดปี",
  "งวดวันที่เริ่ม",
  "งวดวันที่สิ้นสุด",
  "งวดวันที่จ่าย",
  "ลำดับ",
  "รหัสพนักงาน",
  "ชื่อ",
  "สกุล",
  "แผนก",
  "ตำแหน่ง",
  "การจ้างงาน",
  "ค่าแรงต่อวัน",
  "เงินเดือน",
  "จำนวนวันที่ทำงาน",
  "จำนวนวันขาดงาน(ไม่รวมอาทิตย์)",
  "จำนวนนาทีมาสาย",
  "จำนวนวันเข้ากะดึก",
  "ค่าจ้าง",
  "ค่าโอทีOT1",
  "ค่าโอทีOT2",
  "ค่าโอทีOT3",
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
  "หักค่าอื่นๆ",
  "ค่าจ้างสุทธิ"
] as const;

const INCOME_COLUMNS = [
  "ค่าจ้าง",
  "ค่าโอทีOT1",
  "ค่าโอทีOT2",
  "ค่าโอทีOT3",
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
  "โบนัสรายเดือน"
] as const;

const DEDUCTION_COLUMNS = [
  "มาสาย",
  "ขาดงาน",
  "ลากิจ",
  "หัก กยศ.",
  "สหกรณ์",
  "งานเสีย",
  "หักค่าพิเศษ",
  "หักค่าอื่นๆ"
] as const;

const MANUAL_SPECIAL_COLUMNS = [
  "ค่าตำแหน่ง",
  "ค่าโทรศัพท์",
  "ค่าครองชีพ",
  "ค่าพิเศษ",
  "ค่าอื่นๆ",
  "ค่าอื่นๆ(พิเศษ)",
  "คืนเบี้ยขยัน",
  "คืนพักร้อน",
  "โบนัสรายเดือน",
  "ขาดงาน",
  "ลากิจ",
  "หัก กยศ.",
  "สหกรณ์",
  "งานเสีย",
  "หักค่าพิเศษ",
  "หักค่าอื่นๆ"
] as const;

type WageCsvRow = Record<string, string>;

interface WageDbRow {
  pay_date: string;
  seq_no: number;
  row_data: Record<string, unknown> | null;
}

function parseFlexibleNumber(value: string): number {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return 0;
  }

  const cleaned = trimmed.replace(/[^\d,.-]/g, "");
  if (!cleaned) {
    return 0;
  }

  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);

  if (separatorIndex < 0) {
    const parsed = Number(unsigned.replace(/[.,]/g, ""));
    return Number.isFinite(parsed) ? (negative ? parsed * -1 : parsed) : 0;
  }

  const integerPart = unsigned.slice(0, separatorIndex).replace(/[.,]/g, "");
  const decimalPart = unsigned.slice(separatorIndex + 1).replace(/[.,]/g, "");
  const parsed = Number(`${integerPart || "0"}.${decimalPart || "0"}`);

  return Number.isFinite(parsed) ? (negative ? parsed * -1 : parsed) : 0;
}

function formatMoney(value: number): string {
  return Number(value || 0).toFixed(2);
}

function formatInteger(value: number): string {
  return String(Math.max(0, Math.trunc(value)));
}

function getFactoryLabel(factoryId: FactoryId): string {
  return factoryId === "factory1" ? "โรงงาน 1" : "โรงงาน 3";
}

function getPayDateKey(selection: PeriodSelection): string {
  const { end } = getPeriodRange(selection);
  return toIsoDate(end);
}

function addDays(date: Date, deltaDays: number): Date {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + deltaDays);
  return clone;
}

function enumerateDays(start: Date, end: Date): Date[] {
  const cursor = new Date(start);
  const list: Date[] = [];

  while (cursor <= end) {
    list.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return list;
}

function buildScheduledStart(date: Date, shiftCode: string): Date {
  const scheduled = new Date(date);
  scheduled.setSeconds(0, 0);

  switch (shiftCode) {
    case "office":
      scheduled.setHours(7, 45, 0, 0);
      return scheduled;
    case "transport10":
      scheduled.setHours(10, 0, 0, 0);
      return scheduled;
    case "transport12":
      scheduled.setHours(12, 0, 0, 0);
      return scheduled;
    case "night":
      scheduled.setHours(20, 0, 0, 0);
      return scheduled;
    default:
      scheduled.setHours(8, 0, 0, 0);
      return scheduled;
  }
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function normaliseWageRow(headers: string[], rowData: Record<string, unknown>): WageCsvRow {
  return Object.fromEntries(headers.map((header) => [header, String(rowData[header] ?? "")]));
}

export async function ensureWageHeaders(): Promise<string[]> {
  return [...WAGE_REQUIRED_HEADERS];
}

export async function readWageRows(): Promise<{ headers: string[]; rows: WageCsvRow[] }> {
  const headers = await ensureWageHeaders();
  const dbRows = await fetchAllRows<WageDbRow>(
    "hr_wages",
    "pay_date,seq_no,row_data",
    (query) =>
      query
        .order("pay_date", { ascending: true })
        .order("seq_no", { ascending: true })
  );

  return {
    headers,
    rows: dbRows.map((row) => normaliseWageRow(headers, row.row_data ?? {}))
  };
}

export async function checkOtCompletenessForPeriod(
  factoryId: FactoryId,
  selection: PeriodSelection
): Promise<{
  ready: boolean;
  message: string;
  requiredWindow: { start: string; end: string };
  missingBoundaryDates: string[];
}> {
  const records = await loadOtRecords(factoryId);
  const { start, end } = getPeriodRange(selection);
  const periodStart = toIsoDate(start);
  const periodEnd = toIsoDate(end);
  const checkStart = addDays(start, -1);
  const checkEnd = addDays(end, 1);
  const requiredStart = toIsoDate(checkStart);
  const requiredEnd = toIsoDate(checkEnd);

  if (records.length === 0) {
    return {
      ready: false,
      message: "ไม่พบข้อมูล OT ในระบบ",
      requiredWindow: { start: requiredStart, end: requiredEnd },
      missingBoundaryDates: [requiredStart, requiredEnd]
    };
  }

  const daySet = new Set(records.map((record) => record.workDate));
  const hasAnyInPeriod = records.some(
    (record) => record.workDate >= periodStart && record.workDate <= periodEnd
  );

  const missingBoundaryDates = [requiredStart, requiredEnd].filter((dateKey) => !daySet.has(dateKey));
  const ready = hasAnyInPeriod && missingBoundaryDates.length === 0;

  if (ready) {
    return {
      ready: true,
      message: "ข้อมูล OT อยู่ในช่วงที่พร้อมคำนวณค่าจ้างแล้ว",
      requiredWindow: { start: requiredStart, end: requiredEnd },
      missingBoundaryDates: []
    };
  }

  if (!hasAnyInPeriod) {
    return {
      ready: false,
      message: "ไม่พบข้อมูล OT ในงวดที่เลือก",
      requiredWindow: { start: requiredStart, end: requiredEnd },
      missingBoundaryDates
    };
  }

  return {
    ready: false,
    message: `ข้อมูล OT ยังไม่ครบช่วงตรวจสอบ (${requiredStart} ถึง ${requiredEnd})`,
    requiredWindow: { start: requiredStart, end: requiredEnd },
    missingBoundaryDates
  };
}

function isMonthlyEmployee(employmentType: string): boolean {
  const normalized = employmentType.trim().toLowerCase();
  return normalized.includes("รายเดือน") || normalized.includes("monthly");
}

export async function findWageRowsForPeriod(
  factoryId: FactoryId,
  selection: PeriodSelection
): Promise<{ headers: string[]; rows: WageCsvRow[]; payDate: string }> {
  const headers = await ensureWageHeaders();
  const payDate = getPayDateKey(selection);
  const employees = await readEmployees(factoryId);
  const monthlyEmployeeIds = new Set(
    employees
      .filter((employee) => isMonthlyEmployee(String(employee["การจ้างงาน"] ?? "")))
      .map((employee) => employee.__id)
  );
  const { start, end } = getPeriodRange(selection);
  const periodDayCount = enumerateDays(start, end).length;
  const dbRows = await fetchAllRows<WageDbRow>(
    "hr_wages",
    "pay_date,seq_no,row_data",
    (query) =>
      query
        .eq("factory_id", factoryId)
        .eq("pay_date", payDate)
        .order("seq_no", { ascending: true })
  );

  return {
    headers,
    rows: dbRows.map((row) => {
      const rowData = { ...(row.row_data ?? {}) } as Record<string, unknown>;
      const employeeId = String(rowData["รหัสพนักงาน"] ?? "").trim();
      if (monthlyEmployeeIds.has(employeeId)) {
        rowData["จำนวนวันที่ทำงาน"] = String(periodDayCount);
      }
      return normaliseWageRow(headers, rowData);
    }),
    payDate
  };
}

export async function calculateWageForPeriod(
  factoryId: FactoryId,
  selection: PeriodSelection
): Promise<{
  created: boolean;
  message: string;
  headers: string[];
  rows: WageCsvRow[];
  payDate: string;
}> {
  const otStatus = await checkOtCompletenessForPeriod(factoryId, selection);

  if (!otStatus.ready) {
    throw new Error(otStatus.message);
  }

  const existing = await findWageRowsForPeriod(factoryId, selection);

  if (existing.rows.length > 0) {
    return {
      created: false,
      message: "งวดนี้มีการคำนวณค่าจ้างไว้แล้ว",
      headers: existing.headers,
      rows: existing.rows,
      payDate: existing.payDate
    };
  }

  const headers = await ensureWageHeaders();
  const employees = await readEmployees(factoryId);
  const records = await loadOtRecords(factoryId);
  const { start, end } = getPeriodRange(selection);
  const startKey = toIsoDate(start);
  const endKey = toIsoDate(end);
  const payDate = getPayDateKey(selection);
  const factoryLabel = getFactoryLabel(factoryId);
  const periodStart = toIsoDate(start);
  const periodEnd = toIsoDate(end);
  const periodDays = enumerateDays(start, end);
  const periodDayCount = periodDays.length;

  const periodRecords = records.filter(
    (record) => record.workDate >= startKey && record.workDate <= endKey
  );

  const daySummaryByEmployee = new Map<
    string,
    Map<
      string,
      {
        enteredAt: Date;
        shiftCode: string;
        isSunday: boolean;
      }
    >
  >();
  const otTotalsByEmployee = new Map<string, { ot1: number; ot2: number; ot3: number }>();

  for (const record of periodRecords) {
    const enteredAt = new Date(record.enteredAt);
    if (Number.isNaN(enteredAt.getTime())) {
      continue;
    }

    const employeeDays = daySummaryByEmployee.get(record.employeeId) ?? new Map();
    const currentDay = employeeDays.get(record.workDate);

    if (!currentDay || enteredAt < currentDay.enteredAt) {
      employeeDays.set(record.workDate, {
        enteredAt,
        shiftCode: record.shiftCode,
        isSunday: record.isSunday
      });
    }
    daySummaryByEmployee.set(record.employeeId, employeeDays);

    const totals = otTotalsByEmployee.get(record.employeeId) ?? { ot1: 0, ot2: 0, ot3: 0 };
    totals.ot1 = Number((totals.ot1 + record.ot1After).toFixed(2));
    totals.ot2 = Number((totals.ot2 + record.ot2After).toFixed(2));
    totals.ot3 = Number((totals.ot3 + record.ot3After).toFixed(2));
    otTotalsByEmployee.set(record.employeeId, totals);
  }

  const nonSundayPeriodDays = periodDays
    .filter((day) => day.getDay() !== 0)
    .map((day) => toIsoDate(day));

  const nextRows: WageCsvRow[] = employees.map((employee, index) => {
    const employeeId = employee.__id;
    const employeeDays = daySummaryByEmployee.get(employeeId) ?? new Map();
    const workedDayKeys = [...employeeDays.keys()];
    const workedNonSunday = workedDayKeys.filter((dayKey) => {
      const summary = employeeDays.get(dayKey);
      return summary ? !summary.isSunday : false;
    }).length;

    const absentDaysNonSunday = Math.max(0, nonSundayPeriodDays.length - workedNonSunday);
    const otTotals = otTotalsByEmployee.get(employeeId) ?? { ot1: 0, ot2: 0, ot3: 0 };
    const employmentType = String(employee["การจ้างงาน"] ?? "").trim();
    const dailyWageRaw = parseFlexibleNumber(employee["ค่าแรงต่อวัน"] || "");
    const salaryRaw = parseFlexibleNumber(
      employee["เงินเดือน"] || employee["เงินเดือน 40(1)"] || ""
    );
    const dailyWage = dailyWageRaw > 0 ? dailyWageRaw : salaryRaw > 0 ? salaryRaw / 15 : 0;
    const hourlyWage = dailyWage > 0 ? dailyWage / 8 : 0;
    const perMinuteWage = hourlyWage / 60;

    const actualWorkDays = workedDayKeys.length;
    const nightShiftDays = workedDayKeys.filter((dayKey) => {
      const summary = employeeDays.get(dayKey);
      return summary?.shiftCode === "night";
    }).length;

    let totalLateMinutesForDeduction = 0;
    let allBeforeEight = actualWorkDays > 0;

    for (const dayKey of workedDayKeys) {
      const summary = employeeDays.get(dayKey)!;
      const schedule = buildScheduledStart(new Date(dayKey), summary.shiftCode);
      const lateMinutes = minutesBetween(schedule, summary.enteredAt);
      const weightedLateMinutes = lateMinutes * (summary.isSunday ? 2 : 1);
      totalLateMinutesForDeduction += weightedLateMinutes;

      const beforeEight = summary.enteredAt.getHours() < 8;
      if (!beforeEight) {
        allBeforeEight = false;
      }
    }

    const employmentIsMonthly = isMonthlyEmployee(employmentType);
    const baseWage = employmentIsMonthly
      ? Math.max(0, salaryRaw - absentDaysNonSunday * dailyWage)
      : actualWorkDays * dailyWage;
    const displayWorkDays = employmentIsMonthly ? periodDayCount : actualWorkDays;

    const ot1Pay = otTotals.ot1 * 1.5 * hourlyWage;
    const ot2Pay = otTotals.ot2 * (employmentIsMonthly ? 1 : 2) * hourlyWage;
    const ot3Pay = otTotals.ot3 * 3 * hourlyWage;
    const attendanceBonus = allBeforeEight ? 300 : 0;
    const shiftAllowance = nightShiftDays * 40;
    const lateDeduction = perMinuteWage * totalLateMinutesForDeduction;

    const manualValues = Object.fromEntries(
      MANUAL_SPECIAL_COLUMNS.map((column) => [column, parseFlexibleNumber(employee[column] || "")])
    ) as Record<(typeof MANUAL_SPECIAL_COLUMNS)[number], number>;

    const computedValues = {
      ค่าจ้าง: baseWage,
      ค่าโอทีOT1: ot1Pay,
      ค่าโอทีOT2: ot2Pay,
      ค่าโอทีOT3: ot3Pay,
      ค่าตำแหน่ง: manualValues["ค่าตำแหน่ง"],
      เบี้ยขยัน: attendanceBonus,
      ค่ากะ: shiftAllowance,
      ค่าโทรศัพท์: manualValues["ค่าโทรศัพท์"],
      ค่าครองชีพ: manualValues["ค่าครองชีพ"],
      ค่าพิเศษ: manualValues["ค่าพิเศษ"],
      ค่าอื่นๆ: manualValues["ค่าอื่นๆ"],
      "ค่าอื่นๆ(พิเศษ)": manualValues["ค่าอื่นๆ(พิเศษ)"],
      คืนเบี้ยขยัน: manualValues["คืนเบี้ยขยัน"],
      คืนพักร้อน: manualValues["คืนพักร้อน"],
      โบนัสรายเดือน: manualValues["โบนัสรายเดือน"],
      มาสาย: lateDeduction,
      ขาดงาน: manualValues["ขาดงาน"],
      ลากิจ: manualValues["ลากิจ"],
      "หัก กยศ.": manualValues["หัก กยศ."],
      สหกรณ์: manualValues["สหกรณ์"],
      งานเสีย: manualValues["งานเสีย"],
      หักค่าพิเศษ: manualValues["หักค่าพิเศษ"],
      "หักค่าอื่นๆ": manualValues["หักค่าอื่นๆ"]
    };

    const incomeTotal = INCOME_COLUMNS.reduce((total, column) => total + computedValues[column], 0);
    const deductionTotal = DEDUCTION_COLUMNS.reduce(
      (total, column) => total + computedValues[column],
      0
    );
    const netWage = incomeTotal - deductionTotal;

    const row: WageCsvRow = {
      โรงงาน: factoryLabel,
      งวดรอบ: String(selection.period),
      งวดเดือน: String(selection.month),
      งวดปี: String(selection.year),
      งวดวันที่เริ่ม: periodStart,
      งวดวันที่สิ้นสุด: periodEnd,
      งวดวันที่จ่าย: payDate,
      ลำดับ: String(index + 1),
      รหัสพนักงาน: employeeId,
      ชื่อ: employee["ชื่อ"] || "",
      สกุล: employee["สกุล"] || "",
      แผนก: employee.__department || "",
      ตำแหน่ง: employee.__position || "",
      การจ้างงาน: employmentType,
      ค่าแรงต่อวัน: formatMoney(dailyWage),
      เงินเดือน: formatMoney(salaryRaw),
      จำนวนวันที่ทำงาน: formatInteger(displayWorkDays),
      "จำนวนวันขาดงาน(ไม่รวมอาทิตย์)": formatInteger(absentDaysNonSunday),
      จำนวนนาทีมาสาย: formatMoney(totalLateMinutesForDeduction),
      จำนวนวันเข้ากะดึก: formatInteger(nightShiftDays),
      ค่าจ้าง: formatMoney(computedValues["ค่าจ้าง"]),
      ค่าโอทีOT1: formatMoney(computedValues["ค่าโอทีOT1"]),
      ค่าโอทีOT2: formatMoney(computedValues["ค่าโอทีOT2"]),
      ค่าโอทีOT3: formatMoney(computedValues["ค่าโอทีOT3"]),
      ค่าตำแหน่ง: formatMoney(computedValues["ค่าตำแหน่ง"]),
      เบี้ยขยัน: formatMoney(computedValues["เบี้ยขยัน"]),
      ค่ากะ: formatMoney(computedValues["ค่ากะ"]),
      ค่าโทรศัพท์: formatMoney(computedValues["ค่าโทรศัพท์"]),
      ค่าครองชีพ: formatMoney(computedValues["ค่าครองชีพ"]),
      ค่าพิเศษ: formatMoney(computedValues["ค่าพิเศษ"]),
      ค่าอื่นๆ: formatMoney(computedValues["ค่าอื่นๆ"]),
      "ค่าอื่นๆ(พิเศษ)": formatMoney(computedValues["ค่าอื่นๆ(พิเศษ)"]),
      คืนเบี้ยขยัน: formatMoney(computedValues["คืนเบี้ยขยัน"]),
      คืนพักร้อน: formatMoney(computedValues["คืนพักร้อน"]),
      โบนัสรายเดือน: formatMoney(computedValues["โบนัสรายเดือน"]),
      มาสาย: formatMoney(computedValues["มาสาย"]),
      ขาดงาน: formatMoney(computedValues["ขาดงาน"]),
      ลากิจ: formatMoney(computedValues["ลากิจ"]),
      "หัก กยศ.": formatMoney(computedValues["หัก กยศ."]),
      สหกรณ์: formatMoney(computedValues["สหกรณ์"]),
      งานเสีย: formatMoney(computedValues["งานเสีย"]),
      หักค่าพิเศษ: formatMoney(computedValues["หักค่าพิเศษ"]),
      "หักค่าอื่นๆ": formatMoney(computedValues["หักค่าอื่นๆ"]),
      ค่าจ้างสุทธิ: formatMoney(netWage)
    };

    return Object.fromEntries(headers.map((header) => [header, String(row[header] ?? "")]));
  });

  const supabase = getSupabaseAdmin();
  const payload = nextRows.map((row, index) => ({
    factory_id: factoryId,
    pay_date: payDate,
    period_no: selection.period,
    period_month: selection.month,
    period_year: selection.year,
    period_start: periodStart,
    period_end: periodEnd,
    employee_id: String(row["รหัสพนักงาน"] ?? ""),
    seq_no: index + 1,
    row_data: row
  }));

  for (const chunk of chunkArray(payload, 500)) {
    const { error } = await supabase.from("hr_wages").upsert(chunk, {
      onConflict: "factory_id,pay_date,employee_id"
    });

    if (error) {
      throw new Error(`[hr_wages] ${error.message}`);
    }
  }

  return {
    created: true,
    message: `คำนวณค่าจ้างงวด ${payDate} สำเร็จ ${nextRows.length} รายการ`,
    headers,
    rows: nextRows,
    payDate
  };
}

export async function getWageStatusForPeriod(
  factoryId: FactoryId,
  selection: PeriodSelection
): Promise<{
  headers: string[];
  rows: WageCsvRow[];
  payDate: string;
  otCheck: {
    ready: boolean;
    message: string;
    requiredWindow: { start: string; end: string };
    missingBoundaryDates: string[];
  };
}> {
  const otCheck = await checkOtCompletenessForPeriod(factoryId, selection);
  const { headers, rows, payDate } = await findWageRowsForPeriod(factoryId, selection);

  return {
    headers,
    rows,
    payDate,
    otCheck
  };
}

export async function ensureEmployeeHasPayrollColumns(factoryId: FactoryId): Promise<void> {
  const headers = await readEmployeeHeaders(factoryId);
  const missing = MANUAL_SPECIAL_COLUMNS.filter((column) => !headers.includes(column));

  if (missing.length === 0) {
    return;
  }

  const nextHeaders = [...headers, ...missing];
  const rows = await readEmployeeRows(factoryId);
  const normalised = rows.map((row) =>
    Object.fromEntries(nextHeaders.map((header) => [header, String(row[header] ?? "")]))
  );

  await writeEmployeeRows(factoryId, normalised, nextHeaders);
}
