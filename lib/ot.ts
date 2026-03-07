import { OFFICE_KEYWORDS, TRANSPORT_KEYWORDS } from "@/lib/constants";
import { readEmployeeMap, readEmployees } from "@/lib/employees";
import { buildPeriodLabel, enumeratePeriodDays, getPeriodRange, toIsoDate } from "@/lib/periods";
import { chunkArray, fetchAllRows, getSupabaseAdmin } from "@/lib/supabase";
import {
  EmployeeRecord,
  FactoryId,
  OTDailyRecord,
  OTSummaryResponse,
  OTSummaryRow,
  PeriodSelection,
  RawScan,
  WorkSession
} from "@/lib/types";

function roundDownHalfHour(hours: number): number {
  if (hours <= 0) {
    return 0;
  }
  return Math.floor(hours * 2) / 2;
}

function parseFlexibleNumber(value: string): number {
  const trimmed = value.trim();
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
    return negative ? parsed * -1 : parsed;
  }

  const integerPart = unsigned.slice(0, separatorIndex).replace(/[.,]/g, "");
  const decimalPart = unsigned.slice(separatorIndex + 1).replace(/[.,]/g, "");
  const parsed = Number(`${integerPart || "0"}.${decimalPart || "0"}`);

  return negative ? parsed * -1 : parsed;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60000);
}

function overlapMinutes(
  rangeStart: Date,
  rangeEnd: Date,
  windowStart: Date,
  windowEnd: Date
): number {
  const start = Math.max(rangeStart.getTime(), windowStart.getTime());
  const end = Math.min(rangeEnd.getTime(), windowEnd.getTime());
  return Math.max(0, Math.round((end - start) / 60000));
}

function parseLogDate(dateLabel: string, timeLabel: string): Date | null {
  const [day, month, year] = dateLabel.split("-").map(Number);
  const [hour, minute, second] = timeLabel.split(":").map(Number);

  if (
    [day, month, year, hour, minute].some((value) => Number.isNaN(value)) ||
    day < 1 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, Number.isNaN(second) ? 0 : second, 0);
}

function buildRawScanKey(factoryId: FactoryId, scan: RawScan): string {
  return [
    factoryId,
    scan.employeeId,
    scan.machineCode,
    scan.type,
    scan.scannedAt.toISOString()
  ].join("|");
}

