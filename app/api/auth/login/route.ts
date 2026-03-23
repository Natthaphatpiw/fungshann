import { NextResponse } from "next/server";

import { buildSessionCookie, isRequestUploaderSession, validateCredentials } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; password?: string; department?: string }
    | null;

  const username = body?.username?.trim() || "";
  const password = body?.password || "";
  const department = body?.department?.trim() || "";
  const { account, message } = validateCredentials(username, password, department);

  if (!account) {
    return NextResponse.json(
      { message: message || "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    redirectPath: isRequestUploaderSession(account) ? "/request-center" : "/dashboard"
  });
  const cookie = buildSessionCookie(account);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
