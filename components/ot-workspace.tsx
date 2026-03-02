"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { OTSummaryResponse } from "@/lib/types";

function buildDefaultSelection() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    period: 1 as 1 | 2
  };
}

export function OtWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectionDraft, setSelectionDraft] = useState(buildDefaultSelection);
  const [selection, setSelection] = useState<ReturnType<typeof buildDefaultSelection> | null>(null);
  const [summary, setSummary] = useState<OTSummaryResponse | null>(null);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const exportHref = selection
    ? `/api/ot/export?${new URLSearchParams({
        period: String(selection.period),
        month: String(selection.month),
        year: String(selection.year)
      }).toString()}`
    : "#";

  async function loadSummary(nextSelection: ReturnType<typeof buildDefaultSelection>) {
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

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
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

  function closeModal() {
    setShowModal(false);
  }

  return (
    <section className="page-stack">
      <div className="content-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Overtime Workflow</div>
            <h1>ชั่วโมง OT</h1>
            <p className="muted-text">
              อัปโหลดไฟล์สแกนหน้าแบบ `.txt` เพื่อคำนวณ OT, บันทึกทับไฟล์ CSV ในรีโป และส่งออกเป็น Excel
            </p>
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
            <button className="secondary-button" type="button" onClick={() => setShowModal(true)}>
              เลือกงวด
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
            >
              {isImporting ? "กำลังประมวลผล..." : "Import ไฟล์"}
            </button>
            <input
              ref={fileInputRef}
              className="hidden-input"
              type="file"
              accept=".txt,text/plain"
              onChange={handleImport}
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
            <span>รายการที่คำนวณแล้ว</span>
            <strong>{summary ? `${summary.recordCount} วันทำงาน` : "-"}</strong>
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
            <span>รวม OT</span>
            <strong>{summary?.totals.totalOt.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>OT 1.5</span>
            <strong>{summary?.totals.ot1.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>OT 2.0</span>
            <strong>{summary?.totals.ot2.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>OT 3.0</span>
            <strong>{summary?.totals.ot3.toFixed(2) || "0.00"}</strong>
          </div>
          <div className="metric-card">
            <span>มูลค่า OT</span>
            <strong>
              {summary?.totals.otPay.toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }) || "0.00"}
            </strong>
          </div>
        </div>

        <div className={`table-shell ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
          <div className="table-toolbar">
            <div className="table-toolbar-info">
              <strong>{isTableExpanded ? "โหมดขยายตาราง" : "โหมดกะทัดรัด"}</strong>
              <span>
                {isTableExpanded
                  ? "แสดงรายละเอียดแผนก, ตัวคูณ และผลรวมรายวันครบทั้งหมด"
                  : "แสดงคอลัมน์หลักให้พอดีกับหน้าจอ และซ่อนคอลัมน์รายวันไว้ก่อน"}
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
                    <th>รหัสพนักงาน</th>
                    <th>ชื่อพนักงาน</th>
                    {isTableExpanded ? <th>แผนก</th> : null}
                    <th>รวม OT</th>
                    <th>OT 1.5</th>
                    <th>OT 2</th>
                    <th>OT 3</th>
                    <th>รวม OT (คำนวณ)</th>
                    {isTableExpanded ? <th>OT 1.5 (x1.5)</th> : null}
                    {isTableExpanded ? <th>OT 2 (x2)</th> : null}
                    {isTableExpanded ? <th>OT 3 (x3)</th> : null}
                    {isTableExpanded
                      ? summary.days.map((day) => (
                      <th key={day.key}>
                        <div className="day-header">
                          <strong>{day.dayNumber}</strong>
                          <span>{day.weekdayShort}</span>
                        </div>
                      </th>
                        ))
                      : null}
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr key={row.employeeId}>
                      <td>{row.employeeId}</td>
                      <td>{row.employeeName || "-"}</td>
                      {isTableExpanded ? <td>{row.department || "-"}</td> : null}
                      <td className="numeric strong">{row.totalOt.toFixed(2)}</td>
                      <td className="numeric">{row.ot1.toFixed(2)}</td>
                      <td className="numeric">{row.ot2.toFixed(2)}</td>
                      <td className="numeric">{row.ot3.toFixed(2)}</td>
                      <td className="numeric strong">
                        {row.otPay.toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
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
                            className={`day-chip ${row.dayTotals[day.key] > 0 ? "has-value" : ""}`}
                          >
                            {row.dayTotals[day.key] > 0 ? row.dayTotals[day.key].toFixed(2) : ""}
                          </span>
                        </td>
                          ))
                        : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">เลือกงวดเพื่อเริ่มต้นแสดงข้อมูล</div>
          )}
        </div>
      </div>

      {showModal ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="eyebrow">เลือกงวดคำนวณ</div>
                <h2>กำหนดช่วงข้อมูล OT</h2>
              </div>
              <button
                className="icon-button modal-close"
                type="button"
                onClick={closeModal}
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
                <button className="secondary-button" type="button" onClick={closeModal}>
                  ยกเลิก
                </button>
              ) : null}
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setSelection(selectionDraft);
                  closeModal();
                }}
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
