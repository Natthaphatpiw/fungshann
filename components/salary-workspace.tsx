"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { formatPlainDate } from "@/lib/datetime";

type PeriodSelection = {
  month: number;
  year: number;
  period: 1 | 2;
};

type WageRow = Record<string, string>;

type WageStatusPayload = {
  headers: string[];
  rows: WageRow[];
  payDate: string;
  selection: PeriodSelection;
  periodLabel: string;
  otCheck: {
    ready: boolean;
    message: string;
    requiredWindow: { start: string; end: string };
    missingBoundaryDates: string[];
  };
};

type WageCalculatePayload = {
  created: boolean;
  message: string;
  headers: string[];
  rows: WageRow[];
  payDate: string;
  selection: PeriodSelection;
  periodLabel: string;
};

const COMPACT_COLUMNS = [
  "ลำดับ",
  "รหัสพนักงาน",
  "ชื่อ",
  "สกุล",
  "การจ้างงาน",
  "จำนวนวันที่ทำงาน",
  "ค่าจ้าง",
  "ค่าโอทีOT1",
  "ค่าโอทีOT2",
  "ค่าโอทีOT3",
  "ค่าจ้างสุทธิ"
];

function buildDefaultSelection(): PeriodSelection {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    period: 1
  };
}

function parseMoney(value: string): number {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return 0;
  }
  const cleaned = trimmed.replace(/[^\d,.-]/g, "");
  if (!cleaned) {
    return 0;
  }
  const normalised = cleaned.includes(",") && !cleaned.includes(".")
    ? cleaned.replace(",", ".")
    : cleaned.replace(/,/g, "");
  const number = Number(normalised);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function SalaryWorkspace() {
  const router = useRouter();
  const [selectionDraft, setSelectionDraft] = useState<PeriodSelection>(buildDefaultSelection);
  const [selection, setSelection] = useState<PeriodSelection | null>(null);
  const [showPeriodModal, setShowPeriodModal] = useState(true);
  const [showOtIncompleteModal, setShowOtIncompleteModal] = useState(false);
  const [showPreCalculateModal, setShowPreCalculateModal] = useState(false);
  const [statusPayload, setStatusPayload] = useState<WageStatusPayload | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<WageRow[]>([]);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const visibleColumns = useMemo(() => {
    if (isTableExpanded) {
      return headers;
    }

    const compact = COMPACT_COLUMNS.filter((column) => headers.includes(column));
    if (compact.length > 0) {
      return compact;
    }

    return headers.slice(0, Math.min(headers.length, 10));
  }, [headers, isTableExpanded]);

  const netTotal = useMemo(
    () => rows.reduce((total, row) => total + parseMoney(row["ค่าจ้างสุทธิ"] || "0"), 0),
    [rows]
  );

  async function loadStatus(nextSelection: PeriodSelection) {
    setIsChecking(true);
    setErrorMessage("");
    setStatusMessage("");
    setShowOtIncompleteModal(false);
    setShowPreCalculateModal(false);

    const query = new URLSearchParams({
      period: String(nextSelection.period),
      month: String(nextSelection.month),
      year: String(nextSelection.year)
    });
    const response = await fetch(`/api/wage/status?${query.toString()}`, { cache: "no-store" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setStatusPayload(null);
      setHeaders([]);
      setRows([]);
      setErrorMessage(payload?.message || "ไม่สามารถตรวจสอบสถานะงวดค่าจ้างได้");
      setIsChecking(false);
      return;
    }

    const payload = (await response.json()) as WageStatusPayload;
    setStatusPayload(payload);
    setHeaders(payload.headers);

    if (!payload.otCheck.ready) {
      setRows([]);
      setStatusMessage(payload.otCheck.message);
      setShowOtIncompleteModal(true);
      setIsChecking(false);
      return;
    }

    if (payload.rows.length > 0) {
      setRows(payload.rows);
      setStatusMessage("พบข้อมูลค่าจ้างงวดนี้ในระบบแล้ว");
    } else {
      setRows([]);
      setStatusMessage("ยังไม่เคยคำนวณค่าจ้างในงวดนี้");
      setShowPreCalculateModal(true);
    }

    setIsChecking(false);
  }

  async function handleCalculate() {
    if (!selection) {
      return;
    }

    setIsCalculating(true);
    setErrorMessage("");
    const response = await fetch("/api/wage/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(selection)
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      const message = payload?.message || "ไม่สามารถคำนวณค่าจ้างได้";
      setErrorMessage(message);
      setIsCalculating(false);

      if (response.status === 409) {
        setShowPreCalculateModal(false);
        setShowOtIncompleteModal(true);
      }
      return;
    }

    const payload = (await response.json()) as WageCalculatePayload;
    setRows(payload.rows);
    setHeaders(payload.headers);
    setStatusMessage(payload.message);
    setShowPreCalculateModal(false);
    setIsCalculating(false);
  }

  useEffect(() => {
    if (!selection) {
      return;
    }

    void loadStatus(selection);
  }, [selection]);

  return (
    <section className="page-stack">
      <div className="content-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Payroll Workflow</div>
            <h1>เงินเดือน / ค่าจ้าง</h1>
            <p className="muted-text">
              ระบบจะตรวจสอบข้อมูล OT ก่อนทุกครั้ง หากข้อมูลครบจึงแสดงหรือคำนวณค่าจ้างของงวดที่เลือก
            </p>
          </div>
        </div>

        <div className="toolbar-row">
          <div className="toolbar-left">
            <button className="secondary-button" type="button" onClick={() => setShowPeriodModal(true)}>
              เลือกงวด
            </button>
            {selection && statusPayload?.otCheck.ready && rows.length === 0 ? (
              <button className="primary-button" type="button" onClick={() => setShowPreCalculateModal(true)}>
                คำนวณค่าจ้างงวดนี้
              </button>
            ) : null}
          </div>
        </div>

        {statusMessage ? <div className="status-banner info">{statusMessage}</div> : null}
        {errorMessage ? <div className="status-banner error">{errorMessage}</div> : null}

        <div className="summary-strip">
          <div className="summary-pill">
            <span>งวดที่เลือก</span>
            <strong>{statusPayload?.periodLabel || "ยังไม่ได้เลือกงวด"}</strong>
          </div>
          <div className="summary-pill">
            <span>งวดวันที่จ่าย</span>
            <strong>{formatPlainDate(statusPayload?.payDate)}</strong>
          </div>
          <div className="summary-pill">
            <span>จำนวนพนักงาน</span>
            <strong>{rows.length > 0 ? `${rows.length} คน` : "-"}</strong>
          </div>
          <div className="summary-pill">
            <span>ค่าจ้างสุทธิรวม</span>
            <strong>{rows.length > 0 ? formatMoney(netTotal) : "-"}</strong>
          </div>
        </div>

        <div className={`table-shell ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
          <div className="table-toolbar">
            <div className="table-toolbar-info">
              <strong>{isTableExpanded ? "โหมดขยายตาราง" : "โหมดกะทัดรัด"}</strong>
              <span>
                {isTableExpanded
                  ? "แสดงข้อมูลทุกคอลัมม์ของงวดที่เลือกจากฐานข้อมูล"
                  : "แสดงคอลัมม์หลักให้พอดีกับหน้าจอ"}
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

          {isChecking ? (
            <div className="empty-state">กำลังตรวจสอบข้อมูลงวดค่าจ้าง...</div>
          ) : rows.length > 0 ? (
            <div className={`table-scroll ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
              <table className={`data-table ${isTableExpanded ? "expanded" : "compact"}`}>
                <thead>
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row["รหัสพนักงาน"] || "emp"}-${index}`}>
                      {visibleColumns.map((column) => (
                        <td key={`${column}-${index}`} className={column.includes("ค่า") ? "numeric" : ""}>
                          {row[column] || "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">เลือกงวดเพื่อแสดงข้อมูลค่าจ้าง</div>
          )}
        </div>
      </div>

      {showPeriodModal ? (
        <div className="modal-overlay" onClick={() => setShowPeriodModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="eyebrow">เลือกงวดคำนวณ</div>
                <h2>กำหนดช่วงข้อมูลค่าจ้าง</h2>
              </div>
              <button
                className="icon-button modal-close"
                type="button"
                onClick={() => setShowPeriodModal(false)}
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
              <button className="secondary-button" type="button" onClick={() => setShowPeriodModal(false)}>
                ยกเลิก
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setSelection({ ...selectionDraft });
                  setShowPeriodModal(false);
                }}
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showOtIncompleteModal ? (
        <div className="modal-overlay" onClick={() => setShowOtIncompleteModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="eyebrow">ข้อมูล OT ยังไม่ครบ</div>
                <h2>ไม่สามารถคำนวณค่าจ้างงวดนี้ได้</h2>
              </div>
              <button
                className="icon-button modal-close"
                type="button"
                onClick={() => setShowOtIncompleteModal(false)}
                aria-label="ปิดหน้าต่าง"
                title="ปิดหน้าต่าง"
              >
                ×
              </button>
            </div>

            <div className="modal-section">
              <p className="muted-text">{statusPayload?.otCheck.message || "ข้อมูล OT ยังไม่ครบ"}</p>
              <p className="muted-text" style={{ marginTop: 8 }}>
                ช่วงที่ต้องมีข้อมูลอย่างน้อย:{" "}
                {statusPayload
                  ? `${statusPayload.otCheck.requiredWindow.start} ถึง ${statusPayload.otCheck.requiredWindow.end}`
                  : "-"}
              </p>
              {statusPayload?.otCheck.missingBoundaryDates.length ? (
                <p className="muted-text" style={{ marginTop: 8 }}>
                  วันที่ยังขาด: {statusPayload.otCheck.missingBoundaryDates.join(", ")}
                </p>
              ) : null}
            </div>

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setShowOtIncompleteModal(false)}>
                ปิด
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => router.push("/dashboard/ot")}
              >
                ยืนยันกลับหน้า OT
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPreCalculateModal ? (
        <div className="modal-overlay" onClick={() => setShowPreCalculateModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="eyebrow">ยังไม่เคยคำนวณงวดนี้</div>
                <h2>ต้องการแก้ไขข้อมูลเงินได้ / เงินหักก่อนหรือไม่</h2>
              </div>
              <button
                className="icon-button modal-close"
                type="button"
                onClick={() => setShowPreCalculateModal(false)}
                aria-label="ปิดหน้าต่าง"
                title="ปิดหน้าต่าง"
              >
                ×
              </button>
            </div>

            <div className="modal-section">
              <p className="muted-text">
                หากต้องการแก้ไขคอลัมม์เงินพิเศษหรือเงินหัก ให้ไปที่หน้า{" "}
                <strong>รายละเอียดพนักงาน</strong> ก่อน แล้วค่อยกลับมาคำนวณค่าจ้างใหม่
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => router.push("/dashboard/employees")}
              >
                ไปหน้าแก้ไขพนักงาน
              </button>
              <button className="primary-button" type="button" onClick={handleCalculate} disabled={isCalculating}>
                {isCalculating ? "กำลังคำนวณ..." : "ไม่แก้ไข คำนวณทันที"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
