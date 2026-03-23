"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { OTSummaryResponse, OTSummaryRow, SessionAccount } from "@/lib/types";

type PeriodSelection = ReturnType<typeof buildDefaultSelection>;
type SortDirection = "asc" | "desc";
type SortKey =
  | ""
  | "employeeId"
  | "employeeName"
  | "department"
  | "position"
  | "workDays"
  | "ot1"
  | "ot2"
  | "ot3"
  | "ot1AfterRequest"
  | "ot2AfterRequest"
  | "ot3AfterRequest"
  | "otPay"
  | "otPay1x5"
  | "otPay2x"
  | "otPay3x"
  | `day:${string}`;

function buildDefaultSelection() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    period: 1 as 1 | 2
  };
}

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "th");
}

function formatThaiTime(isoDateTime: string) {
  const date = new Date(isoDateTime);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  // Scan timestamps are persisted as UTC-normalised values from server parsing.
  // Showing as UTC keeps the same wall-clock time as the source attendance file.
  return date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
}

function buildDayHoverText(row: OTSummaryRow, dayKey: string) {
  const sessions = row.daySessions[dayKey] || [];

  if (sessions.length === 0) {
    return "ไม่มีข้อมูลเวลาเข้า-ออก";
  }

  return sessions
    .map(
      (session, index) =>
        `รอบ ${index + 1}: เข้า ${formatThaiTime(session.enteredAt)} ออก ${formatThaiTime(
          session.exitedAt
        )} (OT หลัง ${session.otAfter.toFixed(2)} ชม.${
          session.otBefore > 0 ? ` | ก่อน ${session.otBefore.toFixed(2)} ชม.` : ""
        })`
    )
    .join("\n");
}

function buildRowHoverText(row: OTSummaryRow) {
  const entries = Object.entries(row.daySessions).filter(([, sessions]) => sessions.length > 0);

  if (entries.length === 0) {
    return "ไม่มีข้อมูลเวลาเข้า-ออก";
  }

  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, sessions]) => {
      const sessionText = sessions
        .map(
          (session) =>
            `${formatThaiTime(session.enteredAt)}-${formatThaiTime(session.exitedAt)} (หลัง ${session.otAfter.toFixed(
              2
            )}${session.otBefore > 0 ? ` | ก่อน ${session.otBefore.toFixed(2)}` : ""})`
        )
        .join(", ");
      return `${dayKey}: ${sessionText}`;
    })
    .join("\n");
}

function sortRows(rows: OTSummaryRow[], sortKey: SortKey, sortDirection: SortDirection) {
  if (!sortKey) {
    return [...rows];
  }

  const multiplier = sortDirection === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    let comparison = 0;

    switch (sortKey) {
      case "employeeId":
        comparison = compareText(left.employeeId, right.employeeId);
        break;
      case "employeeName":
        comparison = compareText(left.employeeName, right.employeeName);
        break;
      case "department":
        comparison = compareText(left.department, right.department);
        break;
      case "position":
        comparison = compareText(left.position, right.position);
        break;
      case "workDays":
        comparison = left.workDays - right.workDays;
        break;
      case "ot1":
        comparison = left.ot1 - right.ot1;
        break;
      case "ot2":
        comparison = left.ot2 - right.ot2;
        break;
      case "ot3":
        comparison = left.ot3 - right.ot3;
        break;
      case "ot1AfterRequest":
        comparison = left.ot1AfterRequest - right.ot1AfterRequest;
        break;
      case "ot2AfterRequest":
        comparison = left.ot2AfterRequest - right.ot2AfterRequest;
        break;
      case "ot3AfterRequest":
        comparison = left.ot3AfterRequest - right.ot3AfterRequest;
        break;
      case "otPay":
        comparison = left.otPay - right.otPay;
        break;
      case "otPay1x5":
        comparison = left.otPay1x5 - right.otPay1x5;
        break;
      case "otPay2x":
        comparison = left.otPay2x - right.otPay2x;
        break;
      case "otPay3x":
        comparison = left.otPay3x - right.otPay3x;
        break;
      default:
        if (sortKey.startsWith("day:")) {
          const dayKey = sortKey.slice(4);
          comparison = (left.dayTotals[dayKey] || 0) - (right.dayTotals[dayKey] || 0);
        }
        break;
    }

    if (comparison === 0) {
      return compareText(left.employeeId, right.employeeId) * multiplier;
    }

    return comparison * multiplier;
  });
}

