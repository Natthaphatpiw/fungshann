"use client";

import { useDeferredValue, useEffect, useState } from "react";

type EmployeePayload = {
  columns: string[];
  rows: Array<Record<string, string>>;
  factoryLabel: string;
};

export function EmployeeDirectory() {
  const [payload, setPayload] = useState<EmployeePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let active = true;

    async function loadEmployees() {
      setIsLoading(true);
      const response = await fetch("/api/employees", { cache: "no-store" });
      if (!active) {
        return;
      }

      if (!response.ok) {
        setPayload(null);
        setIsLoading(false);
        return;
      }

      const nextPayload = (await response.json()) as EmployeePayload;
      if (active) {
        setPayload(nextPayload);
        setIsLoading(false);
      }
    }

    void loadEmployees();

    return () => {
      active = false;
    };
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

    const compactPriority = [
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

    const picked = compactPriority.filter((column) => payload.columns.includes(column));
    return picked.length > 0 ? picked : payload.columns.slice(0, Math.min(payload.columns.length, 8));
  })();

  return (
    <section className="page-stack">
      <div className="content-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Employee Master</div>
            <h1>รายละเอียดพนักงาน</h1>
            <p className="muted-text">
              แสดงข้อมูลครบทุกคอลัมน์จากไฟล์ CSV ของ{payload?.factoryLabel || "โรงงานที่ล็อกอิน"}
            </p>
          </div>

        </div>

        <div className="toolbar-row">
          <div className="toolbar-left">
            <div className="toolbar-note">
              โหมดเริ่มต้นจะแสดงคอลัมน์หลักให้พอดีหน้าจอ และสามารถกดขยายเพื่อดูครบทุกคอลัมน์
            </div>
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

        <div className="summary-strip">
          <div className="summary-pill">
            <span>จำนวนพนักงาน</span>
            <strong>{payload ? `${payload.rows.length} คน` : "-"}</strong>
          </div>
          <div className="summary-pill">
            <span>ผลลัพธ์ที่แสดง</span>
            <strong>{payload ? `${filteredRows.length} รายการ` : "-"}</strong>
          </div>
        </div>

        <div className={`table-shell ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
          <div className="table-toolbar">
            <div className="table-toolbar-info">
              <strong>{isTableExpanded ? "แสดงครบทุกคอลัมน์" : "แสดงคอลัมน์หลัก"}</strong>
              <span>
                {isTableExpanded
                  ? "ขยายรายละเอียดเต็มรูปแบบตามไฟล์ CSV ของโรงงานที่ล็อกอิน"
                  : "โหมดกะทัดรัดเหมาะกับการเปิดบนจอทั่วไปและจอมือถือ"}
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
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={`${row["รหัสพนักงาน"] || "employee"}-${index}`}>
                      {visibleColumns.map((column) => (
                        <td key={`${column}-${index}`}>{row[column] || "-"}</td>
                      ))}
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
    </section>
  );
}
