import { FactoryId } from "@/lib/types";

export const AUTH_COOKIE = "fshann_hr_session";

export const DEMO_ACCOUNTS: Array<{
  factoryId: FactoryId;
  factoryLabel: string;
  username: string;
  password: string;
}> = [
  {
    factoryId: "factory1",
    factoryLabel: "โรงงาน 1",
    username: "factory1_admin",
    password: "F1@2026hr"
  },
  {
    factoryId: "factory3",
    factoryLabel: "โรงงาน 3",
    username: "factory3_admin",
    password: "F3@2026hr"
  }
];

export const MENU_ITEMS = [
  { href: "/dashboard/ot", label: "ชั่วโมง OT", shortLabel: "OT", icon: "ot" },
  { href: "/dashboard/salary", label: "เงินเดือน/ค่าจ้าง", shortLabel: "ค่าจ้าง", icon: "salary" },
  {
    href: "/dashboard/employees",
    label: "รายละเอียดพนักงาน",
    shortLabel: "พนักงาน",
    icon: "employees"
  },
  { href: "/dashboard/reports", label: "รายงาน", shortLabel: "รายงาน", icon: "reports" },
  {
    href: "/dashboard/departments",
    label: "ตั้งค่าแผนก/ฝ่าย",
    shortLabel: "แผนก",
    icon: "departments"
  },
  { href: "/dashboard/settings", label: "ตั้งค่าระบบ", shortLabel: "ตั้งค่า", icon: "settings" }
] as const;

export const OFFICE_KEYWORDS = ["บุคคล", "บัญชี", "การตลาด", "ธุรการ", "จัดซื้อ", "HR"];
export const TRANSPORT_KEYWORDS = ["ขนส่ง", "transport", "Transport"];
