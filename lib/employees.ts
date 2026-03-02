import { parseCsvFile, getEmployeeCsvPath } from "@/lib/csv";
import { EmployeeRecord, FactoryId } from "@/lib/types";

export async function readEmployees(factoryId: FactoryId): Promise<EmployeeRecord[]> {
  const rows = await parseCsvFile(getEmployeeCsvPath(factoryId));

  return rows.map((row) => {
    const employeeId = (row["รหัสพนักงาน"] || "").trim();
    const firstName = (row["ชื่อ"] || "").trim();
    const lastName = (row["สกุล"] || "").trim();
    const department = (row["แผนก"] || "").trim();
    const position = (row["ตำแหน่ง"] || "").trim();

    return {
      ...row,
      __id: employeeId,
      __fullName: [firstName, lastName].filter(Boolean).join(" "),
      __department: department,
      __position: position
    };
  });
}

export async function readEmployeeMap(factoryId: FactoryId): Promise<Map<string, EmployeeRecord>> {
  const employees = await readEmployees(factoryId);
  return new Map(employees.map((employee) => [employee.__id, employee]));
}
