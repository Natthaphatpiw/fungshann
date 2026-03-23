import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { createHash } from "node:crypto";

import { buildPeriodLabel, getPeriodRange, toIsoDate } from "@/lib/periods";
import { chunkArray, fetchAllRows, getSupabaseAdmin } from "@/lib/supabase";
import { FactoryId, OtRequestHistoryResponse, OtRequestHistoryRow, PeriodSelection } from "@/lib/types";

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const OPENAI_MODEL = "gpt-4.1";
export const MAX_OT_REQUEST_FILES = 5;
const THAILAND_TIME_ZONE = "Asia/Bangkok";

interface EmployeeNameRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  department: string | null;
}

interface RequestInterval {
  startMinute: number;
  endMinute: number;
}

interface ExtractedOtRequestEntry {
  sequence: string;
  requestDate: string;
  firstName: string;
  lastName: string;
  workTimeLabel: string;
  requestRange: RequestInterval | null;
  hasEmployeeSignature: boolean;
  hasSupervisorSignature: boolean;
  sourceFileName: string;
  originalRow: Record<string, unknown>;
  employeeId: string | null;
  correctedName: string;
  llmSource: string;
}

interface OTDailyRequestRow {
  id: number;
  factory_id: FactoryId;
  work_date: string;
  employee_id: string;
  entered_at: string;
  exited_at: string;
  ot1_before: number;
  ot1_after: number;
  ot2_before: number;
  ot2_after: number;
  ot3_before: number;
  ot3_after: number;
}

interface NameCorrection {
  rawName: string;
  correctedFirstName: string;
  correctedLastName: string;
}

export interface OtRequestUploadResult {
  batchId: number;
  processedFileCount: number;
  duplicateFileCount: number;
  extractedEntryCount: number;
  matchedEntryCount: number;
  unmatchedNames: string[];
  updatedOtRowCount: number;
  loggedRequestCount: number;
  statusCounts: Record<string, number>;
}

interface ExistingBatchRow {
  id: number;
  metadata: {
    sourceFileHashes?: string[];
  } | null;
}

interface StoredRequestEntryRow {
  employee_id: string | null;
  request_date: string;
  request_start_minute: number | null;
  request_end_minute: number | null;
  has_employee_signature: boolean;
  has_supervisor_signature: boolean;
}

interface OtRequestLogInsertRow {
  batch_id: number;
  factory_id: FactoryId;
  period_no: number;
  period_month: number;
  period_year: number;
  request_date: string;
  employee_id: string | null;
  employee_name: string;
  department: string;
  request_time_label: string;
  requested_hours: number;
  approved_ot1: number;
  approved_ot2: number;
  approved_ot3: number;
  approved_total: number;
  request_status: string;
  uploader_username: string;
  metadata: Record<string, unknown>;
}

interface OtRequestLogDbRow {
  id: number;
  batch_id: number;
  factory_id: FactoryId;
  request_date: string;
  employee_id: string | null;
  employee_name: string;
  department: string;
  request_time_label: string;
  requested_hours: number;
  approved_ot1: number;
  approved_ot2: number;
  approved_ot3: number;
  approved_total: number;
  request_status: string;
  uploader_username: string;
  created_at: string;
}

interface CurrentBatchGroup {
  employeeId: string | null;
  employeeName: string;
  department: string;
  requestDate: string;
  requestIntervals: RequestInterval[];
  requestLabels: string[];
  unsignedCount: number;
}

function cleanEnvValue(value: string | undefined): string {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function getAnyEnv(names: string[]): string {
  for (const name of names) {
    const value = cleanEnvValue(process.env[name]);
    if (value) {
      return value;
    }
  }
  return "";
}

function roundTwo(value: number): number {
  return Number(value.toFixed(2));
}

function roundDownHalfHour(hours: number): number {
  if (hours <= 0) {
    return 0;
  }
  return Math.floor(hours * 2) / 2;
}

function normalizePersonName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(นาย|นางสาว|น\.ส\.|นส\.|นาง|คุณ|mr\.?|mrs\.?|ms\.?|miss)\s*/i, "")
    .replace(/[\s.]/g, "");
}

async function computeFileHash(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}

function buildFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

