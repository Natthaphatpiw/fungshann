"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DEMO_ACCOUNTS } from "@/lib/constants";
import { FactoryId } from "@/lib/types";

interface LoginFormProps {
  departmentsByFactory: Record<FactoryId, string[]>;
}

export function LoginForm({ departmentsByFactory }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedAccount = useMemo(
    () => DEMO_ACCOUNTS.find((account) => account.username === username.trim()) ?? null,
    [username]
  );
  const departmentOptions = selectedAccount ? departmentsByFactory[selectedAccount.factoryId] ?? [] : [];
  const requiresDepartment = Boolean(selectedAccount?.requiresDepartmentSelection);

  useEffect(() => {
    if (!requiresDepartment) {
      setDepartment("");
      return;
    }

    if (department && departmentOptions.includes(department)) {
      return;
    }

    setDepartment("");
  }, [department, departmentOptions, requiresDepartment]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password, department })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setErrorMessage(payload?.message || "เข้าสู่ระบบไม่สำเร็จ");
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json().catch(() => null)) as { redirectPath?: string } | null;
    router.replace(payload?.redirectPath || "/dashboard");
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

          {requiresDepartment ? (
            <label className="field">
              <span>แผนกสำหรับสิทธิ์ Visitor</span>
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                required
              >
                <option value="">เลือกแผนก</option>
                {departmentOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting || (requiresDepartment && !department)}
          >
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
                setDepartment("");
              }}
            >
              <div className="credential-title">{account.factoryLabel}</div>
              <div className="credential-row">Role: {account.role}</div>
              <div className="credential-row">User: {account.username}</div>
              <div className="credential-row">Pass: {account.password}</div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
