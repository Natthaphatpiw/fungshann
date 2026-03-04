"use client";

import { ChangeEvent, useDeferredValue, useEffect, useState } from "react";

type EmployeeRow = Record<string, string>;

type EmployeePayload = {
  columns: string[];
  dataColumns: string[];
  specialColumns: string[];
  rows: EmployeeRow[];
  factoryLabel: string;
};

type EditorMode = "closed" | "create" | "edit";
type CreateMode = "manual" | "import";

const COMPACT_PRIORITY = [
  "ลำดับ",
  "รหัสพนักงาน",
  "ชื่อ",
  "สกุล",
  "แผนก",
  "ตำแหน่ง",
  "การจ้างงาน",
  "ค่าแรงต่อวัน",
  "เงินเดือน",
  "เงินเดือน 40(1)"
];

function buildEmptyDraft(columns: string[], nextIndex: number): EmployeeRow {
  return Object.fromEntries(
    columns.map((column) => [column, column === "ลำดับ" ? String(nextIndex) : ""])
  );
}

export function EmployeeDirectory() {
  const [payload, setPayload] = useState<EmployeePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("closed");
  const [createMode, setCreateMode] = useState<CreateMode>("manual");
  const [draftRow, setDraftRow] = useState<EmployeeRow>({});
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const deferredSearch = useDeferredValue(search);

  async function loadEmployees() {
    setIsLoading(true);
    setErrorMessage("");

    const response = await fetch("/api/employees", { cache: "no-store" });

    if (!response.ok) {
      setPayload(null);
      setErrorMessage("ไม่สามารถโหลดข้อมูลพนักงานได้");
      setIsLoading(false);
      return;
    }

    const nextPayload = (await response.json()) as EmployeePayload;
    setPayload(nextPayload);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadEmployees();
  }, []);

  const filteredRows = (() => {
    if (!payload) {
      return [];
    }

    const keyword = deferredSearch.trim().toLowerCase();

    if (!keyword) {
      return payload.rows;
    }

    return payload.rows.filter((row) =>
      Object.values(row).some((value) => value.toLowerCase().includes(keyword))
    );
  })();

  const visibleColumns = (() => {
    if (!payload) {
      return [];
    }

    if (isTableExpanded) {
      return payload.columns;
    }

    const picked = COMPACT_PRIORITY.filter((column) => payload.columns.includes(column));

    return picked.length > 0
      ? picked
      : payload.columns.slice(0, Math.min(payload.columns.length, 8));
  })();

  const editableColumns = payload?.columns.filter((column) => column !== "ลำดับ") ?? [];

  function closeModal() {
    setEditorMode("closed");
    setCreateMode("manual");
    setImportFile(null);
    setDraftRow({});
    setSelectedEmployeeId("");
  }

  function openCreateModal() {
    if (!payload) {
      return;
    }

    setStatusMessage("");
    setErrorMessage("");
    setCreateMode("manual");
    setDraftRow(buildEmptyDraft(payload.columns, payload.rows.length + 1));
    setSelectedEmployeeId("");
    setEditorMode("create");
  }

  function openEditModal(row: EmployeeRow) {
    if (!payload) {
      return;
    }

    setStatusMessage("");
    setErrorMessage("");
    setDraftRow(
      Object.fromEntries(payload.columns.map((column) => [column, row[column] ?? ""]))
    );
    setSelectedEmployeeId(String(row["รหัสพนักงาน"] ?? ""));
    setEditorMode("edit");
  }

  async function handleSave() {
    if (!payload) {
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    setErrorMessage("");

    const request =
      editorMode === "edit"
        ? {
            method: "PUT",
            body: JSON.stringify({
              employeeId: selectedEmployeeId,
              row: draftRow
            })
          }
        : {
            method: "POST",
            body: JSON.stringify({
              row: draftRow
            })
          };

    const response = await fetch("/api/employees", {
      ...request,
      headers: {
        "Content-Type": "application/json"
      }
    });

    const result = (await response.json().catch(() => null)) as { message?: string } | null;

    if (!response.ok) {
      setErrorMessage(result?.message || "ไม่สามารถบันทึกข้อมูลได้");
      setIsSaving(false);
      return;
    }

    setStatusMessage(result?.message || "บันทึกข้อมูลเรียบร้อย");
    setIsSaving(false);
    closeModal();
    await loadEmployees();
  }

  async function handleDelete(row: EmployeeRow) {
    const employeeId = String(row["รหัสพนักงาน"] ?? "").trim();
    const fullName = [row["ชื่อ"], row["สกุล"]].filter(Boolean).join(" ");

    if (!employeeId) {
      return;
    }

    const confirmed = window.confirm(
      `ยืนยันลบพนักงาน ${employeeId}${fullName ? ` - ${fullName}` : ""} ใช่หรือไม่`
    );

    if (!confirmed) {
      return;
    }

    setStatusMessage("");
    setErrorMessage("");

    const response = await fetch(
      `/api/employees?${new URLSearchParams({ employeeId }).toString()}`,
      {
        method: "DELETE"
      }
    );
    const result = (await response.json().catch(() => null)) as { message?: string } | null;

    if (!response.ok) {
      setErrorMessage(result?.message || "ลบพนักงานไม่สำเร็จ");
      return;
    }

    setStatusMessage(result?.message || "ลบพนักงานเรียบร้อย");
    await loadEmployees();
  }

  async function handleImport() {
    if (!importFile) {
      setErrorMessage("กรุณาเลือกไฟล์ก่อนนำเข้า");
      return;
    }

    setIsImporting(true);
    setStatusMessage("");
    setErrorMessage("");

    const formData = new FormData();
    formData.append("file", importFile);

    const response = await fetch("/api/employees/import", {
      method: "POST",
      body: formData
    });

    const result = (await response.json().catch(() => null)) as { message?: string } | null;

    if (!response.ok) {
      setErrorMessage(result?.message || "นำเข้าข้อมูลไม่สำเร็จ");
      setIsImporting(false);
      return;
    }

    setStatusMessage(result?.message || "นำเข้าข้อมูลเรียบร้อย");
    setIsImporting(false);
    closeModal();
    await loadEmployees();
  }

  return (
    <section className="page-stack">
      <div className="content-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Employee Master</div>
            <h1>รายละเอียดพนักงาน</h1>
            <p className="muted-text">
              จัดการข้อมูลพนักงาน, เงินพิเศษ และไฟล์ต้นทางของ{payload?.factoryLabel || "โรงงานที่ล็อกอิน"}
            </p>
          </div>
        </div>

        <div className="toolbar-row">
          <div className="toolbar-left">
            <button className="secondary-button" type="button" onClick={openCreateModal}>
              เพิ่มพนักงาน
            </button>
          </div>
          <div className="toolbar-right">
            <label className="search-field search-inline">
              <span>ค้นหาข้อมูล</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาจากรหัส ชื่อ แผนก ตำแหน่ง"
              />
            </label>
          </div>
        </div>

        {statusMessage ? <div className="status-banner success">{statusMessage}</div> : null}
        {errorMessage ? <div className="status-banner error">{errorMessage}</div> : null}

        <div className="summary-strip">
          <div className="summary-pill">
            <span>จำนวนพนักงาน</span>
            <strong>{payload ? `${payload.rows.length} คน` : "-"}</strong>
          </div>
          <div className="summary-pill">
            <span>ผลลัพธ์ที่แสดง</span>
            <strong>{payload ? `${filteredRows.length} รายการ` : "-"}</strong>
          </div>
          <div className="summary-pill">
            <span>คอลัมม์เงินพิเศษ</span>
            <strong>{payload ? `${payload.specialColumns.length} รายการ` : "-"}</strong>
          </div>
        </div>

        <div className={`table-shell ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
          <div className="table-toolbar">
            <div className="table-toolbar-info">
              <strong>
                {isTableExpanded ? "แสดงข้อมูลพนักงานครบทุกคอลัมม์" : "แสดงคอลัมม์หลัก"}
              </strong>
              <span>
                {isTableExpanded
                  ? "โหมดขยายจะแสดงทุกคอลัมม์ที่มีอยู่ในไฟล์ CSV รวมถึงคอลัมม์เงินพิเศษทั้งหมด"
                  : "โหมดเริ่มต้นจะแสดงเฉพาะคอลัมม์สำคัญให้พอดีหน้าจอ"}
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
          ) : payload ? (
            <div className={`table-scroll ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
              <table className={`data-table ${isTableExpanded ? "expanded" : "compact"}`}>
                <thead>
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={`${row["รหัสพนักงาน"] || "employee"}-${index}`}>
                      {visibleColumns.map((column) => (
                        <td key={`${column}-${index}`}>{row[column] || "-"}</td>
                      ))}
                      <td>
                        <div className="record-actions">
                          <button
                            className="secondary-button small-button"
                            type="button"
                            onClick={() => openEditModal(row)}
                          >
                            แก้ไข
                          </button>
                          <button
                            className="danger-button small-button"
                            type="button"
                            onClick={() => handleDelete(row)}
                          >
                            ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">ไม่พบข้อมูลพนักงาน</div>
          )}
        </div>

      </div>

      {editorMode !== "closed" && payload ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-card wide-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-top">
              <div>
                <div className="eyebrow">
                  {editorMode === "edit" ? "Edit Employee" : "Create Employee"}
                </div>
                <h2>
                  {editorMode === "edit" ? "แก้ไขข้อมูลพนักงาน" : "เพิ่มพนักงาน"}
                </h2>
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

            {editorMode === "create" ? (
              <div className="tab-strip">
                <button
                  className={`tab-button ${createMode === "manual" ? "active" : ""}`}
                  type="button"
                  onClick={() => setCreateMode("manual")}
                >
                  กรอกข้อมูลเอง
                </button>
                <button
                  className={`tab-button ${createMode === "import" ? "active" : ""}`}
                  type="button"
                  onClick={() => setCreateMode("import")}
                >
                  Import ไฟล์
                </button>
              </div>
            ) : null}

            {errorMessage ? <div className="status-banner error">{errorMessage}</div> : null}

            {editorMode === "create" && createMode === "import" ? (
              <div className="modal-section">
                <p className="muted-text">
                  รองรับการนำเข้าไฟล์ `.csv` หรือ `.xlsx` เพื่อเพิ่มพนักงานหลายรายการในครั้งเดียว
                  หากรหัสพนักงานซ้ำ ระบบจะอัปเดตข้อมูลของรหัสนั้นแทน
                </p>
                <div className="inline-actions">
                  <a className="excel-button" href="/api/employees/template">
                    ดาวน์โหลดเทมเพลต .xlsx
                  </a>
                </div>
                <label className="field">
                  <span>เลือกไฟล์นำเข้า</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setImportFile(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <div className="modal-actions">
                  <button className="secondary-button" type="button" onClick={closeModal}>
                    ยกเลิก
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleImport}
                    disabled={isImporting}
                  >
                    {isImporting ? "กำลังนำเข้า..." : "นำเข้าข้อมูล"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="modal-section">
                <div className="form-grid">
                  {editableColumns.map((column) => (
                    <label className="field" key={column}>
                      <span>{column}</span>
                      <input
                        value={draftRow[column] ?? ""}
                        onChange={(event) =>
                          setDraftRow((current) => ({
                            ...current,
                            [column]: event.target.value
                          }))
                        }
                        placeholder={`กรอก${column}`}
                      />
                    </label>
                  ))}
                </div>
                <div className="modal-actions">
                  <button className="secondary-button" type="button" onClick={closeModal}>
                    ยกเลิก
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving
                      ? "กำลังบันทึก..."
                      : editorMode === "edit"
                        ? "บันทึกการแก้ไข"
                        : "เพิ่มพนักงาน"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