function isKeywordMatch(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function getShiftProfile(
  employee: EmployeeRecord | undefined,
  enteredAt: Date,
  previousSession: WorkSession | null
): {
  shiftCode: OTDailyRecord["shiftCode"];
  scheduledStart: Date;
  scheduledEnd: Date;
  preOtStart: Date;
  postOtStart: Date;
  breakStart: Date | null;
  breakEnd: Date | null;
} {
  const department = employee?.__department || "";
  const isNight = enteredAt.getHours() >= 18;

  if (isNight) {
    const scheduledStart = new Date(
      enteredAt.getFullYear(),
      enteredAt.getMonth(),
      enteredAt.getDate(),
      20,
      0,
      0,
      0
    );

    return {
      shiftCode: "night",
      scheduledStart,
      scheduledEnd: addMinutes(scheduledStart, 9 * 60),
      preOtStart: new Date(
        enteredAt.getFullYear(),
        enteredAt.getMonth(),
        enteredAt.getDate(),
        17,
        30,
        0,
        0
      ),
      postOtStart: addMinutes(scheduledStart, 9 * 60 + 30),
      breakStart: new Date(
        scheduledStart.getFullYear(),
        scheduledStart.getMonth(),
        scheduledStart.getDate() + 1,
        0,
        0,
        0,
        0
      ),
      breakEnd: new Date(
        scheduledStart.getFullYear(),
        scheduledStart.getMonth(),
        scheduledStart.getDate() + 1,
        1,
        0,
        0,
        0
      )
    };
  }

  const scheduledStart = new Date(enteredAt);
  scheduledStart.setSeconds(0, 0);
  scheduledStart.setHours(8, 0, 0, 0);

  const scheduledEnd = new Date(enteredAt);
  scheduledEnd.setSeconds(0, 0);
  scheduledEnd.setHours(17, 0, 0, 0);

  const shiftCode: OTDailyRecord["shiftCode"] = "day";

  if (isKeywordMatch(department, OFFICE_KEYWORDS)) {
    scheduledStart.setHours(7, 45, 0, 0);
    scheduledEnd.setHours(17, 15, 0, 0);
    return {
      shiftCode: "office",
      scheduledStart,
      scheduledEnd,
      preOtStart: new Date(
        enteredAt.getFullYear(),
        enteredAt.getMonth(),
        enteredAt.getDate(),
        6,
        30,
        0,
        0
      ),
      postOtStart: new Date(
        enteredAt.getFullYear(),
        enteredAt.getMonth(),
        enteredAt.getDate(),
        17,
        30,
        0,
        0
      ),
      breakStart: new Date(
        enteredAt.getFullYear(),
        enteredAt.getMonth(),
        enteredAt.getDate(),
        12,
        0,
        0,
        0
      ),
      breakEnd: new Date(
        enteredAt.getFullYear(),
        enteredAt.getMonth(),
        enteredAt.getDate(),
        13,
        0,
        0,
        0
      )
    };
  }

  if (isKeywordMatch(department, TRANSPORT_KEYWORDS)) {
    const previousCalendarDay = new Date(enteredAt);
    previousCalendarDay.setHours(0, 0, 0, 0);
    previousCalendarDay.setDate(previousCalendarDay.getDate() - 1);
    const lateExitHour =
      previousSession &&
      previousSession.exitedAt.getFullYear() === previousCalendarDay.getFullYear() &&
      previousSession.exitedAt.getMonth() === previousCalendarDay.getMonth() &&
      previousSession.exitedAt.getDate() === previousCalendarDay.getDate()
        ? previousSession.exitedAt.getHours() + previousSession.exitedAt.getMinutes() / 60
        : null;

    if (lateExitHour !== null && lateExitHour >= 2) {
      scheduledStart.setHours(12, 0, 0, 0);
      return {
        shiftCode: "transport12",
        scheduledStart,
        scheduledEnd,
        preOtStart: new Date(
          enteredAt.getFullYear(),
          enteredAt.getMonth(),
          enteredAt.getDate(),
          6,
          30,
          0,
          0
        ),
        postOtStart: new Date(
          enteredAt.getFullYear(),
          enteredAt.getMonth(),
          enteredAt.getDate(),
          17,
          30,
          0,
          0
        ),
        breakStart: new Date(
          enteredAt.getFullYear(),
          enteredAt.getMonth(),
          enteredAt.getDate(),
          12,
          0,
          0,
          0
        ),
        breakEnd: new Date(
          enteredAt.getFullYear(),
          enteredAt.getMonth(),
          enteredAt.getDate(),
          13,
          0,
          0,
          0
        )
      };
    }

    if (lateExitHour !== null && lateExitHour >= 0) {
      scheduledStart.setHours(10, 0, 0, 0);
      return {
        shiftCode: "transport10",
        scheduledStart,
        scheduledEnd,
        preOtStart: new Date(
          enteredAt.getFullYear(),
          enteredAt.getMonth(),
          enteredAt.getDate(),
          6,
          30,
          0,
          0
        ),
        postOtStart: new Date(
          enteredAt.getFullYear(),
          enteredAt.getMonth(),
          enteredAt.getDate(),
          17,
          30,
          0,
          0
        ),
        breakStart: new Date(
          enteredAt.getFullYear(),
          enteredAt.getMonth(),
          enteredAt.getDate(),
          12,
          0,
          0,
          0
        ),
        breakEnd: new Date(
          enteredAt.getFullYear(),
          enteredAt.getMonth(),
          enteredAt.getDate(),
          13,
          0,
          0,
          0
        )
      };
    }
  }

  return {
    shiftCode,
    scheduledStart,
    scheduledEnd,
    preOtStart: new Date(
      enteredAt.getFullYear(),
      enteredAt.getMonth(),
      enteredAt.getDate(),
      6,
      30,
      0,
      0
    ),
    postOtStart: new Date(
      enteredAt.getFullYear(),
      enteredAt.getMonth(),
      enteredAt.getDate(),
      17,
      30,
      0,
      0
    ),
    breakStart: new Date(
      enteredAt.getFullYear(),
      enteredAt.getMonth(),
      enteredAt.getDate(),
      12,
      0,
      0,
      0
    ),
    breakEnd: new Date(
      enteredAt.getFullYear(),
      enteredAt.getMonth(),
      enteredAt.getDate(),
      13,
      0,
      0,
      0
    )
  };
}

function computeRegularOt(session: WorkSession, profile: ReturnType<typeof getShiftProfile>): {
  ot1: number;
  notes: string;
} {
  const preMinutes = overlapMinutes(
    session.enteredAt,
    session.exitedAt,
    profile.preOtStart,
    profile.scheduledStart
  );

  let postMinutes =
    session.exitedAt > profile.postOtStart ? minutesBetween(profile.postOtStart, session.exitedAt) : 0;

  if (profile.breakStart && profile.breakEnd) {
    postMinutes -= overlapMinutes(
      profile.postOtStart,
      session.exitedAt,
      profile.breakStart,
      profile.breakEnd
    );
  }

  const safePostMinutes = Math.max(0, postMinutes);
  const isTransportShift =
    profile.shiftCode === "transport10" || profile.shiftCode === "transport12";
  const crossesMidnight =
    session.enteredAt.getFullYear() !== session.exitedAt.getFullYear() ||
    session.enteredAt.getMonth() !== session.exitedAt.getMonth() ||
    session.enteredAt.getDate() !== session.exitedAt.getDate();
  const hours =
    isTransportShift && crossesMidnight
      ? Number(
          (
            roundDownHalfHour(preMinutes / 60) + Math.floor(safePostMinutes / 60)
          ).toFixed(2)
        )
      : roundDownHalfHour((preMinutes + safePostMinutes) / 60);
  const notes: string[] = [];

  if (preMinutes > 0) {
    notes.push("มี OT ก่อนกะ");
  }
  if (postMinutes > 0) {
    notes.push("มี OT หลังเลิกงาน");
  }

  return { ot1: hours, notes: notes.join(", ") };
}

function computeSundayOt(session: WorkSession, profile: ReturnType<typeof getShiftProfile>): {
  ot2: number;
  ot3: number;
  notes: string;
} {
  let ot2Minutes = 0;

  if (profile.shiftCode === "night") {
    ot2Minutes = overlapMinutes(
      session.enteredAt,
      session.exitedAt,
      profile.scheduledStart,
      profile.scheduledEnd
    );
    if (profile.breakStart && profile.breakEnd) {
      ot2Minutes -= overlapMinutes(
        profile.scheduledStart,
        session.exitedAt,
        profile.breakStart,
        profile.breakEnd
      );
    }
    ot2Minutes = Math.min(8 * 60, Math.max(0, ot2Minutes));
  } else {
    const midday = new Date(profile.scheduledStart);
    midday.setHours(12, 0, 0, 0);
    const afternoon = new Date(profile.scheduledStart);
    afternoon.setHours(13, 0, 0, 0);
    const baseEnd = new Date(profile.scheduledStart);
    baseEnd.setHours(17, 0, 0, 0);

    const workedMorning = overlapMinutes(session.enteredAt, session.exitedAt, profile.scheduledStart, midday);
    const workedAfternoon = overlapMinutes(session.enteredAt, session.exitedAt, afternoon, baseEnd);

    const morningBlock = session.exitedAt > midday && session.enteredAt < midday
      ? 4 * 60
      : workedMorning;
    const afternoonBlock = session.exitedAt >= baseEnd && session.exitedAt > afternoon
      ? 4 * 60
      : workedAfternoon;

    ot2Minutes = Math.min(8 * 60, Math.max(0, morningBlock) + Math.max(0, afternoonBlock));
  }

  let ot3Minutes = 0;

  if (session.exitedAt > profile.postOtStart) {
    ot3Minutes = minutesBetween(profile.postOtStart, session.exitedAt);
    if (profile.breakStart && profile.breakEnd) {
      ot3Minutes -= overlapMinutes(
        profile.postOtStart,
        session.exitedAt,
        profile.breakStart,
        profile.breakEnd
      );
    }
  }

  return {
    ot2: roundDownHalfHour(ot2Minutes / 60),
    ot3: roundDownHalfHour(Math.max(0, ot3Minutes) / 60),
    notes: "คำนวณ OT วันอาทิตย์"
  };
}

function calculateOtPay(employee: EmployeeRecord | undefined, ot1: number, ot2: number, ot3: number): number {
  const parsedDaily = parseFlexibleNumber(employee?.["ค่าแรงต่อวัน"] || "");
  const parsedMonthly = parseFlexibleNumber(
    employee?.["เงินเดือน"] || employee?.["เงินเดือน 40(1)"] || ""
  );
  const baseDaily =
    Number.isFinite(parsedDaily) && parsedDaily > 0
      ? parsedDaily
      : Number.isFinite(parsedMonthly) && parsedMonthly > 0
        ? parsedMonthly / 15
        : 0;
  const hourlyRate = baseDaily > 0 ? baseDaily / 8 : 0;

  const total = ot1 * hourlyRate * 1.5 + ot2 * hourlyRate * 2 + ot3 * hourlyRate * 3;
  return Number(total.toFixed(2));
}

export function parseBiometricLog(content: string): RawScan[] {
  const lines = content
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const scans: RawScan[] = [];

  for (const line of lines) {
    const parts = line.split("\t").map((part) => part.trim());
    if (parts.length < 5) {
      continue;
    }

    const machineCode = parts[0];
    const dateLabel = parts[1];
    const timeLabel = parts[2];
    const employeeToken = parts[3];
    const scanTypeToken = [...parts].reverse().find((part) => part === "1" || part === "2");

    const scannedAt = parseLogDate(dateLabel, timeLabel);
    const type = scanTypeToken === "2" ? 2 : scanTypeToken === "1" ? 1 : null;

    if (!scannedAt || !type) {
      continue;
    }

    scans.push({
      employeeId: employeeToken.replace(/^'+/, "").trim(),
      machineCode,
      type,
      scannedAt
    });
  }

  return scans.sort((left, right) => left.scannedAt.getTime() - right.scannedAt.getTime());
}

export async function loadStoredScans(factoryId?: FactoryId): Promise<RawScan[]> {
  const scans = await fetchAllRows<{
    factory_id: FactoryId;
    machine_code: string;
    scanned_at: string;
    employee_id: string;
    scan_type: number;
  }>(
    "hr_scan_events",
    "factory_id,machine_code,scanned_at,employee_id,scan_type",
    (query) => {
      let scoped = query.order("scanned_at", { ascending: true });
      if (factoryId) {
        scoped = scoped.eq("factory_id", factoryId);
      }
      return scoped;
    }
  );

  return scans
    .map((scan) => ({
      employeeId: String(scan.employee_id ?? "").trim(),
      machineCode: String(scan.machine_code ?? "").trim(),
      type: (Number(scan.scan_type) === 2 ? 2 : 1) as 1 | 2,
      scannedAt: new Date(scan.scanned_at)
    }))
    .filter(
      (scan) =>
        scan.employeeId.length > 0 &&
        scan.machineCode.length > 0 &&
        !Number.isNaN(scan.scannedAt.getTime())
    )
    .sort((left, right) => left.scannedAt.getTime() - right.scannedAt.getTime());
}

export async function appendScansToStorage(
  factoryId: FactoryId,
  scans: RawScan[]
): Promise<{ addedCount: number; duplicateCount: number; totalCount: number }> {
  const supabase = getSupabaseAdmin();
  const existingRows = await fetchAllRows<{
    machine_code: string;
    scanned_at: string;
    employee_id: string;
    scan_type: number;
  }>(
    "hr_scan_events",
    "machine_code,scanned_at,employee_id,scan_type",
    (query) => query.eq("factory_id", factoryId)
  );
  const existingKeys = new Set(
    existingRows.map((row) =>
      [
        factoryId,
        String(row.employee_id ?? "").trim(),
        String(row.machine_code ?? "").trim(),
        Number(row.scan_type) === 2 ? "2" : "1",
        new Date(row.scanned_at).toISOString()
      ].join("|")
    )
  );

  let addedCount = 0;
  let duplicateCount = 0;
  const rowsToInsert: Array<{
    factory_id: FactoryId;
    machine_code: string;
    scanned_at: string;
    employee_id: string;
    scan_type: 1 | 2;
  }> = [];

  for (const scan of scans) {
    if (
      !scan.employeeId.trim() ||
      !scan.machineCode.trim() ||
      Number.isNaN(scan.scannedAt.getTime())
    ) {
      continue;
    }

    const key = buildRawScanKey(factoryId, scan);

    if (existingKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }

    existingKeys.add(key);
    rowsToInsert.push({
      factory_id: factoryId,
      machine_code: scan.machineCode.trim(),
      scanned_at: scan.scannedAt.toISOString(),
      employee_id: scan.employeeId.trim(),
      scan_type: scan.type
    });
    addedCount += 1;
  }

  for (const chunk of chunkArray(rowsToInsert, 500)) {
    const { error } = await supabase.from("hr_scan_events").upsert(chunk, {
      onConflict: "factory_id,machine_code,scanned_at,employee_id,scan_type",
      ignoreDuplicates: true
    });

    if (error) {
      throw new Error(`[hr_scan_events] ${error.message}`);
    }
  }

  const { count, error: countError } = await supabase
    .from("hr_scan_events")
    .select("*", { head: true, count: "exact" })
    .eq("factory_id", factoryId);

  if (countError) {
    throw new Error(`[hr_scan_events] ${countError.message}`);
  }

  return {
    addedCount,
    duplicateCount,
    totalCount: count ?? 0
  };
}

function buildSessions(scans: RawScan[]): WorkSession[] {
  const grouped = new Map<string, RawScan[]>();

  for (const scan of scans) {
    const bucket = grouped.get(scan.employeeId) ?? [];
    bucket.push(scan);
    grouped.set(scan.employeeId, bucket);
  }

  const sessions: WorkSession[] = [];

  for (const [employeeId, employeeScans] of grouped.entries()) {
    employeeScans.sort((left, right) => left.scannedAt.getTime() - right.scannedAt.getTime());
    let pendingIn: RawScan | null = null;

    for (const scan of employeeScans) {
      if (scan.type === 1) {
        if (!pendingIn) {
          pendingIn = scan;
          continue;
        }

        const minutesSincePending = minutesBetween(pendingIn.scannedAt, scan.scannedAt);
        if (minutesSincePending > 18 * 60) {
          pendingIn = scan;
        }
        continue;
      }

      if (!pendingIn) {
        continue;
      }

      const duration = minutesBetween(pendingIn.scannedAt, scan.scannedAt);
      if (duration <= 0 || duration > 20 * 60) {
        continue;
      }

      sessions.push({
        employeeId,
        enteredAt: pendingIn.scannedAt,
        exitedAt: scan.scannedAt
      });
      pendingIn = null;
    }
  }

  return sessions.sort((left, right) => left.enteredAt.getTime() - right.enteredAt.getTime());
}

export async function computeOtRecordsFromScans(
  factoryId: FactoryId,
  incomingScans: RawScan[]
): Promise<OTDailyRecord[]> {
  const dedupedScans = [...incomingScans]
    .filter((scan) => !Number.isNaN(scan.scannedAt.getTime()))
    .sort((left, right) => left.scannedAt.getTime() - right.scannedAt.getTime())
    .filter((scan, index, items) => {
      if (index === 0) {
        return true;
      }

      const previous = items[index - 1];

      return !(
        previous.employeeId === scan.employeeId &&
        previous.machineCode === scan.machineCode &&
        previous.type === scan.type &&
        previous.scannedAt.getTime() === scan.scannedAt.getTime()
      );
    });
  const employeeMap = await readEmployeeMap(factoryId);
  const sessions = buildSessions(dedupedScans);
  const previousByEmployee = new Map<string, WorkSession | null>();

  return sessions.map((session) => {
    const employee = employeeMap.get(session.employeeId);
    const previousSession = previousByEmployee.get(session.employeeId) ?? null;
    const profile = getShiftProfile(employee, session.enteredAt, previousSession);
    const isSunday = session.enteredAt.getDay() === 0;

    previousByEmployee.set(session.employeeId, session);

    let ot1 = 0;
    let ot2 = 0;
    let ot3 = 0;
    let notes = "";

    if (isSunday) {
      const sundayOt = computeSundayOt(session, profile);
      ot2 = sundayOt.ot2;
      ot3 = sundayOt.ot3;
      notes = sundayOt.notes;
    } else {
      const regularOt = computeRegularOt(session, profile);
      ot1 = regularOt.ot1;
      notes = regularOt.notes;
    }

    const otPay = calculateOtPay(employee, ot1, ot2, ot3);

    return {
      workDate: toIsoDate(session.enteredAt),
      employeeId: session.employeeId,
      employeeName: employee?.__fullName || "ไม่พบข้อมูลพนักงาน",
      department: employee?.__department || "",
      position: employee?.__position || "",
      factoryId,
      shiftCode: profile.shiftCode,
      isSunday,
      enteredAt: session.enteredAt.toISOString(),
      exitedAt: session.exitedAt.toISOString(),
      ot1,
      ot2,
      ot3,
      totalOt: Number((ot1 + ot2 + ot3).toFixed(2)),
      otPay,
      notes
    };
  });
}

export async function computeOtRecords(factoryId: FactoryId, content: string): Promise<OTDailyRecord[]> {
  return computeOtRecordsFromScans(factoryId, parseBiometricLog(content));
}

export async function saveOtRecords(factoryId: FactoryId, records: OTDailyRecord[]): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error: deleteError } = await supabase.from("hr_ot_daily").delete().eq("factory_id", factoryId);

  if (deleteError) {
    throw new Error(`[hr_ot_daily] ${deleteError.message}`);
  }

  const payload = records.map((record) => ({
    factory_id: factoryId,
    work_date: record.workDate,
    employee_id: record.employeeId,
    employee_name: record.employeeName,
    department: record.department,
    position: record.position,
    shift_code: record.shiftCode,
    is_sunday: record.isSunday,
    entered_at: record.enteredAt,
    exited_at: record.exitedAt,
    ot1: Number(record.ot1.toFixed(2)),
    ot2: Number(record.ot2.toFixed(2)),
    ot3: Number(record.ot3.toFixed(2)),
    total_ot: Number(record.totalOt.toFixed(2)),
    ot_pay: Number(record.otPay.toFixed(2)),
    notes: record.notes
  }));

  for (const chunk of chunkArray(payload, 500)) {
    const { error } = await supabase.from("hr_ot_daily").insert(chunk);

    if (error) {
      throw new Error(`[hr_ot_daily] ${error.message}`);
    }
  }
}

