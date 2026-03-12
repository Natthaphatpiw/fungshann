export type FactoryId = "factory1" | "factory3";

export interface SessionAccount {
  factoryId: FactoryId;
  factoryLabel: string;
  username: string;
}

export interface EmployeeRecord {
  [key: string]: string;
  __id: string;
  __fullName: string;
  __department: string;
  __position: string;
}

export interface RawScan {
  employeeId: string;
  machineCode: string;
  type: 1 | 2;
  scannedAt: Date;
}

export interface WorkSession {
  employeeId: string;
  enteredAt: Date;
  exitedAt: Date;
}

export interface OTDailyRecord {
  workDate: string;
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  factoryId: FactoryId;
  shiftCode: "day" | "office" | "transport10" | "transport12" | "night";
  isSunday: boolean;
  enteredAt: string;
  exitedAt: string;
  ot1Before: number;
  ot1After: number;
  ot2Before: number;
  ot2After: number;
  ot3Before: number;
  ot3After: number;
  totalOtBefore: number;
  totalOtAfter: number;
  ot1: number;
  ot2: number;
  ot3: number;
  totalOt: number;
  otPay: number;
  notes: string;
}

export interface PeriodSelection {
  month: number;
  year: number;
  period: 1 | 2;
}

export interface PeriodDay {
  key: string;
  date: string;
  dayNumber: number;
  weekdayShort: string;
}

export interface OTSummaryRow {
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  workDays: number;
  ot1: number;
  ot2: number;
  ot3: number;
  totalOt: number;
  otPay: number;
  otPay1x5: number;
  otPay2x: number;
  otPay3x: number;
  dayTotals: Record<string, number>;
  daySessions: Record<
    string,
    Array<{
      enteredAt: string;
      exitedAt: string;
      otBefore: number;
      otAfter: number;
      otTotal: number;
    }>
  >;
}

export interface OTSummaryResponse {
  periodLabel: string;
  selection: PeriodSelection;
  days: PeriodDay[];
  rows: OTSummaryRow[];
  totals: {
    workDays: number;
    ot1: number;
    ot2: number;
    ot3: number;
    totalOt: number;
    otPay: number;
    otPay1x5: number;
    otPay2x: number;
    otPay3x: number;
  };
  recordCount: number;
  lastUpdatedAt: string | null;
}