function parseDateToIso(value: string, fallbackDate: string): string {
  const normalized = value.trim().replace(/[/.]/g, "-");
  if (!normalized) {
    return fallbackDate;
  }

  const ymd = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const dmy = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return fallbackDate;
}

function parseWorkTimeRange(value: string): RequestInterval | null {
  const normalized = value
    .trim()
    .replace(/ถึง/g, "-")
    .replace(/[–—~]/g, "-")
    .replace(/\s+/g, "");

  const matched = normalized.match(/(\d{1,2})[.:](\d{2})-(\d{1,2})[.:](\d{2})/);
  if (!matched) {
    return null;
  }

  const startHour = Number(matched[1]);
  const startMinute = Number(matched[2]);
  const endHour = Number(matched[3]);
  const endMinute = Number(matched[4]);

  if (
    Number.isNaN(startHour) ||
    Number.isNaN(startMinute) ||
    Number.isNaN(endHour) ||
    Number.isNaN(endMinute) ||
    startHour > 23 ||
    endHour > 23 ||
    startMinute > 59 ||
    endMinute > 59
  ) {
    return null;
  }

  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) {
    end += 24 * 60;
  }

  return { startMinute: start, endMinute: end };
}

function parseJsonArray(text: string): Array<Record<string, unknown>> {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fencedMatch?.[1]?.trim() || trimmed;
  const start = source.indexOf("[");
  const end = source.lastIndexOf("]");
  const jsonText = start >= 0 && end >= 0 ? source.slice(start, end + 1) : source;
  const parsed = JSON.parse(jsonText) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value ?? "").trim().toLowerCase();
  return ["true", "yes", "y", "มี", "ครบ", "1"].includes(text);
}

function mergeIntervals(intervals: RequestInterval[]): RequestInterval[] {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort((left, right) => left.startMinute - right.startMinute);
  const merged: RequestInterval[] = [{ ...sorted[0] }];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = merged[merged.length - 1];
    if (current.startMinute <= previous.endMinute) {
      previous.endMinute = Math.max(previous.endMinute, current.endMinute);
      continue;
    }
    merged.push({ ...current });
  }

  return merged;
}

function formatMinuteLabel(totalMinutes: number): string {
  const minutesInDay = 24 * 60;
  const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatIntervalLabel(interval: RequestInterval): string {
  const endMinute =
    interval.endMinute > 24 * 60 ? interval.endMinute - 24 * 60 : interval.endMinute;
  return `${formatMinuteLabel(interval.startMinute)}-${formatMinuteLabel(endMinute)}`;
}

function formatIntervalsLabel(intervals: RequestInterval[]): string {
  return mergeIntervals(intervals)
    .map((interval) => formatIntervalLabel(interval))
    .join(", ");
}

function sumRequestedHours(intervals: RequestInterval[]): number {
  const merged = mergeIntervals(intervals);
  const totalHours = merged.reduce(
    (total, interval) => total + (interval.endMinute - interval.startMinute) / 60,
    0
  );
  return roundDownHalfHour(totalHours);
}

function formatTimePartsInThailand(date: Date): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: THAILAND_TIME_ZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0
  };
}

function toSessionMinuteRange(enteredAtIso: string, exitedAtIso: string): RequestInterval | null {
  const enteredAt = new Date(enteredAtIso);
  const exitedAt = new Date(exitedAtIso);
  if (Number.isNaN(enteredAt.getTime()) || Number.isNaN(exitedAt.getTime())) {
    return null;
  }

  const enteredTime = formatTimePartsInThailand(enteredAt);
  const exitedTime = formatTimePartsInThailand(exitedAt);
  const startMinute = enteredTime.hour * 60 + enteredTime.minute;
  let endMinute = exitedTime.hour * 60 + exitedTime.minute;
  if (endMinute <= startMinute) {
    endMinute += 24 * 60;
  }
  return { startMinute, endMinute };
}

function overlapMinuteRange(left: RequestInterval, right: RequestInterval): number {
  const start = Math.max(left.startMinute, right.startMinute);
  const end = Math.min(left.endMinute, right.endMinute);
  return Math.max(0, end - start);
}

