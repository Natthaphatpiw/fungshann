import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const cwd = process.cwd();

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function parseCsvContent(content) {
  const normalised = content.replace(/^\uFEFF/, "");
  const lines = normalised.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""]));
  });

  return { headers, rows };
}

async function parseCsvFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return parseCsvContent(content);
}

function cleanEnvValue(value) {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

async function readDotEnvLocal() {
  const envPath = path.join(cwd, ".env.local");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    const map = {};
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const index = line.indexOf("=");
        if (index <= 0) {
          return;
        }
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        map[key] = cleanEnvValue(value);
      });
    return map;
  } catch {
    return {};
  }
}

function parseScanDateTime(dateLabel, timeLabel) {
  const [day, month, year] = String(dateLabel ?? "").split("-").map(Number);
  const [hour, minute, second] = String(timeLabel ?? "").split(":").map(Number);

  if ([day, month, year, hour, minute].some((value) => Number.isNaN(value))) {
    return null;
  }

  return new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    Number.isNaN(second) ? 0 : second,
    0
  );
}

function chunkArray(items, chunkSize = 500) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(String(value ?? "").trim());
  return Number.isFinite(numeric) ? numeric : fallback;
}

async function migrateEmployees(supabase, factoryId, fileName) {
  const filePath = path.join(cwd, fileName);
  const { headers, rows } = await parseCsvFile(filePath);

  await supabase.from("hr_employee_schemas").upsert(
    {
      factory_id: factoryId,
      columns: headers
    },
    { onConflict: "factory_id" }
  );

  await supabase.from("hr_employees").delete().eq("factory_id", factoryId);

  const dedupedByEmployeeId = new Map();

  rows.forEach((row, index) => {
      const employeeId = String(row["รหัสพนักงาน"] ?? "").trim();
      if (!employeeId) {
        return;
      }

      const rowData = Object.fromEntries(headers.map((header) => [header, String(row[header] ?? "")]));
      dedupedByEmployeeId.set(employeeId, {
        factory_id: factoryId,
        employee_id: employeeId,
        order_no: toNumber(row["ลำดับ"], index + 1),
        first_name: String(row["ชื่อ"] ?? ""),
        last_name: String(row["สกุล"] ?? ""),
        department: String(row["แผนก"] ?? ""),
        position: String(row["ตำแหน่ง"] ?? ""),
        row_data: rowData
      });
  });

  const payload = [...dedupedByEmployeeId.values()].sort((left, right) => {
    if (left.order_no !== right.order_no) {
      return left.order_no - right.order_no;
    }

    return left.employee_id.localeCompare(right.employee_id);
  });

  for (const chunk of chunkArray(payload, 500)) {
    const { error } = await supabase.from("hr_employees").upsert(chunk, {
      onConflict: "factory_id,employee_id"
    });
    if (error) {
      throw new Error(`[hr_employees] ${error.message}`);
    }
  }

  return payload.length;
}

async function migrateScans(supabase) {
  const filePath = path.join(cwd, "scan.csv");
  try {
    await fs.access(filePath);
  } catch {
    return 0;
  }

  const { rows } = await parseCsvFile(filePath);
  const payload = rows
    .map((row) => {
      const factoryLabel = String(row["โรงงาน"] ?? "").trim();
      const factoryId = factoryLabel === "โรงงาน 3" ? "factory3" : "factory1";
      const iso = String(row["วันที่เวลาแสกน"] ?? "").trim();
      const parsed =
        iso && !Number.isNaN(new Date(iso).getTime())
          ? new Date(iso)
          : parseScanDateTime(row["วันที่แสกน"], row["เวลาแสกน"]);

      if (!parsed || Number.isNaN(parsed.getTime())) {
        return null;
      }

      return {
        factory_id: factoryId,
        machine_code: String(row["รหัสเครื่อง"] ?? "").trim(),
        scanned_at: parsed.toISOString(),
        employee_id: String(row["รหัสพนักงาน"] ?? "").trim(),
        scan_type: String(row["ประเภท"] ?? "").trim() === "2" ? 2 : 1
      };
    })
    .filter(
      (row) =>
        row &&
        row.machine_code.length > 0 &&
        row.employee_id.length > 0
    );

  for (const chunk of chunkArray(payload, 500)) {
    const { error } = await supabase.from("hr_scan_events").upsert(chunk, {
      onConflict: "factory_id,machine_code,scanned_at,employee_id,scan_type",
      ignoreDuplicates: true
    });
    if (error) {
      throw new Error(`[hr_scan_events] ${error.message}`);
    }
  }

  return payload.length;
}

