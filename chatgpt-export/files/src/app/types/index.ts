export interface ShiftType {
  type: "normal" | "locked" | "absent" | "holiday" | "empty";
  hours?: number;
  icon?: React.ReactNode;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  isActive: boolean;
  shifts: ShiftType[];
}

export interface AbsenceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "declined";
  submittedAt: string;
  message?: string;
}

export interface DateInfo {
  day: string;
  date: string;
}