function calcRequestedHoursForSession(
  enteredAtIso: string,
  exitedAtIso: string,
  requestIntervals: RequestInterval[]
): number {
  if (requestIntervals.length === 0) {
    return 0;
  }

  const sessionRange = toSessionMinuteRange(enteredAtIso, exitedAtIso);
  if (!sessionRange) {
    return 0;
  }

  const overlapMinutes = requestIntervals.reduce(
    (total, interval) => total + overlapMinuteRange(sessionRange, interval),
    0
  );
  return roundDownHalfHour(overlapMinutes / 60);
}

function allocateApprovedHours(
  actualByType: [number, number, number],
  approvedTotal: number
): [number, number, number] {
  const [actualOt1, actualOt2, actualOt3] = actualByType;
  const actualTotal = actualOt1 + actualOt2 + actualOt3;

  if (actualTotal <= 0 || approvedTotal <= 0) {
    return [0, 0, 0];
  }

  const ot1 = roundTwo((approvedTotal * actualOt1) / actualTotal);
  const ot2 = roundTwo((approvedTotal * actualOt2) / actualTotal);
  const ot3 = roundTwo(Math.max(0, approvedTotal - ot1 - ot2));

  return [
    Math.min(actualOt1, ot1),
    Math.min(actualOt2, ot2),
    Math.min(actualOt3, ot3)
  ];
}

async function extractRowsWithGemini(
  apiKey: string,
  files: File[]
): Promise<Array<Omit<ExtractedOtRequestEntry, "employeeId" | "correctedName" | "llmSource">>> {
  const ai = new GoogleGenAI({ apiKey });
  const extracted: Array<Omit<ExtractedOtRequestEntry, "employeeId" | "correctedName" | "llmSource">> = [];

  const prompt =
    "สกัดข้อมูลจากภาพใบขอโอทีให้ออกเป็น JSON array เท่านั้น โดยแต่ละรายการต้องมีคีย์: " +
    "\"วันที่\", \"ลำดับ\", \"ชื่อ\", \"สกุล\", \"เวลาที่ทำงาน\", " +
    "\"มีลายเซ็นพนักงานไหม\", \"มีลายเซ็นหัวหน้างานไหม\". " +
    "หากไม่มีค่าให้ใส่ค่าว่าง และ boolean ให้เป็น true/false เท่านั้น";

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: file.type || "image/jpeg",
                data: buffer.toString("base64")
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.1
      }
    });

    const text = response.text || "[]";
    const rows = parseJsonArray(text);
    for (const row of rows) {
      extracted.push({
        sequence: String(row["ลำดับ"] ?? "").trim(),
        requestDate: String(row["วันที่"] ?? "").trim(),
        firstName: String(row["ชื่อ"] ?? "").trim(),
        lastName: String(row["สกุล"] ?? "").trim(),
        workTimeLabel: String(row["เวลาที่ทำงาน"] ?? "").trim(),
        requestRange: parseWorkTimeRange(String(row["เวลาที่ทำงาน"] ?? "")),
        hasEmployeeSignature: toBoolean(row["มีลายเซ็นพนักงานไหม"]),
        hasSupervisorSignature: toBoolean(row["มีลายเซ็นหัวหน้างานไหม"]),
        sourceFileName: file.name,
        originalRow: row
      });
    }
  }

  return extracted;
}

async function correctNamesWithOpenAI(
  apiKey: string,
  vectorStoreId: string,
  unresolvedNames: string[]
): Promise<NameCorrection[]> {
  if (unresolvedNames.length === 0) {
    return [];
  }

  const openai = new OpenAI({ apiKey });
  const input = [
    "ช่วยแก้สะกดชื่อ-สกุลพนักงานจากรายการนี้โดยใช้ไฟล์ใน vector store",
    "ส่งออก JSON array เท่านั้น",
    "โครงสร้างแต่ละรายการ: {\"rawName\":\"...\",\"correctedFirstName\":\"...\",\"correctedLastName\":\"...\"}",
    `รายชื่อที่ต้องแก้: ${JSON.stringify(unresolvedNames)}`
  ].join("\n");

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input,
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId]
      }
    ]
  });

  const outputText =
    (response.output_text && response.output_text.trim()) ||
    JSON.stringify(response.output ?? []);
  const rows = parseJsonArray(outputText);

  return rows.map((row) => ({
    rawName: String(row.rawName ?? "").trim(),
    correctedFirstName: String(row.correctedFirstName ?? "").trim(),
    correctedLastName: String(row.correctedLastName ?? "").trim()
  }));
}

