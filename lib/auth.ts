import { cookies } from "next/headers";

import { AUTH_COOKIE, DEMO_ACCOUNTS } from "@/lib/constants";
import { SessionAccount } from "@/lib/types";

function encodeSession(account: SessionAccount): string {
  return Buffer.from(JSON.stringify(account), "utf8").toString("base64url");
}

function decodeSession(value: string): SessionAccount | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const role =
      parsed?.role === "visitor"
        ? "visitor"
        : parsed?.role === "request_uploader"
          ? "request_uploader"
          : "admin";
    const departmentScope =
      role === "visitor" && typeof parsed?.departmentScope === "string"
        ? parsed.departmentScope.trim() || null
        : null;

    if (
      parsed &&
      (parsed.factoryId === "factory1" || parsed.factoryId === "factory3") &&
      typeof parsed.factoryLabel === "string" &&
      typeof parsed.username === "string"
    ) {
      return {
        factoryId: parsed.factoryId,
        factoryLabel: parsed.factoryLabel,
        username: parsed.username,
        role,
        departmentScope
      };
    }
  } catch (error) {
    console.error("Invalid session cookie", error);
  }

  return null;
}

export function validateCredentials(
  username: string,
  password: string,
  departmentScope?: string
): { account: SessionAccount | null; message?: string } {
  const account = DEMO_ACCOUNTS.find(
    (entry) => entry.username === username.trim() && entry.password === password
  );

  if (!account) {
    return {
      account: null,
      message: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง"
    };
  }

  const selectedDepartment = String(departmentScope ?? "").trim();
  if (account.role === "visitor" && !selectedDepartment) {
    return {
      account: null,
      message: "กรุณาเลือกแผนกก่อนเข้าสู่ระบบ visitor"
    };
  }

  return {
    account: {
      factoryId: account.factoryId,
      factoryLabel: account.factoryLabel,
      username: account.username,
      role: account.role,
      departmentScope: account.role === "visitor" ? selectedDepartment : null
    }
  };
}

export async function getSession(): Promise<SessionAccount | null> {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(AUTH_COOKIE)?.value;

  if (!sessionValue) {
    return null;
  }

  return decodeSession(sessionValue);
}

export function isVisitorSession(session: SessionAccount | null | undefined): boolean {
  return session?.role === "visitor";
}

export function isAdminSession(session: SessionAccount | null | undefined): boolean {
  return session?.role === "admin";
}

export function isRequestUploaderSession(session: SessionAccount | null | undefined): boolean {
  return session?.role === "request_uploader";
}

export function buildSessionCookie(account: SessionAccount) {
  return {
    name: AUTH_COOKIE,
    value: encodeSession(account),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 12
    }
  };
}

export function buildClearedSessionCookie() {
  return {
    name: AUTH_COOKIE,
    value: "",
    options: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0
  } as const
  };
}
