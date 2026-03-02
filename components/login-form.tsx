"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { DEMO_ACCOUNTS } from "@/lib/constants";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setErrorMessage(payload?.message || "เข้าสู่ระบบไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <div className="brand-badge">FS</div>
          <div>
            <div className="eyebrow">Secure Payroll Access</div>
            <h1>Fong Shann HR System</h1>
            <p>ระบบกลางสำหรับจัดการ OT, ข้อมูลพนักงาน และกระบวนการเงินเดือนของโรงงาน</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Username</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="กรอกชื่อผู้ใช้งาน"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="กรอกรหัสผ่าน"
              required
            />
          </label>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "กำลังตรวจสอบ..." : "เข้าใช้งานระบบ"}
          </button>
        </form>

        <div className="credential-grid">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.username}
              className="credential-card"
              type="button"
              onClick={() => {
                setUsername(account.username);
                setPassword(account.password);
              }}
            >
              <div className="credential-title">{account.factoryLabel}</div>
              <div className="credential-row">User: {account.username}</div>
              <div className="credential-row">Pass: {account.password}</div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