export async function processOtRequestUpload(params: {
  factoryId: FactoryId;
  username: string;
  selection: PeriodSelection;
  files: File[];
}): Promise<OtRequestUploadResult> {
  const { factoryId, username, selection, files } = params;

  if (files.length === 0) {
    throw new Error("ไม่พบไฟล์รูปใบคำขอโอที");
  }

  if (files.length > MAX_OT_REQUEST_FILES) {
    throw new Error(`อัปโหลดได้สูงสุด ${MAX_OT_REQUEST_FILES} รูปต่อครั้ง`);
  }

  const geminiKey = getAnyEnv(["GEMINI_API_KEY", "gemini_api_key"]);
  const openaiKey = getAnyEnv(["OPENAI_API_KEY", "openai_api_key"]);
  const vectorStoreId = getAnyEnv(["VECTOR_STORE_ID", "vector_store_id"]);

  if (!geminiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const supabase = getSupabaseAdmin();
  const periodRange = getPeriodRange(selection);
  const fallbackDate = toIsoDate(periodRange.start);
  const periodStart = toIsoDate(periodRange.start);
  const periodEnd = toIsoDate(periodRange.end);

  const batchRows = await fetchAllRows<ExistingBatchRow>(
    "hr_ot_request_batches",
    "id,metadata",
    (query) =>
      query
        .eq("factory_id", factoryId)
        .eq("period_no", selection.period)
        .eq("period_month", selection.month)
        .eq("period_year", selection.year)
        .order("created_at", { ascending: true })
  );

  const existingHashes = new Set<string>();
  for (const batch of batchRows) {
    const hashes = Array.isArray(batch.metadata?.sourceFileHashes)
      ? batch.metadata?.sourceFileHashes
      : [];
    for (const hash of hashes || []) {
      if (typeof hash === "string" && hash.trim()) {
        existingHashes.add(hash.trim());
      }
    }
  }

  const preparedFiles = await Promise.all(
    files.map(async (file) => ({
      file,
      hash: await computeFileHash(file)
    }))
  );

  const seenUploadHashes = new Set<string>();
  const acceptedFiles: Array<{ file: File; hash: string }> = [];
  let duplicateFileCount = 0;

  for (const preparedFile of preparedFiles) {
    if (existingHashes.has(preparedFile.hash) || seenUploadHashes.has(preparedFile.hash)) {
      duplicateFileCount += 1;
      continue;
    }
    seenUploadHashes.add(preparedFile.hash);
    acceptedFiles.push(preparedFile);
  }

  if (acceptedFiles.length === 0) {
    return {
      batchId: 0,
      processedFileCount: 0,
      duplicateFileCount,
      extractedEntryCount: 0,
      matchedEntryCount: 0,
      unmatchedNames: [],
      updatedOtRowCount: 0,
      loggedRequestCount: 0,
      statusCounts: {}
    };
  }

  const { data: createdBatch, error: createBatchError } = await supabase
    .from("hr_ot_request_batches")
    .insert({
      factory_id: factoryId,
      period_no: selection.period,
      period_month: selection.month,
      period_year: selection.year,
      uploader_username: username,
      source_file_count: acceptedFiles.length,
      metadata: {
        sourceFileNames: acceptedFiles.map(({ file }) => file.name),
        sourceFileHashes: acceptedFiles.map(({ hash }) => hash),
        duplicateFileCount
      }
    })
    .select("id")
    .single<{ id: number }>();

  if (createBatchError || !createdBatch) {
    throw new Error(`[hr_ot_request_batches] ${createBatchError?.message || "cannot create batch"}`);
  }

  const batchId = createdBatch.id;

  const employeeRows = await fetchAllRows<EmployeeNameRow>(
    "hr_employees",
    "employee_id,first_name,last_name,department",
    (query) => query.eq("factory_id", factoryId).order("employee_id", { ascending: true })
  );
  const employeeById = new Map<string, { employeeName: string; department: string }>();
  const normalizedEmployeeNameMap = new Map<
    string,
    { employeeId: string; firstName: string; lastName: string }
  >();

  for (const employee of employeeRows) {
    const employeeId = String(employee.employee_id ?? "").trim();
    const firstName = String(employee.first_name ?? "").trim();
    const lastName = String(employee.last_name ?? "").trim();
    const fullName = buildFullName(firstName, lastName);
    normalizedEmployeeNameMap.set(normalizePersonName(fullName), {
      employeeId,
      firstName,
      lastName
    });
    employeeById.set(employeeId, {
      employeeName: fullName,
      department: String(employee.department ?? "").trim()
    });
  }

  const extractedRows = await extractRowsWithGemini(
    geminiKey,
    acceptedFiles.map(({ file }) => file)
  );
  const extractedEntries: ExtractedOtRequestEntry[] = extractedRows.map((row) => ({
    ...row,
    requestDate: parseDateToIso(row.requestDate, fallbackDate),
    employeeId: null,
    correctedName: "",
    llmSource: "gemini"
  }));

  const unresolvedNames: string[] = [];
  for (const entry of extractedEntries) {
    const fullName = buildFullName(entry.firstName, entry.lastName);
    const matched = normalizedEmployeeNameMap.get(normalizePersonName(fullName));
    if (matched) {
      entry.employeeId = matched.employeeId;
      entry.correctedName = buildFullName(matched.firstName, matched.lastName);
      continue;
    }
    unresolvedNames.push(fullName);
  }

  const uniqueUnresolvedNames = [...new Set(unresolvedNames.filter((name) => name.trim().length > 0))];
  if (uniqueUnresolvedNames.length > 0 && openaiKey && vectorStoreId) {
    try {
      const corrections = await correctNamesWithOpenAI(openaiKey, vectorStoreId, uniqueUnresolvedNames);
      const correctionMap = new Map(corrections.map((row) => [row.rawName, row]));
      for (const entry of extractedEntries) {
        if (entry.employeeId) {
          continue;
        }
        const rawName = buildFullName(entry.firstName, entry.lastName);
        const corrected = correctionMap.get(rawName);
        if (!corrected) {
          continue;
        }
        const correctedFullName = buildFullName(corrected.correctedFirstName, corrected.correctedLastName);
        const matched = normalizedEmployeeNameMap.get(normalizePersonName(correctedFullName));
        if (!matched) {
          continue;
        }
        entry.employeeId = matched.employeeId;
        entry.correctedName = buildFullName(matched.firstName, matched.lastName);
        entry.llmSource = "gemini+openai";
      }
    } catch (error) {
      console.error("OpenAI name correction failed", error);
    }
  }

  const unresolvedAfterCorrection = [...new Set(
    extractedEntries
      .filter((entry) => !entry.employeeId)
      .map((entry) => buildFullName(entry.firstName, entry.lastName))
      .filter((name) => name.trim().length > 0)
  )];

  const entryPayload = extractedEntries.map((entry) => ({
    batch_id: batchId,
    factory_id: factoryId,
    request_date: entry.requestDate,
    sequence_no: entry.sequence,
    first_name: entry.firstName,
    last_name: entry.lastName,
    extracted_name: buildFullName(entry.firstName, entry.lastName),
    corrected_name: entry.correctedName,
    employee_id: entry.employeeId,
    work_time_label: entry.workTimeLabel,
    request_start_minute: entry.requestRange?.startMinute ?? null,
    request_end_minute: entry.requestRange?.endMinute ?? null,
    has_employee_signature: entry.hasEmployeeSignature,
    has_supervisor_signature: entry.hasSupervisorSignature,
    llm_source: entry.llmSource,
    row_data: entry.originalRow
  }));

  for (const chunk of chunkArray(entryPayload, 500)) {
    const { error } = await supabase.from("hr_ot_request_entries").insert(chunk);
    if (error) {
      throw new Error(`[hr_ot_request_entries] ${error.message}`);
    }
  }

  const currentBatchGroups = new Map<string, CurrentBatchGroup>();
  for (const entry of extractedEntries) {
    const rawName = buildFullName(entry.firstName, entry.lastName);
    const employeeName = entry.correctedName || rawName;
    const groupKey = entry.employeeId
      ? `matched:${entry.employeeId}|${entry.requestDate}`
      : `unmatched:${employeeName}|${entry.requestDate}`;
    const existingGroup = currentBatchGroups.get(groupKey) ?? {
      employeeId: entry.employeeId,
      employeeName,
      department: entry.employeeId ? employeeById.get(entry.employeeId)?.department || "" : "",
      requestDate: entry.requestDate,
      requestIntervals: [],
      requestLabels: [],
      unsignedCount: 0
    };

    if (entry.requestRange) {
      existingGroup.requestIntervals.push(entry.requestRange);
    }

    if (entry.workTimeLabel.trim()) {
      existingGroup.requestLabels.push(entry.workTimeLabel.trim());
    }

    if (!(entry.hasEmployeeSignature && entry.hasSupervisorSignature && entry.requestRange)) {
      existingGroup.unsignedCount += 1;
    }

    currentBatchGroups.set(groupKey, existingGroup);
  }

  const storedRequestEntries = await fetchAllRows<StoredRequestEntryRow>(
    "hr_ot_request_entries",
    "employee_id,request_date,request_start_minute,request_end_minute,has_employee_signature,has_supervisor_signature",
    (query) =>
      query
        .eq("factory_id", factoryId)
        .gte("request_date", periodStart)
        .lte("request_date", periodEnd)
        .order("request_date", { ascending: true })
        .order("employee_id", { ascending: true })
  );

  const signedRequestIntervalMap = new Map<string, RequestInterval[]>();
  const unsignedRequestCountMap = new Map<string, number>();

  for (const entry of storedRequestEntries) {
    if (!entry.employee_id) {
      continue;
    }
    const key = `${entry.employee_id}|${entry.request_date}`;
    if (
      entry.has_employee_signature &&
      entry.has_supervisor_signature &&
      entry.request_start_minute !== null &&
      entry.request_end_minute !== null
    ) {
      const bucket = signedRequestIntervalMap.get(key) ?? [];
      bucket.push({
        startMinute: entry.request_start_minute,
        endMinute: entry.request_end_minute
      });
      signedRequestIntervalMap.set(key, bucket);
      continue;
    }
    unsignedRequestCountMap.set(key, (unsignedRequestCountMap.get(key) ?? 0) + 1);
  }

  const mergedRequestIntervalsByKey = new Map<string, RequestInterval[]>();
  for (const [key, intervals] of signedRequestIntervalMap.entries()) {
    mergedRequestIntervalsByKey.set(key, mergeIntervals(intervals));
  }

  const otRows = await fetchAllRows<OTDailyRequestRow>(
    "hr_ot_daily",
    "id,factory_id,work_date,employee_id,entered_at,exited_at,ot1_before,ot1_after,ot2_before,ot2_after,ot3_before,ot3_after",
    (query) =>
      query
        .eq("factory_id", factoryId)
        .gte("work_date", periodStart)
        .lte("work_date", periodEnd)
        .order("work_date", { ascending: true })
        .order("employee_id", { ascending: true })
        .order("entered_at", { ascending: true })
  );

  const otRowsByKey = new Map<string, OTDailyRequestRow[]>();
  for (const row of otRows) {
    const key = `${row.employee_id}|${row.work_date}`;
    const bucket = otRowsByKey.get(key) ?? [];
    bucket.push(row);
    otRowsByKey.set(key, bucket);
  }

  const requestLogPayload: OtRequestLogInsertRow[] = [];
  for (const group of currentBatchGroups.values()) {
    const mergedCurrentIntervals = mergeIntervals(group.requestIntervals);
    const uniqueRequestLabels = [...new Set(group.requestLabels.filter(Boolean))];
    const requestTimeLabel =
      mergedCurrentIntervals.length > 0
        ? formatIntervalsLabel(mergedCurrentIntervals)
        : uniqueRequestLabels.join(", ");
    const requestedHours =
      mergedCurrentIntervals.length > 0 ? sumRequestedHours(mergedCurrentIntervals) : 0;

    let approvedOt1 = 0;
    let approvedOt2 = 0;
    let approvedOt3 = 0;
    let approvedTotal = 0;
    let requestStatus = "unsubmitted";

    if (!group.employeeId) {
      requestStatus = "unmatched_name";
    } else {
      const key = `${group.employeeId}|${group.requestDate}`;
      const relatedRows = otRowsByKey.get(key) ?? [];

      if (relatedRows.length === 0) {
        requestStatus = group.unsignedCount > 0 ? "missing_signature" : "no_ot_record";
      } else if (mergedCurrentIntervals.length === 0) {
        requestStatus = group.unsignedCount > 0 ? "missing_signature" : "invalid_time_range";
      } else {
        const actualOt1 = relatedRows.reduce(
          (total, row) => total + Number(row.ot1_before ?? 0) + Number(row.ot1_after ?? 0),
          0
        );
        const actualOt2 = relatedRows.reduce(
          (total, row) => total + Number(row.ot2_before ?? 0) + Number(row.ot2_after ?? 0),
          0
        );
        const actualOt3 = relatedRows.reduce(
          (total, row) => total + Number(row.ot3_before ?? 0) + Number(row.ot3_after ?? 0),
          0
        );
        const actualTotal = roundTwo(actualOt1 + actualOt2 + actualOt3);
        const sessionApprovedTotal = roundTwo(
          relatedRows.reduce(
            (total, row) =>
              total + calcRequestedHoursForSession(row.entered_at, row.exited_at, mergedCurrentIntervals),
            0
          )
        );

        approvedTotal = Math.min(actualTotal, sessionApprovedTotal);
        [approvedOt1, approvedOt2, approvedOt3] = allocateApprovedHours(
          [actualOt1, actualOt2, actualOt3],
          approvedTotal
        );
        approvedOt1 = roundTwo(approvedOt1);
        approvedOt2 = roundTwo(approvedOt2);
        approvedOt3 = roundTwo(approvedOt3);

        if (approvedTotal <= 0) {
          requestStatus = "no_overlap";
        } else if (approvedTotal + 0.001 < actualTotal) {
          requestStatus = "partial";
        } else {
          requestStatus = "approved";
        }
      }
    }

    requestLogPayload.push({
      batch_id: batchId,
      factory_id: factoryId,
      period_no: selection.period,
      period_month: selection.month,
      period_year: selection.year,
      request_date: group.requestDate,
      employee_id: group.employeeId,
      employee_name: group.employeeName,
      department: group.department,
      request_time_label: requestTimeLabel,
      requested_hours: requestedHours,
      approved_ot1: approvedOt1,
      approved_ot2: approvedOt2,
      approved_ot3: approvedOt3,
      approved_total: roundTwo(approvedOt1 + approvedOt2 + approvedOt3),
      request_status: requestStatus,
      uploader_username: username,
      metadata: {
        unsignedCount: group.unsignedCount,
        requestLabels: uniqueRequestLabels
      }
    });
  }

  for (const chunk of chunkArray(requestLogPayload, 500)) {
    const { error } = await supabase.from("hr_ot_request_logs").insert(chunk);
    if (error) {
      throw new Error(`[hr_ot_request_logs] ${error.message}`);
    }
  }

  const otUpdatePayload = otRows.map((row) => {
    const key = `${row.employee_id}|${row.work_date}`;
    const intervals = mergedRequestIntervalsByKey.get(key) ?? [];
    const requestedHours = calcRequestedHoursForSession(row.entered_at, row.exited_at, intervals);
    const unsignedCount = unsignedRequestCountMap.get(key) ?? 0;

    const actualOt1 = Number(row.ot1_before ?? 0) + Number(row.ot1_after ?? 0);
    const actualOt2 = Number(row.ot2_before ?? 0) + Number(row.ot2_after ?? 0);
    const actualOt3 = Number(row.ot3_before ?? 0) + Number(row.ot3_after ?? 0);
    const actualTotal = roundTwo(actualOt1 + actualOt2 + actualOt3);

    let otRequestStatus = "unsubmitted";
    let ot1AfterRequest = 0;
    let ot2AfterRequest = 0;
    let ot3AfterRequest = 0;

    if (actualTotal <= 0) {
      otRequestStatus = "no_ot";
    } else if (intervals.length === 0) {
      otRequestStatus = unsignedCount > 0 ? "missing_signature" : "unsubmitted";
    } else {
      const approvedTotal = Math.min(actualTotal, requestedHours);
      const [approvedOt1, approvedOt2, approvedOt3] = allocateApprovedHours(
        [actualOt1, actualOt2, actualOt3],
        approvedTotal
      );
      ot1AfterRequest = roundTwo(approvedOt1);
      ot2AfterRequest = roundTwo(approvedOt2);
      ot3AfterRequest = roundTwo(approvedOt3);

      if (approvedTotal <= 0) {
        otRequestStatus = "no_overlap";
      } else if (approvedTotal + 0.001 < actualTotal) {
        otRequestStatus = "partial";
      } else {
        otRequestStatus = "approved";
      }
    }

    return {
      id: row.id,
      factory_id: row.factory_id,
      work_date: row.work_date,
      employee_id: row.employee_id,
      entered_at: row.entered_at,
      exited_at: row.exited_at,
      ot_request_status: otRequestStatus,
      ot1_after_request: ot1AfterRequest,
      ot2_after_request: ot2AfterRequest,
      ot3_after_request: ot3AfterRequest
    };
  });

  for (const chunk of chunkArray(otUpdatePayload, 500)) {
    const results = await Promise.all(
      chunk.map((row) =>
        supabase
          .from("hr_ot_daily")
          .update({
            ot_request_status: row.ot_request_status,
            ot1_after_request: row.ot1_after_request,
            ot2_after_request: row.ot2_after_request,
            ot3_after_request: row.ot3_after_request
          })
          .eq("id", row.id)
      )
    );

    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) {
      throw new Error(`[hr_ot_daily] ${failedResult.error.message}`);
    }
  }

  const statusCounts = otUpdatePayload.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.ot_request_status] = (accumulator[row.ot_request_status] ?? 0) + 1;
    return accumulator;
  }, {});

  const { error: updateBatchError } = await supabase
    .from("hr_ot_request_batches")
    .update({
      extracted_entry_count: extractedEntries.length,
      unmatched_name_count: unresolvedAfterCorrection.length,
      metadata: {
        sourceFileNames: acceptedFiles.map(({ file }) => file.name),
        sourceFileHashes: acceptedFiles.map(({ hash }) => hash),
        duplicateFileCount,
        loggedRequestCount: requestLogPayload.length,
        statusCounts
      }
    })
    .eq("id", batchId);

  if (updateBatchError) {
    throw new Error(`[hr_ot_request_batches] ${updateBatchError.message}`);
  }

  return {
    batchId,
    processedFileCount: acceptedFiles.length,
    duplicateFileCount,
    extractedEntryCount: extractedEntries.length,
    matchedEntryCount: extractedEntries.filter((entry) => Boolean(entry.employeeId)).length,
    unmatchedNames: unresolvedAfterCorrection,
    updatedOtRowCount: otUpdatePayload.length,
    loggedRequestCount: requestLogPayload.length,
    statusCounts
  };
}