export async function loadOtRecords(factoryId: FactoryId): Promise<OTDailyRecord[]> {
  const rows = await fetchAllRows<{
    work_date: string;
    employee_id: string;
    employee_name: string;
    department: string;
    position: string;
    shift_code: OTDailyRecord["shiftCode"];
    is_sunday: boolean;
    entered_at: string;
    exited_at: string;
    ot1: number;
    ot2: number;
    ot3: number;
    total_ot: number;
    ot_pay: number;
    notes: string | null;
  }>(
    "hr_ot_daily",
    "work_date,employee_id,employee_name,department,position,shift_code,is_sunday,entered_at,exited_at,ot1,ot2,ot3,total_ot,ot_pay,notes",
    (query) =>
      query
        .eq("factory_id", factoryId)
        .order("work_date", { ascending: true })
        .order("entered_at", { ascending: true })
  );

  return rows.map((row) => ({
    workDate: String(row.work_date ?? ""),
    employeeId: String(row.employee_id ?? ""),
    employeeName: String(row.employee_name ?? ""),
    department: String(row.department ?? ""),
    position: String(row.position ?? ""),
    factoryId,
    shiftCode: row.shift_code || "day",
    isSunday: Boolean(row.is_sunday),
    enteredAt: String(row.entered_at ?? ""),
    exitedAt: String(row.exited_at ?? ""),
    ot1: Number(row.ot1 || 0),
    ot2: Number(row.ot2 || 0),
    ot3: Number(row.ot3 || 0),
    totalOt: Number(row.total_ot || 0),
    otPay: Number(row.ot_pay || 0),
    notes: String(row.notes ?? "")
  }));
}

