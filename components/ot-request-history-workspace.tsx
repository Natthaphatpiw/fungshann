"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatBangkokDateTime, formatPlainDate } from "@/lib/datetime";
import { FactoryId, OtRequestHistoryResponse, OtRequestHistoryRow } from "@/lib/types";

type PeriodSelection = ReturnType<typeof buildDefaultSelection>;

function buildDefaultSelection() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    period: 1 as 1 | 2
  };
}

const FACTORY_OPTIONS: Array<{ id: FactoryId; label: string }> = [
  { id: "factory1", label: "โรงงาน 1" },
  { id: "factory3", label: "โรงงาน 3" }
];

function formatStatusLabel(status: string) {
  switch (status) {
    case "approved":
      return "อนุมัติครบ";
    case "partial":
      return "อนุมัติบางส่วน";
    case "missing_signature":
      return "ลายเซ็นไม่ครบ";
    case "unmatched_name":
      return "จับคู่ชื่อไม่ได้";
    case "no_ot_record":
      return "ไม่พบ OT จริง";
    case "no_overlap":
      return "ช่วงเวลาที่ขอไม่ตรง";
    case "invalid_time_range":
      return "เวลาในใบคำขอไม่ถูกต้อง";
    default:
      return status || "-";
  }
}

function buildOtTypeLabel(row: OtRequestHistoryRow) {
  const labels: string[] = [];
  if (row.approvedOt1 > 0) {
    labels.push("OT1");
  }
  if (row.approvedOt2 > 0) {
    labels.push("OT2");
  }
  if (row.approvedOt3 > 0) {
    labels.push("OT3");
  }
  return labels.join(", ") || "-";
}

export function OtRequestHistoryWorkspace() {
  const [factoryId, setFactoryId] = useState<FactoryId>("factory1");
  const [selectionDraft, setSelectionDraft] = useState(buildDefaultSelection);
  const [selection, setSelection] = useState<PeriodSelection | null>(null);
  const [showSelectionModal, setShowSelectionModal] = useState(true);
  const [history, setHistory] = useState<OtRequestHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!selection) {
      return;
    }

    const currentSelection = selection;

    async function loadHistory() {
      setIsLoading(true);
      setErrorMessage("");

      const query = new URLSearchParams({
        factoryId,
        period: String(currentSelection.period),
        month: String(currentSelection.month),
        year: String(currentSelection.year)
      });

      const response = await fetch(`/api/ot/request/history?${query.toString()}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setErrorMessage(payload?.message || "ไม่สามารถโหลดประวัติคำขอ OT ได้");
        setHistory(null);
        setIsLoading(false);
        return;
      }

      const payload = (await response.json()) as OtRequestHistoryResponse;
      setHistory(payload);
      setIsLoading(false);
    }

    void loadHistory();
  }, [factoryId, selection]);

  return (
    <section className="page-stack">
      <div className="content-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Request History</div>
            <h1>ประวัติการขอ OT</h1>
            <p className="muted-text">แสดง log คำร้อง OT ที่อัปโหลดเข้าระบบ พร้อมจำนวนชั่วโมงและประเภท OT ที่บันทึก</p>
          </div>
        </div>

        <div className="summary-strip">
          <div className="summary-pill">
            <span>โรงงาน</span>
            <strong>{FACTORY_OPTIONS.find((item) => item.id === factoryId)?.label}</strong>
          </div>
          <div className="summary-pill">
            <span>งวดที่เลือก</span>
            <strong>{history?.periodLabel || "ยังไม่ได้เลือกงวด"}</strong>
          </div>
          <div className="summary-pill">
            <span>จำนวนรายการ</span>
            <strong>{history ? `${history.recordCount} รายการ` : "-"}</strong>
          </div>
        </div>

        {errorMessage ? <div className="status-banner error">{errorMessage}</div> : null}

        <div className="toolbar-row">
          <div className="toolbar-left">
            <button className="secondary-button" type="button" onClick={() => setShowSelectionModal(true)}>
              เลือกโรงงาน / งวด
            </button>
          </div>
          <div className="toolbar-right">
            <Link className="secondary-button" href="/request-center/upload">
              ไปหน้าอัปโหลด
            </Link>
          </div>
        </div>

        <div className="table-shell expanded-view">
          {isLoading ? (
            <div className="empty-state">กำลังโหลดประวัติคำขอ OT...</div>
          ) : history ? (
            <div className="table-scroll expanded-view">
              <table className="data-table expanded">
                <thead>
                  <tr>
                    <th>วันที่ขอ</th>
                    <th>รหัสพนักงาน</th>
                    <th>ชื่อพนักงาน</th>
                    <th>แผนก</th>
                    <th>เวลาที่ขอ</th>
                    <th>ชั่วโมงที่ขอ</th>
                    <th>ประเภท OT</th>
                    <th>OT1</th>
                    <th>OT2</th>
                    <th>OT3</th>
                    <th>รวมที่บันทึก</th>
                    <th>สถานะ</th>
                    <th>ผู้อัปโหลด</th>
                    <th>เวลาบันทึก</th>
                  </tr>
                </thead>
                <tbody>
                  {history.rows.length > 0 ? (
                    history.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatPlainDate(row.requestDate)}</td>
                        <td>{row.employeeId || "-"}</td>
                        <td>{row.employeeName || "-"}</td>
                        <td>{row.department || "-"}</td>
                        <td>{row.requestTimeLabel || "-"}</td>
                        <td className="numeric strong">{row.requestedHours.toFixed(2)}</td>
                        <td>{buildOtTypeLabel(row)}</td>
                        <td className="numeric">{row.approvedOt1.toFixed(2)}</td>
                        <td className="numeric">{row.approvedOt2.toFixed(2)}</td>
                        <td className="numeric">{row.approvedOt3.toFixed(2)}</td>
                        <td className="numeric strong">{row.approvedTotal.toFixed(2)}</td>
                        <td>{formatStatusLabel(row.requestStatus)}</td>
                        <td>{row.uploaderUsername}</td>
                        <td>{formatBangkokDateTime(row.createdAt, { includeSeconds: true })}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-table-cell" colSpan={14}>
                        ไม่พบประวัติคำขอ OT ในงวดที่เลือก
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">เลือกโรงงานและงวดเพื่อดูประวัติคำขอ OT</div>
          )}
        </div>
      </div>

      {showSelectionModal ? (
        <div className="modal-overlay" onClick={() => setShowSelectionModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="eyebrow">กำหนดขอบเขตการแสดงผล</div>
                <h2>เลือกโรงงานและงวด</h2>
              </div>
              <button
                className="icon-button modal-close"
                type="button"
                onClick={() => setShowSelectionModal(false)}
                aria-label="ปิดหน้าต่าง"
              >
                ×
              </button>
            </div>

            <div className="modal-grid request-selection-grid">
              <label className="field">
                <span>เลือกโรงงาน</span>
                <select value={factoryId} onChange={(event) => setFactoryId(event.target.value as FactoryId)}>
                  {FACTORY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
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
                    setSelectionDraft((current) => ({ ...current, month: Number(event.target.value) }))
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
                    setSelectionDraft((current) => ({ ...current, year: Number(event.target.value) }))
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
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setSelection({ ...selectionDraft });
                  setShowSelectionModal(false);
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
