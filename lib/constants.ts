import { FactoryId, SessionRole } from "@/lib/types";

export const AUTH_COOKIE = "fshann_hr_session";

export const DEMO_ACCOUNTS: Array<{
  factoryId: FactoryId;
  factoryLabel: string;
  username: string;
  password: string;
  role: SessionRole;
  requiresDepartmentSelection?: boolean;
}> = [
  {
    factoryId: "factory1",
    factoryLabel: "โรงงาน 1",
    username: "factory1_admin",
    password: "F1@2026hr",
    role: "admin"
  },
  {
    factoryId: "factory3",
    factoryLabel: "โรงงาน 3",
    username: "factory3_admin",
    password: "F3@2026hr",
    role: "admin"
  },
  {
    factoryId: "factory1",
    factoryLabel: "โรงงาน 1 Visitor",
    username: "factory1_visitor",
    password: "F1View@2026",
    role: "visitor",
    requiresDepartmentSelection: true
  },
  {
    factoryId: "factory3",
    factoryLabel: "โรงงาน 3 Visitor",
    username: "factory3_visitor",
    password: "F3View@2026",
    role: "visitor",
    requiresDepartmentSelection: true
  },
  {
    factoryId: "factory1",
    factoryLabel: "ศูนย์คำขอ OT",
    username: "ot_request_uploader",
    password: "OTReq@2026",
    role: "request_uploader"
  }
];

export const MENU_ITEMS = [
  {
    href: "/dashboard/ot",
    label: "ชั่วโมง OT",
    shortLabel: "OT",
    icon: "ot",
    roles: ["admin", "visitor"] as SessionRole[]
  },
  {
    href: "/dashboard/salary",
    label: "เงินเดือน/ค่าจ้าง",
    shortLabel: "ค่าจ้าง",
    icon: "salary",
    roles: ["admin"] as SessionRole[]
  },
  {
    href: "/dashboard/employees",
    label: "รายละเอียดพนักงาน",
    shortLabel: "พนักงาน",
    icon: "employees",
    roles: ["admin"] as SessionRole[]
  },
  {
    href: "/dashboard/reports",
    label: "รายงาน",
    shortLabel: "รายงาน",
    icon: "reports",
    roles: ["admin"] as SessionRole[]
  },
  {
    href: "/dashboard/departments",
    label: "ตั้งค่าแผนก/ฝ่าย",
    shortLabel: "แผนก",
    icon: "departments",
    roles: ["admin"] as SessionRole[]
  },
  {
    href: "/dashboard/settings",
    label: "ตั้งค่าระบบ",
    shortLabel: "ตั้งค่า",
    icon: "settings",
    roles: ["admin"] as SessionRole[]
  }
] as const;

export const OFFICE_KEYWORDS = ["บุคคล", "บัญชี", "การตลาด", "ธุรการ", "จัดซื้อ", "HR"];
export const TRANSPORT_KEYWORDS = ["ขนส่ง", "transport", "Transport"];