export async function readOtRequestHistory(
  factoryId: FactoryId,
  selection: PeriodSelection
): Promise<OtRequestHistoryResponse> {
  const rows = await fetchAllRows<OtRequestLogDbRow>(
    "hr_ot_request_logs",
    "id,batch_id,factory_id,request_date,employee_id,employee_name,department,request_time_label,requested_hours,approved_ot1,approved_ot2,approved_ot3,approved_total,request_status,uploader_username,created_at",
    (query) =>
      query
        .eq("factory_id", factoryId)
        .eq("period_no", selection.period)
        .eq("period_month", selection.month)
        .eq("period_year", selection.year)
        .order("created_at", { ascending: false })
        .order("request_date", { ascending: false })
  );

  const mappedRows: OtRequestHistoryRow[] = rows.map((row) => ({
    id: row.id,
    batchId: row.batch_id,
    factoryId: row.factory_id,
    requestDate: row.request_date,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department,
    requestTimeLabel: row.request_time_label,
    requestedHours: Number(row.requested_hours ?? 0),
    approvedOt1: Number(row.approved_ot1 ?? 0),
    approvedOt2: Number(row.approved_ot2 ?? 0),
    approvedOt3: Number(row.approved_ot3 ?? 0),
    approvedTotal: Number(row.approved_total ?? 0),
    requestStatus: row.request_status,
    uploaderUsername: row.uploader_username,
    createdAt: row.created_at
  }));

  return {
    rows: mappedRows,
    periodLabel: buildPeriodLabel(selection),
    recordCount: mappedRows.length
  };
}
