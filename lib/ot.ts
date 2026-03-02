import { promises as fs } from "node:fs";

import { OFFICE_KEYWORDS, TRANSPORT_KEYWORDS } from "@/lib/constants";
import { getOtStoragePath, parseCsvFile, writeCsvFile } from "@/lib/csv";
import { readEmployeeMap, readEmployees } from "@/lib/employees";
import { buildPeriodLabel, enumeratePeriodDays, getPeriodRange, toIsoDate } from "@/lib/periods";
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

const STORAGE_HEADERS = [
  "workDate",
  "employeeId",
  "employeeName",
  "department",
  "position",
  "factoryId",
  "shiftCode",
  "isSunday",
  "enteredAt",
  "exitedAt",
  "ot1",
  "ot2",
  "ot3",
  "totalOt",
  "otPay",
  "notes"
];

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

  const hours = roundDownHalfHour((preMinutes + Math.max(0, postMinutes)) / 60);
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
        ? parsedMonthly / 30
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

export async function computeOtRecords(factoryId: FactoryId, content: string): Promise<OTDailyRecord[]> {
  const scans = parseBiometricLog(content);
  const employeeMap = await readEmployeeMap(factoryId);
  const sessions = buildSessions(scans);
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

export async function saveOtRecords(factoryId: FactoryId, records: OTDailyRecord[]): Promise<void> {
  await writeCsvFile(
    getOtStoragePath(factoryId),
    STORAGE_HEADERS,
    records.map((record) => ({
      ...record
    }))
  );
}

export async function loadOtRecords(factoryId: FactoryId): Promise<OTDailyRecord[]> {
  try {
    const rows = await parseCsvFile(getOtStoragePath(factoryId));
    return rows.map((row) => ({
      workDate: row.workDate,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      department: row.department,
      position: row.position,
      factoryId,
      shiftCode: (row.shiftCode as OTDailyRecord["shiftCode"]) || "day",
      isSunday: row.isSunday === "true",
      enteredAt: row.enteredAt,
      exitedAt: row.exitedAt,
      ot1: Number(row.ot1 || 0),
      ot2: Number(row.ot2 || 0),
      ot3: Number(row.ot3 || 0),
      totalOt: Number(row.totalOt || 0),
      otPay: Number(row.otPay || 0),
      notes: row.notes || ""
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function getOtLastUpdatedAt(factoryId: FactoryId): Promise<string | null> {
  try {
    const stat = await fs.stat(getOtStoragePath(factoryId));
    return stat.mtime.toISOString();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function buildOtSummary(
  factoryId: FactoryId,
  selection: PeriodSelection
): Promise<OTSummaryResponse> {
  const employees = await readEmployees(factoryId);
  const records = await loadOtRecords(factoryId);
  const lastUpdatedAt = await getOtLastUpdatedAt(factoryId);
  const { start, end } = getPeriodRange(selection);
  const days = enumeratePeriodDays(selection);

  const filteredRecords = records.filter((record) => {
    const workDate = new Date(record.workDate);
    return workDate >= start && workDate <= end;
  });

  const rowsMap = new Map<string, OTSummaryRow>();

  for (const employee of employees) {
    rowsMap.set(employee.__id, {
      employeeId: employee.__id,
      employeeName: employee.__fullName,
      department: employee.__department,
      position: employee.__position,
      ot1: 0,
      ot2: 0,
      ot3: 0,
      totalOt: 0,
      otPay: 0,
      otPay1x5: 0,
      otPay2x: 0,
      otPay3x: 0,
      dayTotals: Object.fromEntries(days.map((day) => [day.key, 0]))
    });
  }

  for (const record of filteredRecords) {
    if (!rowsMap.has(record.employeeId)) {
      rowsMap.set(record.employeeId, {
        employeeId: record.employeeId,
        employeeName: record.employeeName,
        department: record.department,
        position: record.position,
        ot1: 0,
        ot2: 0,
        ot3: 0,
        totalOt: 0,
        otPay: 0,
        otPay1x5: 0,
        otPay2x: 0,
        otPay3x: 0,
        dayTotals: Object.fromEntries(days.map((day) => [day.key, 0]))
      });
    }

    const row = rowsMap.get(record.employeeId)!;
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
  }

  const rows = [...rowsMap.values()].sort((left, right) =>
    left.employeeId.localeCompare(right.employeeId, "th")
  );

  const totals = rows.reduce(
    (accumulator, row) => ({
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