async function migrateOtDaily(supabase, factoryId, filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return 0;
  }

  const { rows } = await parseCsvFile(filePath);
  await supabase.from("hr_ot_daily").delete().eq("factory_id", factoryId);

  const payload = rows
    .map((row) => ({
      factory_id: factoryId,
      work_date: String(row.workDate ?? ""),
      employee_id: String(row.employeeId ?? ""),
      employee_name: String(row.employeeName ?? ""),
      department: String(row.department ?? ""),
      position: String(row.position ?? ""),
      shift_code: String(row.shiftCode ?? "day"),
      is_sunday: String(row.isSunday ?? "") === "true",
      entered_at: String(row.enteredAt ?? ""),
      exited_at: String(row.exitedAt ?? ""),
      ot1_before: Number(row.ot1Before ?? 0),
      ot1_after: Number(row.ot1After ?? row.ot1 ?? 0),
      ot2_before: Number(row.ot2Before ?? 0),
      ot2_after: Number(row.ot2After ?? row.ot2 ?? 0),
      ot3_before: Number(row.ot3Before ?? 0),
      ot3_after: Number(row.ot3After ?? row.ot3 ?? 0),
      total_ot_before: Number(row.totalOtBefore ?? 0),
      total_ot_after: Number(row.totalOtAfter ?? row.totalOt ?? 0),
      ot1: Number(row.ot1 ?? 0),
      ot2: Number(row.ot2 ?? 0),
      ot3: Number(row.ot3 ?? 0),
      total_ot: Number(row.totalOt ?? 0),
      ot_request_status: String(row.otRequestStatus ?? "unsubmitted"),
      ot1_after_request: Number(row.ot1AfterRequest ?? 0),
      ot2_after_request: Number(row.ot2AfterRequest ?? 0),
      ot3_after_request: Number(row.ot3AfterRequest ?? 0),
      ot_pay: Number(row.otPay ?? 0),
      notes: String(row.notes ?? "")
    }))
    .filter(
      (row) =>
        row.work_date &&
        row.employee_id &&
        row.entered_at &&
        row.exited_at
    );

  for (const chunk of chunkArray(payload, 500)) {
    const { error } = await supabase.from("hr_ot_daily").upsert(chunk, {
      onConflict: "factory_id,work_date,employee_id,entered_at,exited_at"
    });
    if (error) {
      throw new Error(`[hr_ot_daily] ${error.message}`);
    }
  }

  return payload.length;
}

function derivePeriodInfo(payDate) {
  const parsed = new Date(payDate);
  if (Number.isNaN(parsed.getTime())) {
    return {
      periodNo: 1,
      periodMonth: 1,
      periodYear: 2000,
      periodStart: payDate,
      periodEnd: payDate
    };
  }

  const day = parsed.getDate();
  const month = parsed.getMonth() + 1;
  const year = parsed.getFullYear();
  const periodNo = day <= 10 ? 1 : 2;

  return {
    periodNo,
    periodMonth: month,
    periodYear: year,
    periodStart: payDate,
    periodEnd: payDate
  };
}

async function migrateWages(supabase) {
  const filePath = path.join(cwd, "wage.csv");
  try {
    await fs.access(filePath);
  } catch {
    return 0;
  }

  const { headers, rows } = await parseCsvFile(filePath);
  await supabase.from("hr_wages").delete().eq("factory_id", "factory1");

  const payload = rows
    .map((row, index) => {
      const employeeId = String(row["รหัสพนักงาน"] ?? "").trim();
      const payDate = String(row["งวดวันที่จ่าย"] ?? "").trim();
      if (!employeeId || !payDate) {
        return null;
      }

      const { periodNo, periodMonth, periodYear, periodStart, periodEnd } = derivePeriodInfo(payDate);
      const rowData = Object.fromEntries(headers.map((header) => [header, String(row[header] ?? "")]));
      rowData["โรงงาน"] = "โรงงาน 1";

      return {
        factory_id: "factory1",
        pay_date: payDate,
        period_no: periodNo,
        period_month: periodMonth,
        period_year: periodYear,
        period_start: periodStart,
        period_end: periodEnd,
        employee_id: employeeId,
        seq_no: toNumber(row["ลำดับ"], index + 1),
        row_data: rowData
      };
    })
    .filter(Boolean);

  for (const chunk of chunkArray(payload, 500)) {
    const { error } = await supabase.from("hr_wages").upsert(chunk, {
      onConflict: "factory_id,pay_date,employee_id"
    });
    if (error) {
      throw new Error(`[hr_wages] ${error.message}`);
    }
  }

  return payload.length;
}

async function main() {
  const localEnv = await readDotEnvLocal();
  const supabaseUrl = cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRole = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY || localEnv.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const employee1Count = await migrateEmployees(supabase, "factory1", "employee1.csv");
  const employee3Count = await migrateEmployees(supabase, "factory3", "employee3.csv");
  const scanCount = await migrateScans(supabase);
  const otFactory1Count = await migrateOtDaily(supabase, "factory1", path.join(cwd, "storage", "ot_factory1.csv"));
  const otFactory3Count = await migrateOtDaily(supabase, "factory3", path.join(cwd, "storage", "ot_factory3.csv"));
  const wageCount = await migrateWages(supabase);

  console.log("Migration complete");
  console.log(`- hr_employees factory1: ${employee1Count}`);
  console.log(`- hr_employees factory3: ${employee3Count}`);
  console.log(`- hr_scan_events: ${scanCount}`);
  console.log(`- hr_ot_daily factory1: ${otFactory1Count}`);
  console.log(`- hr_ot_daily factory3: ${otFactory3Count}`);
  console.log(`- hr_wages: ${wageCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