interface OtWorkspaceProps {
  session: SessionAccount;
}

export function OtWorkspace({ session }: OtWorkspaceProps) {
  const isVisitor = session.role === "visitor";
  const lockedDepartment = isVisitor ? session.departmentScope?.trim() || "" : "";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectionDraft, setSelectionDraft] = useState(buildDefaultSelection);
  const [selection, setSelection] = useState<PeriodSelection | null>(null);
  const [summary, setSummary] = useState<OTSummaryResponse | null>(null);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRequestImporting, setIsRequestImporting] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(true);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestUploadFiles, setRequestUploadFiles] = useState<File[]>([]);
  const [requestPreviewUrls, setRequestPreviewUrls] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeePickerDraftIds, setEmployeePickerDraftIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");

  const exportHref = selection
    ? `/api/ot/export?${new URLSearchParams({
        period: String(selection.period),
        month: String(selection.month),
        year: String(selection.year)
      }).toString()}`
    : "#";

  async function loadSummary(nextSelection: PeriodSelection) {
    const query = new URLSearchParams({
      period: String(nextSelection.period),
      month: String(nextSelection.month),
      year: String(nextSelection.year)
    });

    setIsLoading(true);
    setErrorMessage("");

    const response = await fetch(`/api/ot/summary?${query.toString()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      setErrorMessage("ไม่สามารถโหลดข้อมูล OT ได้");
      setSummary(null);
      setIsLoading(false);
      return;
    }

    const payload = (await response.json()) as OTSummaryResponse;
    setSummary(payload);
    setIsLoading(false);
  }

  useEffect(() => {
    if (!selection) {
      return;
    }

    void loadSummary(selection);
  }, [selection]);

  useEffect(() => {
    if (!summary) {
      return;
    }

    const availableIds = new Set(summary.rows.map((row) => row.employeeId));
    const availableDepartments = new Set(
      summary.rows
        .map((row) => row.department.trim())
        .filter((department) => department.length > 0)
    );

    setSelectedEmployeeIds((current) => current.filter((employeeId) => availableIds.has(employeeId)));
    setEmployeePickerDraftIds((current) =>
      current.filter((employeeId) => availableIds.has(employeeId))
    );
    setDepartmentFilter((current) => {
      if (lockedDepartment) {
        return lockedDepartment;
      }

      return current === "ALL" || availableDepartments.has(current) ? current : "ALL";
    });
  }, [lockedDepartment, summary]);

  useEffect(() => {
    if (requestUploadFiles.length === 0) {
      setRequestPreviewUrls([]);
      return;
    }

    const previewUrls = requestUploadFiles.map((file) => URL.createObjectURL(file));
    setRequestPreviewUrls(previewUrls);

    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [requestUploadFiles]);

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    if (isVisitor) {
      setErrorMessage("บัญชี visitor ดูข้อมูลได้อย่างเดียว ไม่สามารถนำเข้าข้อมูลสแกนหน้า");
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsImporting(true);
    setStatusMessage("");
    setErrorMessage("");

    const response = await fetch("/api/ot/import", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setErrorMessage(payload?.message || "อัปโหลดไม่สำเร็จ");
      setIsImporting(false);
      event.target.value = "";
      return;
    }

    const payload = (await response.json()) as { message: string };
    setStatusMessage(payload.message);
    setIsImporting(false);

    if (selection) {
      void loadSummary(selection);
    }

    event.target.value = "";
  }

  function handleRequestFileSelection(event: ChangeEvent<HTMLInputElement>) {
    if (isVisitor) {
      setErrorMessage("บัญชี visitor ดูข้อมูลได้อย่างเดียว ไม่สามารถอัปโหลดใบคำขอ OT");
      event.target.value = "";
      return;
    }

    const files = event.target.files ? [...event.target.files] : [];
    if (files.length === 0) {
      event.target.value = "";
      return;
    }

    if (files.length > 5) {
      setErrorMessage("อัปโหลดได้สูงสุด 5 รูปต่อครั้ง");
      event.target.value = "";
      return;
    }

    setRequestUploadFiles(files);
    setErrorMessage("");
    event.target.value = "";
  }

  async function submitRequestImport() {
    if (isVisitor) {
      setErrorMessage("บัญชี visitor ไม่มีสิทธิ์อัปโหลดใบคำขอ OT");
      return;
    }

    if (!selection) {
      setErrorMessage("กรุณาเลือกงวดก่อนอัปโหลดใบคำขอโอที");
      return;
    }

    if (requestUploadFiles.length === 0) {
      setErrorMessage("กรุณาเลือกรูปใบคำขอโอทีก่อนยืนยัน");
      return;
    }

    if (requestUploadFiles.length > 5) {
      setErrorMessage("อัปโหลดได้สูงสุด 5 รูปต่อครั้ง");
      return;
    }

    const formData = new FormData();
    requestUploadFiles.forEach((file) => formData.append("files", file));
    formData.append("period", String(selection.period));
    formData.append("month", String(selection.month));
    formData.append("year", String(selection.year));

    setIsRequestImporting(true);
    setStatusMessage("");
    setErrorMessage("");

    const response = await fetch("/api/ot/request/upload", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json().catch(() => null)) as
      | { message?: string; unmatchedNames?: string[] }
      | null;

    if (!response.ok) {
      setErrorMessage(payload?.message || "อัปโหลดใบคำขอโอทีไม่สำเร็จ");
      setIsRequestImporting(false);
      return;
    }

    const unmatchedNames = payload?.unmatchedNames || [];
    const unmatchedLabel =
      unmatchedNames.length > 0
        ? ` | ชื่อที่ยังจับคู่ไม่ได้: ${unmatchedNames.slice(0, 10).join(", ")}${
            unmatchedNames.length > 10 ? " ..." : ""
          }`
        : "";

    setStatusMessage(`${payload?.message || "อัปโหลดใบคำขอโอทีสำเร็จ"}${unmatchedLabel}`);
    setIsRequestImporting(false);
    setShowRequestModal(false);
    setRequestUploadFiles([]);
    void loadSummary(selection);
  }

  function openRequestModal() {
    if (isVisitor) {
      setErrorMessage("บัญชี visitor ไม่มีสิทธิ์อัปโหลดใบคำขอ OT");
      return;
    }

    setRequestUploadFiles([]);
    setShowRequestModal(true);
    setErrorMessage("");
  }

  function closeRequestModal() {
    if (isRequestImporting) {
      return;
    }
    setShowRequestModal(false);
    setRequestUploadFiles([]);
  }

  function closePeriodModal() {
    setShowPeriodModal(false);
  }

  function openEmployeePicker() {
    setEmployeePickerDraftIds(selectedEmployeeIds);
    setEmployeeSearch("");
    setShowEmployeeModal(true);
  }

  function resetViewState() {
    setDepartmentFilter(lockedDepartment || "ALL");
    setSortKey("");
    setSortDirection("asc");
    setSelectedEmployeeIds([]);
    setEmployeePickerDraftIds([]);
    setEmployeeSearch("");
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  const departmentOptions = summary
    ? [...new Set(summary.rows.map((row) => row.department.trim()).filter(Boolean))].sort(compareText)
    : [];

  const filteredRows = (() => {
    if (!summary) {
      return [];
    }

    let rows = [...summary.rows];

    if (departmentFilter !== "ALL") {
      rows = rows.filter((row) => row.department.trim() === departmentFilter);
    }

    if (selectedEmployeeIds.length > 0) {
      const selectedSet = new Set(selectedEmployeeIds);
      rows = rows.filter((row) => selectedSet.has(row.employeeId));
    }

    return sortRows(rows, sortKey, sortDirection);
  })();

  const employeePickerRows = (() => {
    if (!summary) {
      return [];
    }

    const keyword = employeeSearch.trim().toLowerCase();

    if (!keyword) {
      return summary.rows;
    }

    return summary.rows.filter((row) =>
      [row.employeeId, row.employeeName, row.department, row.position]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  })();

  const visiblePickerIds = employeePickerRows.map((row) => row.employeeId);

  const visibleTotals = (() => {
    const dayTotals = Object.fromEntries(
      (summary?.days || []).map((day) => [
        day.key,
        Number(
          filteredRows
            .reduce((total, row) => total + (row.dayTotals[day.key] || 0), 0)
            .toFixed(2)
        )
      ])
    );

    return {
      workDays: filteredRows.reduce((total, row) => total + row.workDays, 0),
      ot1: Number(filteredRows.reduce((total, row) => total + row.ot1, 0).toFixed(2)),
      ot2: Number(filteredRows.reduce((total, row) => total + row.ot2, 0).toFixed(2)),
      ot3: Number(filteredRows.reduce((total, row) => total + row.ot3, 0).toFixed(2)),
      ot1AfterRequest: Number(
        filteredRows.reduce((total, row) => total + row.ot1AfterRequest, 0).toFixed(2)
      ),
      ot2AfterRequest: Number(
        filteredRows.reduce((total, row) => total + row.ot2AfterRequest, 0).toFixed(2)
      ),
      ot3AfterRequest: Number(
        filteredRows.reduce((total, row) => total + row.ot3AfterRequest, 0).toFixed(2)
      ),
      otPay: Number(filteredRows.reduce((total, row) => total + row.otPay, 0).toFixed(2)),
      otPay1x5: Number(filteredRows.reduce((total, row) => total + row.otPay1x5, 0).toFixed(2)),
      otPay2x: Number(filteredRows.reduce((total, row) => total + row.otPay2x, 0).toFixed(2)),
      otPay3x: Number(filteredRows.reduce((total, row) => total + row.otPay3x, 0).toFixed(2)),
      dayTotals
    };
  })();

  const visibleColumnCount =
    2 +
    (isTableExpanded ? 2 : 0) +
    1 +
    3 +
    (isTableExpanded ? 3 : 0) +
    1 +
    (isTableExpanded ? 3 : 0) +
    (isTableExpanded ? summary?.days.length || 0 : 0);

  function renderSortButton(label: string, nextKey: SortKey) {
    const isActive = sortKey === nextKey;

    return (
      <button
        className={`table-sort-button ${isActive ? "active" : ""}`}
        type="button"
        onClick={() => toggleSort(nextKey)}
      >
        <span>{label}</span>
        <span className="sort-indicator">
          {isActive ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  }

  function renderDaySortButton(dayKey: string, dayNumber: number, weekdayShort: string) {
    const nextKey = `day:${dayKey}` as SortKey;
    const isActive = sortKey === nextKey;

    return (
      <button
        className={`table-sort-button day-sort-button ${isActive ? "active" : ""}`}
        type="button"
        onClick={() => toggleSort(nextKey)}
      >
        <div className="day-header">
          <strong>{dayNumber}</strong>
          <span>{weekdayShort}</span>
        </div>
        <span className="sort-indicator">
          {isActive ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  }

  return (
    <section className="page-stack">
      <div className="content-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Overtime Workflow</div>
            <h1>ชั่วโมง OT</h1>
            <p className="muted-text">
              อัปโหลดไฟล์สแกนหน้าแบบ `.txt` ระบบจะกันข้อมูลซ้ำ, บันทึกสะสมลงฐานข้อมูล,
              คำนวณ OT จากข้อมูลสะสม (แยก OT ก่อนเข้างาน/หลังเลิกงาน), รองรับอัปโหลดใบคำขอโอที (สูงสุด 5 รูป/ครั้ง)
              เพื่อสกัดข้อมูลและเทียบกับ OT จริง
            </p>
            {isVisitor ? (
              <p className="muted-text">{`สิทธิ์ visitor จะแสดงเฉพาะข้อมูล OT ของแผนก ${lockedDepartment || "-"}`}</p>
            ) : null}
          </div>
        </div>

        <div className="toolbar-row">
          <div className="toolbar-left">
            <a
              className={`excel-button ${!selection ? "disabled-link" : ""}`}
              href={selection ? exportHref : undefined}
            >
              Export XLSX
            </a>
          </div>
          <div className="toolbar-right">
            <button className="secondary-button" type="button" onClick={() => setShowPeriodModal(true)}>
              เลือกงวด
            </button>
            {!isVisitor ? (
              <button
                className="secondary-button"
                type="button"
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
              >
                {isImporting ? "กำลังประมวลผล..." : "Import ไฟล์"}
              </button>
            ) : null}
            {!isVisitor ? (
              <button
                className="secondary-button"
                type="button"
                disabled={isRequestImporting}
                onClick={openRequestModal}
              >
                Upload ใบคำขอ OT
              </button>
            ) : null}
            <input
              ref={fileInputRef}
              className="hidden-input"
              type="file"
              accept=".txt,text/plain"
              onChange={handleImport}
            />
            <input
              ref={requestFileInputRef}
              className="hidden-input"
              type="file"
              accept="image/*"
              multiple
              onChange={handleRequestFileSelection}
            />
          </div>
        </div>

        {statusMessage ? <div className="status-banner success">{statusMessage}</div> : null}
        {errorMessage ? <div className="status-banner error">{errorMessage}</div> : null}

        <div className="summary-strip">
          <div className="summary-pill">
            <span>งวดที่เลือก</span>
            <strong>{summary?.periodLabel || "ยังไม่ได้เลือกงวด"}</strong>
          </div>
          <div className="summary-pill">
            <span>รายการที่จับคู่เข้า-ออกได้</span>
            <strong>{summary ? `${summary.recordCount} รายการ` : "-"}</strong>
          </div>
          <div className="summary-pill">
            <span>อัปเดตล่าสุด</span>
            <strong>
              {summary?.lastUpdatedAt
                ? new Date(summary.lastUpdatedAt).toLocaleString("th-TH")
                : "ยังไม่มีข้อมูลนำเข้า"}
            </strong>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <span>วันทำงานรวม</span>
            <strong>{summary ? String(summary.totals.workDays) : "0"}</strong>
          </div>
          <div className="metric-card">
            <span>รวม OT หลังเลิกงาน</span>
            <strong>{summary?.totals.totalOt.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>OT 1.5 หลังเลิกงาน</span>
            <strong>{summary?.totals.ot1.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>OT 2.0 หลังเลิกงาน</span>
            <strong>{summary?.totals.ot2.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>OT 3.0 หลังเลิกงาน</span>
            <strong>{summary?.totals.ot3.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>OT1 หลังทำเรื่อง</span>
            <strong>{summary?.totals.ot1AfterRequest.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>OT2 หลังทำเรื่อง</span>
            <strong>{summary?.totals.ot2AfterRequest.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>OT3 หลังทำเรื่อง</span>
            <strong>{summary?.totals.ot3AfterRequest.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>มูลค่า OT</span>
            <strong>{summary ? formatCurrency(summary.totals.otPay) : "0.00"}</strong>
          </div>
        </div>

        <div className="toolbar-row">
          <div className="toolbar-left">
            {isVisitor ? (
              <div className="summary-pill compact-summary-pill">
                <span>สิทธิ์แสดงข้อมูล</span>
                <strong>{lockedDepartment || "-"}</strong>
              </div>
            ) : (
              <label className="field compact-field">
                <span>ฟิลเตอร์แผนก</span>
                <select
                  className="toolbar-select"
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                >
                  <option value="ALL">ทุกแผนก</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="secondary-button" type="button" onClick={openEmployeePicker}>
              เลือกพนักงาน
            </button>
            <button className="secondary-button" type="button" onClick={resetViewState}>
              ล้าง
            </button>
          </div>
          <div className="toolbar-right">
            <div className="toolbar-note">
              {selectedEmployeeIds.length > 0
                ? `กำลังแสดงพนักงานที่เลือก ${selectedEmployeeIds.length} คน`
                : "กำลังแสดงพนักงานทุกคน"}
            </div>
          </div>
        </div>

        <div className={`table-shell ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
          <div className="table-toolbar">
            <div className="table-toolbar-info">
              <strong>{isTableExpanded ? "โหมดขยายตาราง" : "โหมดกะทัดรัด"}</strong>
              <span>
                {isTableExpanded
                  ? "แสดงแผนก, ตำแหน่ง, จำนวนวันทำงาน, ตัวคูณ OT และยอดรายวันครบทั้งหมด"
                  : "แสดงคอลัมน์หลักให้พอดีกับหน้าจอโดยยังสามารถ sort ได้ทุกคอลัมน์ที่มองเห็น"}
              </span>
            </div>
            <button
              className="secondary-button small-button"
              type="button"
              onClick={() => setIsTableExpanded((current) => !current)}
            >
              {isTableExpanded ? "หดตาราง" : "ขยายตาราง"}
            </button>
          </div>

          {isLoading ? (
            <div className="empty-state">กำลังโหลดข้อมูล...</div>
          ) : summary ? (
            <div className={`table-scroll ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
              <table className={`data-table ot-table ${isTableExpanded ? "expanded" : "compact"}`}>
                <thead>
                  <tr>
                    <th>{renderSortButton("รหัสพนักงาน", "employeeId")}</th>
                    <th>{renderSortButton("ชื่อพนักงาน", "employeeName")}</th>
                    {isTableExpanded ? <th>{renderSortButton("แผนก", "department")}</th> : null}
                    {isTableExpanded ? <th>{renderSortButton("ตำแหน่ง", "position")}</th> : null}
                    <th>{renderSortButton("วันทำงาน", "workDays")}</th>
                    <th>{renderSortButton("OT 1.5 หลัง", "ot1")}</th>
                    <th>{renderSortButton("OT 2 หลัง", "ot2")}</th>
                    <th>{renderSortButton("OT 3 หลัง", "ot3")}</th>
                    {isTableExpanded ? (
                      <th>{renderSortButton("OT1-หลังทำเรื่อง", "ot1AfterRequest")}</th>
                    ) : null}
                    {isTableExpanded ? (
                      <th>{renderSortButton("OT2-หลังทำเรื่อง", "ot2AfterRequest")}</th>
                    ) : null}
                    {isTableExpanded ? (
                      <th>{renderSortButton("OT3-request", "ot3AfterRequest")}</th>
                    ) : null}
                    <th>{renderSortButton("มูลค่า OT", "otPay")}</th>
                    {isTableExpanded ? <th>{renderSortButton("OT 1.5 หลัง (x1.5)", "otPay1x5")}</th> : null}
                    {isTableExpanded ? <th>{renderSortButton("OT 2 หลัง (x2)", "otPay2x")}</th> : null}
                    {isTableExpanded ? <th>{renderSortButton("OT 3 หลัง (x3)", "otPay3x")}</th> : null}
                    {isTableExpanded
                      ? summary.days.map((day) => (
                          <th key={day.key}>
                            {renderDaySortButton(day.key, day.dayNumber, day.weekdayShort)}
                          </th>
                        ))
                      : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length > 0 ? (
                    filteredRows.map((row) => (
                      <tr key={row.employeeId}>
                        <td>{row.employeeId}</td>
                        <td>{row.employeeName || "-"}</td>
                        {isTableExpanded ? <td>{row.department || "-"}</td> : null}
                        {isTableExpanded ? <td>{row.position || "-"}</td> : null}
                        <td className="numeric strong">{row.workDays}</td>
                        <td className="numeric" title={buildRowHoverText(row)}>
                          {row.ot1.toFixed(2)}
                        </td>
                        <td className="numeric" title={buildRowHoverText(row)}>
                          {row.ot2.toFixed(2)}
                        </td>
                        <td className="numeric" title={buildRowHoverText(row)}>
                          {row.ot3.toFixed(2)}
                        </td>
                        {isTableExpanded ? (
                          <td className="numeric strong">{row.ot1AfterRequest.toFixed(2)}</td>
                        ) : null}
                        {isTableExpanded ? (
                          <td className="numeric strong">{row.ot2AfterRequest.toFixed(2)}</td>
                        ) : null}
                        {isTableExpanded ? (
                          <td className="numeric strong">{row.ot3AfterRequest.toFixed(2)}</td>
                        ) : null}
                        <td className="numeric strong">{formatCurrency(row.otPay)}</td>
                        {isTableExpanded ? (
                          <td className="numeric">{row.otPay1x5.toFixed(2)}</td>
                        ) : null}
                        {isTableExpanded ? (
                          <td className="numeric">{row.otPay2x.toFixed(2)}</td>
                        ) : null}
                        {isTableExpanded ? (
                          <td className="numeric">{row.otPay3x.toFixed(2)}</td>
                        ) : null}
                        {isTableExpanded
                          ? summary.days.map((day) => (
                              <td key={`${row.employeeId}-${day.key}`} className="numeric">
                                <span
                                  className={`day-chip ${
                                    row.dayTotals[day.key] > 0 ? "has-value" : ""
                                  }`}
                                  title={buildDayHoverText(row, day.key)}
                                >
                                  {row.dayTotals[day.key] > 0
                                    ? row.dayTotals[day.key].toFixed(2)
                                    : ""}
                                </span>
                              </td>
                            ))
                          : null}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-table-cell" colSpan={visibleColumnCount}>
                        ไม่พบข้อมูลตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  )}

                  {filteredRows.length > 0 ? (
                    <tr className="total-row">
                      <td>TOTAL</td>
                      <td>{`${filteredRows.length} คน`}</td>
                      {isTableExpanded ? <td>-</td> : null}
                      {isTableExpanded ? <td>-</td> : null}
                      <td className="numeric strong">{visibleTotals.workDays}</td>
                      <td className="numeric strong">{visibleTotals.ot1.toFixed(2)}</td>
                      <td className="numeric strong">{visibleTotals.ot2.toFixed(2)}</td>
                      <td className="numeric strong">{visibleTotals.ot3.toFixed(2)}</td>
                      {isTableExpanded ? (
                        <td className="numeric strong">{visibleTotals.ot1AfterRequest.toFixed(2)}</td>
                      ) : null}
                      {isTableExpanded ? (
                        <td className="numeric strong">{visibleTotals.ot2AfterRequest.toFixed(2)}</td>
                      ) : null}
                      {isTableExpanded ? (
                        <td className="numeric strong">{visibleTotals.ot3AfterRequest.toFixed(2)}</td>
                      ) : null}
                      <td className="numeric strong">{formatCurrency(visibleTotals.otPay)}</td>
                      {isTableExpanded ? (
                        <td className="numeric strong">{visibleTotals.otPay1x5.toFixed(2)}</td>
                      ) : null}
                      {isTableExpanded ? (
                        <td className="numeric strong">{visibleTotals.otPay2x.toFixed(2)}</td>
                      ) : null}
                      {isTableExpanded ? (
                        <td className="numeric strong">{visibleTotals.otPay3x.toFixed(2)}</td>
                      ) : null}
                      {isTableExpanded
                        ? summary.days.map((day) => (
                            <td key={`total-${day.key}`} className="numeric strong">
                              {visibleTotals.dayTotals[day.key] > 0
                                ? visibleTotals.dayTotals[day.key].toFixed(2)
                                : "-"}
                            </td>
                          ))
                        : null}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">เลือกงวดเพื่อเริ่มต้นแสดงข้อมูล</div>
          )}
        </div>
      </div>

      {showPeriodModal ? (
        <div className="modal-overlay" onClick={closePeriodModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="eyebrow">เลือกงวดคำนวณ</div>
                <h2>กำหนดช่วงข้อมูล OT</h2>
              </div>
              <button
                className="icon-button modal-close"
                type="button"
                onClick={closePeriodModal}
                aria-label="ปิดหน้าต่าง"
                title="ปิดหน้าต่าง"
              >
                ×
              </button>
            </div>
            <div className="modal-grid">
              <label className="field">
                <span>เลือกงวด</span>
                <select
                  value={selectionDraft.period}
                  onChange={(event) =>
                    setSelectionDraft((current) => ({
                      ...current,
                      period: Number(event.target.value) === 2 ? 2 : 1
                    }))
                  }
                >
                  <option value={1}>งวดที่ 1 (26-10)</option>
                  <option value={2}>งวดที่ 2 (11-25)</option>
                </select>
              </label>

              <label className="field">
                <span>เลือกเดือน</span>
                <select
                  value={selectionDraft.month}
                  onChange={(event) =>
                    setSelectionDraft((current) => ({
                      ...current,
                      month: Number(event.target.value)
                    }))
                  }
                >
                  {Array.from({ length: 12 }).map((_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>เลือกปี</span>
                <select
                  value={selectionDraft.year}
                  onChange={(event) =>
                    setSelectionDraft((current) => ({
                      ...current,
                      year: Number(event.target.value)
                    }))
                  }
                >
                  {Array.from({ length: 5 }).map((_, index) => {
                    const year = new Date().getFullYear() - 1 + index;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            <div className="modal-actions">
              {selection ? (
                <button className="secondary-button" type="button" onClick={closePeriodModal}>
                  ยกเลิก
                </button>
              ) : null}
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setSelection({ ...selectionDraft });
                  closePeriodModal();
                }}
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEmployeeModal ? (
        <div className="modal-overlay" onClick={() => setShowEmployeeModal(false)}>
          <div className="modal-card wide-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="eyebrow">เลือกข้อมูลที่จะแสดง</div>
                <h2>เลือกพนักงานในตาราง OT</h2>
              </div>
              <button
                className="icon-button modal-close"
                type="button"
                onClick={() => setShowEmployeeModal(false)}
                aria-label="ปิดหน้าต่าง"
                title="ปิดหน้าต่าง"
              >
                ×
              </button>
            </div>

            <div className="modal-section">
              <label className="field">
                <span>ค้นหาจากชื่อหรือรหัสพนักงาน</span>
                <input
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                  placeholder="พิมพ์ชื่อหรือรหัสพนักงาน"
                />
              </label>

              <div className="inline-actions">
                <button
                  className="secondary-button small-button"
                  type="button"
                  onClick={() => setEmployeePickerDraftIds(visiblePickerIds)}
                >
                  เลือกทั้งหมดที่ค้นเจอ
                </button>
                <button
                  className="secondary-button small-button"
                  type="button"
                  onClick={() => setEmployeePickerDraftIds([])}
                >
                  แสดงทุกคน
                </button>
              </div>

              <div className="picker-list">
                {employeePickerRows.map((row) => {
                  const isChecked = employeePickerDraftIds.includes(row.employeeId);

                  return (
                    <label className="picker-item" key={row.employeeId}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) =>
                          setEmployeePickerDraftIds((current) => {
                            if (event.target.checked) {
                              return [...new Set([...current, row.employeeId])];
                            }

                            return current.filter((employeeId) => employeeId !== row.employeeId);
                          })
                        }
                      />
                      <span className="picker-item-text">
                        <strong>{row.employeeId}</strong>
                        <span>{row.employeeName || "-"}</span>
                        <small>{[row.department, row.position].filter(Boolean).join(" / ") || "-"}</small>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowEmployeeModal(false)}>
                  ยกเลิก
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    setSelectedEmployeeIds(employeePickerDraftIds);
                    setShowEmployeeModal(false);
                  }}
                >
                  แสดงตามที่เลือก
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showRequestModal ? (
        <div className="modal-overlay" onClick={closeRequestModal}>
          <div className="modal-card request-upload-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="eyebrow">ใบคำขอโอที</div>
                <h2>อัปโหลดรูปใบคำขอ OT</h2>
                <p className="muted-text request-upload-hint">
                  รองรับสูงสุด 5 รูปต่อครั้ง เลือกรูปแล้วตรวจสอบ preview ก่อนกดยืนยัน
                </p>
              </div>
              <button
                className="icon-button modal-close"
                type="button"
                onClick={closeRequestModal}
                aria-label="ปิดหน้าต่าง"
                title="ปิดหน้าต่าง"
              >
                ×
              </button>
            </div>

            <div className="request-upload-summary">
              <span>งวดที่กำลังทำรายการ</span>
              <strong>{summary?.periodLabel || "ยังไม่ได้เลือกงวด"}</strong>
            </div>

            <div className="inline-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={isRequestImporting}
                onClick={() => requestFileInputRef.current?.click()}
              >
                เลือกรูปใบคำขอ OT
              </button>
              <button
                className="secondary-button small-button"
                type="button"
                disabled={isRequestImporting || requestUploadFiles.length === 0}
                onClick={() => setRequestUploadFiles([])}
              >
                ล้างรายการรูป
              </button>
              <span className="toolbar-note">{`เลือกแล้ว ${requestUploadFiles.length} / 5 รูป`}</span>
            </div>

            {requestUploadFiles.length > 0 ? (
              <div className="request-preview-grid">
                {requestUploadFiles.map((file, index) => (
                  <figure className="request-preview-card" key={`${file.name}-${index}`}>
                    <img
                      className="request-preview-image"
                      src={requestPreviewUrls[index]}
                      alt={`preview-${file.name}`}
                    />
                    <figcaption className="request-preview-name">{file.name}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="empty-state request-upload-empty">
                ยังไม่ได้เลือกรูปใบคำขอโอที
              </div>
            )}

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeRequestModal}>
                ยกเลิก
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={isRequestImporting || requestUploadFiles.length === 0 || !selection}
                onClick={() => {
                  void submitRequestImport();
                }}
              >
                {isRequestImporting ? "กำลังสกัดใบขอ OT..." : "ยืนยันคำขอโอที"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
