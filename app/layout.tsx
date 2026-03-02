import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fong Shann HR System",
  description: "HR and payroll operations portal for factory teams."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
