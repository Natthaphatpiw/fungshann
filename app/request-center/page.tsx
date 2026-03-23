import Link from "next/link";

export default function RequestCenterHomePage() {
  return (
    <section className="page-stack">
      <div className="modal-overlay inline-overlay">
        <div className="modal-card request-menu-modal">
          <div className="modal-top">
            <div>
              <div className="eyebrow">เลือกการทำงาน</div>
              <h2>ศูนย์จัดการใบคำขอ OT</h2>
            </div>
          </div>

          <div className="request-menu-grid">
            <Link className="request-menu-card" href="/request-center/upload">
              <strong>ต้องการอัปโหลดใบคำขอ OT</strong>
              <span>เลือกโรงงานและงวด จากนั้นอัปโหลดรูปใบคำขอเพื่อให้ระบบสกัดและบันทึก</span>
            </Link>
            <Link className="request-menu-card" href="/request-center/history">
              <strong>ต้องการดูประวัติการขอ OT</strong>
              <span>ตรวจสอบรายการที่อัปโหลดแล้ว พร้อมสถานะและ OT1/OT2/OT3 ที่ถูกบันทึก</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
