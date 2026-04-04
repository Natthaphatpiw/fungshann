const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const FALLBACK_TEXT = "-";

type InstantValue = string | number | Date | null | undefined;

const bangkokDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: BANGKOK_TIME_ZONE
});

const bangkokDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: BANGKOK_TIME_ZONE
});

const bangkokDateTimeWithSecondsFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: BANGKOK_TIME_ZONE
});

const bangkokTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: BANGKOK_TIME_ZONE
});

const bangkokTimeWithSecondsFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: BANGKOK_TIME_ZONE
});

function parseInstant(value: InstantValue): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(instant.getTime())) {
    return null;
  }

  return instant;
}

function normaliseFormatterOutput(value: string) {
  return value.replace(",", "");
}

export function formatBangkokDateTime(
  value: InstantValue,
  options?: {
    includeSeconds?: boolean;
    fallback?: string;
  }
) {
  const instant = parseInstant(value);

  if (!instant) {
    return options?.fallback ?? FALLBACK_TEXT;
  }

  const formatter = options?.includeSeconds
    ? bangkokDateTimeWithSecondsFormatter
    : bangkokDateTimeFormatter;

  return normaliseFormatterOutput(formatter.format(instant));
}

export function formatBangkokTime(
  value: InstantValue,
  options?: {
    includeSeconds?: boolean;
    fallback?: string;
  }
) {
  const instant = parseInstant(value);

  if (!instant) {
    return options?.fallback ?? FALLBACK_TEXT;
  }

  return (options?.includeSeconds ? bangkokTimeWithSecondsFormatter : bangkokTimeFormatter).format(
    instant
  );
}

export function formatBangkokDate(
  value: InstantValue,
  options?: {
    fallback?: string;
  }
) {
  const instant = parseInstant(value);

  if (!instant) {
    return options?.fallback ?? FALLBACK_TEXT;
  }

  return bangkokDateFormatter.format(instant);
}

export function formatPlainDate(
  value: string | null | undefined,
  options?: {
    fallback?: string;
  }
) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return options?.fallback ?? FALLBACK_TEXT;
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return trimmed;
  }

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export { BANGKOK_TIME_ZONE };