export async function getOtLastUpdatedAt(factoryId: FactoryId): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("hr_ot_daily")
    .select("updated_at")
    .eq("factory_id", factoryId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ updated_at: string | null }>();

  if (error) {
    throw new Error(`[hr_ot_daily] ${error.message}`);
  }

  return data?.updated_at ?? null;
}

export async function buildOtSummary(
  factoryId: FactoryId,
  selection: PeriodSelection
): Promise<OTSummaryResponse> {
  const employees = await readEmployees(factoryId);
  const records = await loadOtRecords(factoryId);
  const lastUpdatedAt = await getOtLastUpdatedAt(factoryId);
  const { start, end } = getPeriodRange(selection);
  const startKey = toIsoDate(start);
  const endKey = toIsoDate(end);
  const days = enumeratePeriodDays(selection);

  const filteredRecords = records.filter(
    (record) => record.workDate >= startKey && record.workDate <= endKey
  );

  const rowsMap = new Map<string, OTSummaryRow>();
  const workDaySets = new Map<string, Set<string>>();

  for (const employee of employees) {
    rowsMap.set(employee.__id, {
      employeeId: employee.__id,
      employeeName: employee.__fullName,
      department: employee.__department,
      position: employee.__position,
      workDays: 0,
      ot1: 0,
      ot2: 0,
      ot3: 0,
      totalOt: 0,
      otPay: 0,
      otPay1x5: 0,
      otPay2x: 0,
      otPay3x: 0,
      dayTotals: Object.fromEntries(days.map((day) => [day.key, 0])),
      daySessions: Object.fromEntries(days.map((day) => [day.key, []]))
    });
  }

  for (const record of filteredRecords) {
    if (!rowsMap.has(record.employeeId)) {
      rowsMap.set(record.employeeId, {
        employeeId: record.employeeId,
        employeeName: record.employeeName,
        department: record.department,
        position: record.position,
        workDays: 0,
        ot1: 0,
        ot2: 0,
        ot3: 0,
        totalOt: 0,
        otPay: 0,
        otPay1x5: 0,
        otPay2x: 0,
        otPay3x: 0,
        dayTotals: Object.fromEntries(days.map((day) => [day.key, 0])),
        daySessions: Object.fromEntries(days.map((day) => [day.key, []]))
      });
    }

    const row = rowsMap.get(record.employeeId)!;
    const workDays = workDaySets.get(record.employeeId) ?? new Set<string>();
    workDays.add(record.workDate);
    workDaySets.set(record.employeeId, workDays);
    row.workDays = workDays.size;
    row.ot1 = Number((row.ot1 + record.ot1).toFixed(2));
    row.ot2 = Number((row.ot2 + record.ot2).toFixed(2));
    row.ot3 = Number((row.ot3 + record.ot3).toFixed(2));
    row.totalOt = Number((row.totalOt + record.totalOt).toFixed(2));
    row.otPay = Number((row.otPay + record.otPay).toFixed(2));
    row.otPay1x5 = Number((row.otPay1x5 + record.ot1 * 1.5).toFixed(2));
    row.otPay2x = Number((row.otPay2x + record.ot2 * 2).toFixed(2));
    row.otPay3x = Number((row.otPay3x + record.ot3 * 3).toFixed(2));
    row.dayTotals[record.workDate] = Number(
      ((row.dayTotals[record.workDate] || 0) + record.totalOt).toFixed(2)
    );
    if (!row.daySessions[record.workDate]) {
      row.daySessions[record.workDate] = [];
    }
    row.daySessions[record.workDate].push({
      enteredAt: record.enteredAt,
      exitedAt: record.exitedAt,
      ot: Number(record.totalOt.toFixed(2))
    });
  }

  const rows = [...rowsMap.values()].sort((left, right) =>
    left.employeeId.localeCompare(right.employeeId, "th")
  );

  const totals = rows.reduce(
    (accumulator, row) => ({
      workDays: accumulator.workDays + row.workDays,
      ot1: Number((accumulator.ot1 + row.ot1).toFixed(2)),
      ot2: Number((accumulator.ot2 + row.ot2).toFixed(2)),
      ot3: Number((accumulator.ot3 + row.ot3).toFixed(2)),
      totalOt: Number((accumulator.totalOt + row.totalOt).toFixed(2)),
      otPay: Number((accumulator.otPay + row.otPay).toFixed(2)),
      otPay1x5: Number((accumulator.otPay1x5 + row.otPay1x5).toFixed(2)),
      otPay2x: Number((accumulator.otPay2x + row.otPay2x).toFixed(2)),
      otPay3x: Number((accumulator.otPay3x + row.otPay3x).toFixed(2))
    }),
    {
      workDays: 0,
      ot1: 0,
      ot2: 0,
      ot3: 0,
      totalOt: 0,
      otPay: 0,
      otPay1x5: 0,
      otPay2x: 0,
      otPay3x: 0
    }
  );

  return {
    periodLabel: buildPeriodLabel(selection),
    selection,
    days,
    rows,
    totals,
    recordCount: filteredRecords.length,
    lastUpdatedAt
  };
}
