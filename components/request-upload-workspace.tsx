"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useRef, useState } from "react";

import { FactoryId } from "@/lib/types";

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

export function RequestUploadWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [factoryId, setFactoryId] = useState<FactoryId>("factory1");
  const [selectionDraft, setSelectionDraft] = useState(buildDefaultSelection);
  const [selection, setSelection] = useState<PeriodSelection | null>(null);
  const [showSelectionModal, setShowSelectionModal] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (files.length === 0) {
      setPreviewUrls([]);
      return;
    }

    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = event.target.files ? [...event.target.files] : [];

    if (nextFiles.length > 5) {
      setErrorMessage("อัปโหลดได้สูงสุด 5 รูปต่อครั้ง");
      event.target.value = "";
      return;
    }

    setFiles(nextFiles);
    setErrorMessage("");
    event.target.value = "";
  }

  async function handleSubmit() {
    if (!selection) {
      setErrorMessage("กรุณาเลือกโรงงานและงวดก่อนอัปโหลด");
      return;
    }

    if (files.length === 0) {
      setErrorMessage("กรุณาเลือกรูปใบคำขอ OT ก่อนยืนยัน");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.append("factoryId", factoryId);
    formData.append("period", String(selection.period));
    formData.append("month", String(selection.month));
    formData.append("year", String(selection.year));
    files.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/ot/request/upload", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json().catch(() => null)) as
      | { message?: string; unmatchedNames?: string[] }
      | null;

    if (!response.ok) {
      setErrorMessage(payload?.message || "อัปโหลดใบคำขอ OT ไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    const unmatchedNames = payload?.unmatchedNames || [];
    const unmatchedLabel =
      unmatchedNames.length > 0
        ? ` | รายชื่อที่ยังจับคู่ไม่ได้: ${unmatchedNames.slice(0, 10).join(", ")}${
            unmatchedNames.length > 10 ? " ..." : ""
          }`
        : "";

    setStatusMessage(`${payload?.message || "อัปโหลดใบคำขอ OT สำเร็จ"}${unmatchedLabel}`);
    setFiles([]);
    setIsSubmitting(false);
  }

  return (
    <section className="page-stack">
      <div className="content-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Upload Request</div>
            <h1>อัปโหลดใบคำขอ OT</h1>
            <p className="muted-text">
              เลือกโรงงานและงวดก่อน จากนั้นอัปโหลดรูปใบคำขอ OT ได้สูงสุด 5 รูปต่อครั้ง
            </p>
          </div>
        </div>

        <div className="summary-strip">
          <div className="summary-pill">
            <span>โรงงานที่กำลังทำรายการ</span>
            <strong>{FACTORY_OPTIONS.find((item) => item.id === factoryId)?.label}</strong>
          </div>
          <div className="summary-pill">
            <span>งวดที่เลือก</span>
            <strong>
              {selection
                ? `งวด ${selection.period} / ${String(selection.month).padStart(2, "0")} / ${selection.year}`
                : "ยังไม่ได้เลือกงวด"}
            </strong>
          </div>
          <div className="summary-pill">
            <span>จำนวนรูปที่เลือก</span>
            <strong>{`${files.length} / 5 รูป`}</strong>
          </div>
        </div>

        {statusMessage ? <div className="status-banner success">{statusMessage}</div> : null}
        {errorMessage ? <div className="status-banner error">{errorMessage}</div> : null}

        <div className="toolbar-row">
          <div className="toolbar-left">
            <button className="secondary-button" type="button" onClick={() => setShowSelectionModal(true)}>
              เลือกโรงงาน / งวด
            </button>
            <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
              เลือกรูปใบคำขอ OT
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={files.length === 0}
              onClick={() => setFiles([])}
            >
              ล้างรายการรูป
            </button>
          </div>
          <div className="toolbar-right">
            <Link className="secondary-button" href="/request-center/history">
              ดูประวัติคำขอ OT
            </Link>
          </div>
        </div>

        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelection}
        />

        {files.length > 0 ? (
          <div className="request-preview-grid">
            {files.map((file, index) => (
              <figure className="request-preview-card" key={`${file.name}-${index}`}>
                <img className="request-preview-image" src={previewUrls[index]} alt={file.name} />
                <figcaption className="request-preview-name">{file.name}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="empty-state request-upload-empty">ยังไม่ได้เลือกรูปใบคำขอ OT</div>
        )}

        <div className="modal-actions">
          <button className="primary-button" type="button" disabled={isSubmitting || !selection || files.length === 0} onClick={() => void handleSubmit()}>
            {isSubmitting ? "กำลังสกัดใบขอ OT..." : "ยืนยันคำขอโอที"}
          </button>
        </div>
      </div>

      {showSelectionModal ? (
        <div className="modal-overlay" onClick={() => setShowSelectionModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="eyebrow">กำหนดขอบเขตการอัปโหลด</div>
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
