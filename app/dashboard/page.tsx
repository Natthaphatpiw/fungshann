export default function DashboardHomePage() {
  return (
    <section className="page-stack">
      <div className="hero-card">
        <div className="eyebrow">เริ่มต้นใช้งาน</div>
        <h1>ตั้งค่าระบบก่อนเริ่มคำนวณ OT และเงินเดือน</h1>
        <p>
          โครงสร้างเมนูถูกเตรียมไว้ครบทั้งระบบตามแนวทาง SaaS ของงาน HR/Payroll แล้ว
          โดยรอบนี้เปิดใช้งานจริง 2 ส่วนหลักก่อน คือหน้า <strong>ชั่วโมง OT</strong> และ{" "}
          <strong>รายละเอียดพนักงาน</strong> ส่วนเมนูอื่นถูกเตรียมหน้า placeholder ไว้สำหรับต่อยอด.
        </p>
      </div>

      <div className="content-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">ภาพรวมงานรอบนี้</div>
            <h2>สิ่งที่ใช้งานได้แล้ว</h2>
          </div>
        </div>
        <div className="placeholder-grid">
          <article className="placeholder-panel active">
            <h3>ชั่วโมง OT</h3>
            <p>รองรับอัปโหลดไฟล์สแกนหน้า คำนวณ OT ตามกะ และส่งออก Excel</p>
          </article>
          <article className="placeholder-panel active">
            <h3>รายละเอียดพนักงาน</h3>
            <p>อ่านข้อมูลจากไฟล์ CSV ตามโรงงานที่ล็อกอิน และแสดงครบทุกคอลัมน์</p>
          </article>
          <article className="placeholder-panel">
            <h3>ตั้งค่าระบบ</h3>
            <p>หน้าตั้งค่าถูกเตรียมไว้เป็นโครง พร้อมต่อยอดกฎ OT เงินเดือน ภาษี และประกันสังคม</p>
          </article>
        </div>
      </div>
    </section>
  );
}
