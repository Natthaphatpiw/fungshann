import { PeriodDay, PeriodSelection } from "@/lib/types";

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค."
];

const THAI_WEEKDAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function buildDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function clampSelection(selection: Partial<PeriodSelection>): PeriodSelection {
  const now = new Date();
  const month = selection.month && selection.month >= 1 && selection.month <= 12 ? selection.month : now.getMonth() + 1;
  const year = selection.year && selection.year >= 2020 && selection.year <= 2100 ? selection.year : now.getFullYear();
  const period = selection.period === 2 ? 2 : 1;

  return { month, year, period };
}

export function getPeriodRange(selection: PeriodSelection): { start: Date; end: Date } {
  if (selection.period === 1) {
    const previousMonth = selection.month === 1 ? 12 : selection.month - 1;
    const previousYear = selection.month === 1 ? selection.year - 1 : selection.year;
    return {
      start: buildDate(previousYear, previousMonth, 26),
      end: buildDate(selection.year, selection.month, 10)
    };
  }

  return {
    start: buildDate(selection.year, selection.month, 11),
    end: buildDate(selection.year, selection.month, 25)
  };
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(date: Date): string {
  const dateLabel = `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${date.getFullYear()}`;
  const timeLabel = `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
  return `${dateLabel} ${timeLabel}`;
}

export function enumeratePeriodDays(selection: PeriodSelection): PeriodDay[] {
  const range = getPeriodRange(selection);
  const dates: PeriodDay[] = [];
  const pointer = new Date(range.start);

  while (pointer <= range.end) {
    dates.push({
      key: toIsoDate(pointer),
      date: toIsoDate(pointer),
      dayNumber: pointer.getDate(),
      weekdayShort: THAI_WEEKDAYS_SHORT[pointer.getDay()]
    });
    pointer.setDate(pointer.getDate() + 1);
  }

  return dates;
}

export function buildPeriodLabel(selection: PeriodSelection): string {
  const { start, end } = getPeriodRange(selection);

  return `งวดที่ ${selection.period} (${start.getDate()} ${THAI_MONTHS_SHORT[start.getMonth()]} - ${end.getDate()} ${THAI_MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()})`;
}
