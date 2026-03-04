import { promises as fs } from "node:fs";
import path from "node:path";

import { FactoryId } from "@/lib/types";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
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

export function parseCsvContent(content: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const normalised = content.replace(/^\uFEFF/, "");
  const lines = normalised.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = fields[index] ?? "";
    });

    return row;
  });

  return { headers, rows };
}

export function serialiseCsvRow(values: Array<string | number | boolean>): string {
  return values
    .map((value) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replaceAll('"', '""')}"`;
      }
      return text;
    })
    .join(",");
}

export async function parseCsvFile(filePath: string): Promise<Record<string, string>[]> {
  const content = await fs.readFile(filePath, "utf8");
  return parseCsvContent(content).rows;
}

export async function readCsvHeaders(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, "utf8");
  return parseCsvContent(content).headers;
}

export async function writeCsvFile(
  filePath: string,
  headers: string[],
  rows: Array<Record<string, string | number | boolean>>
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = [
    serialiseCsvRow(headers),
    ...rows.map((row) => serialiseCsvRow(headers.map((header) => row[header] ?? "")))
  ].join("\n");
  await fs.writeFile(filePath, `${content}\n`, "utf8");
}

export function getEmployeeCsvPath(factoryId: FactoryId): string {
  return path.join(
    process.cwd(),
    factoryId === "factory1" ? "employee1.csv" : "employee3.csv"
  );
}

export function getOtStoragePath(factoryId: FactoryId): string {
  return path.join(process.cwd(), "storage", `ot_${factoryId}.csv`);
}

export function getScanStoragePath(): string {
  return path.join(process.cwd(), "scan.csv");
}
