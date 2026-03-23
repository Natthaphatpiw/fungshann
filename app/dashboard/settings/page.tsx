import { redirect } from "next/navigation";

import { getSession, isVisitorSession } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (isVisitorSession(session)) {
    redirect("/dashboard/ot");
  }

  return (
    <section className="page-stack">
      <div className="hero-card">
        <div className="eyebrow">มาตรฐาน SaaS Payroll</div>
        <h1>ศูนย์ตั้งค่าระบบ</h1>
        <p>
          โครงสร้างระบบถูกจัดไว้ให้เริ่มจากการกำหนดกฎ OT, นโยบายเงินเดือน,
          เอกสารส่งภาษีและประกันสังคมก่อนใช้งานจริง เมื่อพร้อมสามารถขยายหน้านี้ต่อจากฐานที่มีอยู่ได้ทันที.
        </p>
      </div>

      <div className="placeholder-grid">
        <article className="placeholder-panel">
          <h3>กฎการคำนวณ OT</h3>
          <p>รองรับแยกกะ, วันอาทิตย์, ฝ่ายขนส่ง และการคาบเกี่ยวข้ามวัน</p>
        </article>
        <article className="placeholder-panel">
          <h3>กฎการคำนวณเงินเดือน</h3>
          <p>พร้อมต่อยอดหักขาด ลา สาย ภาษี และประกันสังคม</p>
        </article>
        <article className="placeholder-panel">
          <h3>เอกสารส่งออก</h3>
          <p>รองรับสร้างไฟล์สำหรับตรวจสอบภายในและส่งฝ่ายบัญชีในลำดับถัดไป</p>
        </article>
      </div>
    </section>
  );
}
