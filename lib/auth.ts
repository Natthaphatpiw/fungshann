import { cookies } from "next/headers";

import { AUTH_COOKIE, DEMO_ACCOUNTS } from "@/lib/constants";
import { SessionAccount } from "@/lib/types";

function encodeSession(account: SessionAccount): string {
  return Buffer.from(JSON.stringify(account), "utf8").toString("base64url");
}

function decodeSession(value: string): SessionAccount | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      parsed &&
      (parsed.factoryId === "factory1" || parsed.factoryId === "factory3") &&
      typeof parsed.factoryLabel === "string" &&
      typeof parsed.username === "string"
    ) {
      return parsed as SessionAccount;
    }
  } catch (error) {
    console.error("Invalid session cookie", error);
  }

  return null;
}

export function validateCredentials(username: string, password: string): SessionAccount | null {
  const account = DEMO_ACCOUNTS.find(
    (entry) => entry.username === username.trim() && entry.password === password
  );

  if (!account) {
    return null;
  }

  return {
    factoryId: account.factoryId,
    factoryLabel: account.factoryLabel,
    username: account.username
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
