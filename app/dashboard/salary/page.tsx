 "use client";

import { useState } from "react";

const previewRows = [
  ["งวด 1 / มีนาคม 2026", "10 มี.ค. 2026", "327 คน", "0.00", "รอเชื่อมข้อมูล"],
  ["งวด 2 / มีนาคม 2026", "25 มี.ค. 2026", "327 คน", "0.00", "รอเชื่อมข้อมูล"],
  ["งวด 1 / เมษายน 2026", "10 เม.ย. 2026", "327 คน", "0.00", "รอเชื่อมข้อมูล"]
];

export default function SalaryPage() {
  const [isTableExpanded, setIsTableExpanded] = useState(false);

  return (
    <section className="page-stack">
      <div className="content-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Payroll Layout Preview</div>
            <h1>เงินเดือน / ค่าจ้าง</h1>
            <p className="muted-text">
              ปรับหน้าให้เป็นโครงพร้อมใช้งานในสไตล์เดียวกับ OT และพนักงาน เพื่อเตรียมต่อยอด logic payroll
            </p>
          </div>
        </div>

        <div className="toolbar-row">
          <div className="toolbar-left">
            <button className="excel-button" type="button" disabled>
              Export XLSX
            </button>
          </div>
          <div className="toolbar-right">
            <button className="secondary-button" type="button" disabled>
              เลือกงวด
            </button>
          </div>
        </div>

        <div className="summary-strip">
          <div className="summary-pill">
            <span>สถานะระบบ</span>
            <strong>รอเชื่อมสูตร payroll</strong>
          </div>
          <div className="summary-pill">
            <span>ส่วนที่เตรียมไว้</span>
            <strong>งวดจ่าย / ค่าใช้จ่าย / ส่งออก</strong>
          </div>
        </div>

        <div className={`table-shell ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
          <div className="table-toolbar">
            <div className="table-toolbar-info">
              <strong>{isTableExpanded ? "มุมมองขยาย" : "มุมมองกะทัดรัด"}</strong>
              <span>ปุ่มนี้ถูกเตรียมไว้แล้วเพื่อใช้กับตารางเงินเดือนจริงในรอบถัดไป</span>
            </div>
            <button
              className="secondary-button small-button"
              type="button"
              onClick={() => setIsTableExpanded((current) => !current)}
            >
              {isTableExpanded ? "หดตาราง" : "ขยายตาราง"}
            </button>
          </div>

          <div className={`table-scroll ${isTableExpanded ? "expanded-view" : "compact-view"}`}>
            <table className={`data-table ${isTableExpanded ? "expanded" : "compact"}`}>
              <thead>
                <tr>
                  <th>งวดเงินเดือน</th>
                  <th>วันจ่าย</th>
                  <th>จำนวนพนักงาน</th>
                  <th>ค่าใช้จ่ายรวม</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell) => (
                      <td key={`${row[0]}-${cell}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
