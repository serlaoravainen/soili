"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Calendar, Clock, Users, AlertCircle, Lock, Plane, Plus } from "lucide-react";
import { ShiftType, Employee, DateInfo } from "../types";
import { supabase } from "@/lib/supaBaseClient";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { Input } from "./ui/input";



type DateCell = DateInfo & { iso: string };

type ShiftRow = {
  employee_id: string;
  work_date: string; // ISO: YYYY-MM-DD
  type: "normal" | "locked" | "absent" | "holiday";
  hours: number | null;
};

interface ScheduleTableProps {
  employees?: Employee[]; // säilytetään signatuuri
}

const START_ISO = "2025-08-18"; // MA 18.8
const DAYS = 10;

function addDaysISO(iso: string, add: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

function fiWeekdayShort(d: Date) {
  // su-to klo 0 locale -> FI näyttää ma, ti, ke...
  return d
    .toLocaleDateString("fi-FI", { weekday: "short" })
    .replace(".", "")
    .toUpperCase()
    .slice(0, 2);
}

function fiDayMonth(d: Date) {
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${day}.${month}`;
}

const ScheduleTable: React.FC<ScheduleTableProps> = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<{ employee: string; day: number } | null>(null);
  const [openPopover, setOpenPopover] = useState<string | null>(null);


  // Päivärivi tuotetaan ISO:sta -> näyttää täsmälleen sun UI:n kaltaisen otsikon
const dates: DateCell[] = useMemo(() => {
  return Array.from({ length: DAYS }).map((_, i): DateCell => {
    const iso = addDaysISO(START_ISO, i);
    const d = new Date(iso + "T00:00:00");
    return { day: fiWeekdayShort(d), date: fiDayMonth(d), iso };
  });
}, []);

  // Vuorot mapattuna: key = `${employee_id}|${work_date}`
  const [shiftsMap, setShiftsMap] = useState<Record<string, ShiftRow>>({});

  // 1) Hae työntekijät + 2) hae vuorot valitulle jaksolle
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // Employees
        const { data: empData, error: empErr } = await supabase
          .from("employees")
          .select("id, name, email, department, is_active, created_at")
          .order("created_at", { ascending: true });

        if (empErr) throw empErr;

        type EmployeeRow = {
          id: string;
          name: string;
          email: string;
          department: string;
          is_active: boolean;
        };

        const mappedEmp: Employee[] = (empData ?? [])
          .map((row: EmployeeRow) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            department: row.department,
            isActive: !!row.is_active,
            // shifts-array ei ole enää lähde; pidetään placeholder pituuden vuoksi UI:lle
            shifts: Array.from({ length: dates.length }, () => ({ type: "empty" as ShiftType["type"] })),
          }))
          .filter((e) => e.isActive);

        setEmployees(mappedEmp);

        // Shifts
        if (mappedEmp.length) {
          const start = dates[0].iso;
          const end = dates[dates.length - 1].iso;

          const { data: s, error: sErr } = await supabase
            .from("shifts")
            .select("employee_id, work_date, type, hours")
            .gte("work_date", start)
            .lte("work_date", end)
            .in(
              "employee_id",
              mappedEmp.map((e) => e.id)
            );

          if (sErr) throw sErr;

          const m: Record<string, ShiftRow> = {};
          (s ?? []).forEach((r) => {
            const key = `${r.employee_id}|${r.work_date}`;
            m[key] = {
              employee_id: r.employee_id,
              work_date: r.work_date,
              type: r.type as ShiftRow["type"],
              hours: r.hours ?? 0,
            };
          });
          setShiftsMap(m);
        } else {
          setShiftsMap({});
        }
      } catch (e) {
        console.error(e);
        toast.error("Tietojen haku epäonnistui");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.length]);

  const activeEmployees = employees; // jo suodatettu yllä

  // Lue solun vuoro mapista
function getShift(empId: string, dayIndex: number): ShiftType {
  const iso = dates[dayIndex].iso;
  const key = `${empId}|${iso}`;
  const row = shiftsMap[key];
  if (!row) return { type: "empty" };                 // UI-fallback
  if (row.type === "normal" || row.type === "locked") {
    return { type: row.type, hours: row.hours ?? 0 };
  }
  return { type: row.type }; // absent/holiday
}

  // Yhteensä tunnit / työntekijä
  const getTotalHours = (employee: Employee) =>
    dates.reduce((sum, _, i) => {
      const s = getShift(employee.id, i);
      return sum + (s.hours || 0);
    }, 0);

  // Klikkaus: toggle empty <-> normal(8h), upsert DB:hen
// ScheduleTable.tsx

async function handleCellClick(employeeId: string, dayIndex: number, hours: number | null) {
  setSelectedCell({ employee: employeeId, day: dayIndex });

  const iso = dates[dayIndex].iso;
  const key = `${employeeId}|${iso}`;
  const curr = shiftsMap[key];

  if (hours && hours > 0) {
    // -> aseta uusi vuoro valituilla tunneilla
    const next = { employee_id: employeeId, work_date: iso, type: "normal" as const, hours };

    // optimistic update
    setShiftsMap(m => ({ ...m, [key]: next }));

    const { error } = await supabase.from("shifts").upsert(next, { onConflict: "employee_id,work_date" });
    if (error) {
      // revert
      setShiftsMap(m => {
        const copy = { ...m };
        if (curr) copy[key] = curr; else delete copy[key];
        return copy;
      });
      toast.error("Tallennus epäonnistui");
      return;
    }
    toast.success(`${hours}h tallennettu`);
  } else {
    // -> poista rivi
    setShiftsMap(m => {
      const copy = { ...m };
      delete copy[key];
      return copy;
    });

    const { error } = await supabase
      .from("shifts")
      .delete()
      .eq("employee_id", employeeId)
      .eq("work_date", iso);

    if (error) {
      setShiftsMap(m => ({ ...m, [key]: curr! }));
      toast.error("Poisto epäonnistui");
      return;
    }
    toast.success("Vuoro poistettu");
  }
}



  // UI-helper solun ulkoasuun
  const getShiftDisplay = (shift: ShiftType) => {
    switch (shift.type) {
      case "normal":
        return { content: `${shift.hours}h`, color: "bg-primary text-primary-foreground", icon: <Clock className="w-3 h-3" /> };
      case "locked":
        return { content: `${shift.hours}h`, color: "bg-amber-500 text-white", icon: <Lock className="w-3 h-3" /> };
      case "absent":
        return { content: "A", color: "bg-destructive text-destructive-foreground", icon: <AlertCircle className="w-3 h-3" /> };
      case "holiday":
        return { content: "H", color: "bg-blue-500 text-white", icon: <Plane className="w-3 h-3" /> };
      default:
        return { content: "", color: "bg-muted hover:bg-accent", icon: <Plus className="w-3 h-3 opacity-0 group-hover:opacity-50" /> };
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Ladataan…</div>;
  }

  return (
  <div className="w-full space-y-6">
    <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Calendar className="w-6 h-6 text-primary" />
            <CardTitle className="text-2xl text-primary">Vuorot</CardTitle>
          </div>
          <Badge variant="secondary" className="px-3 py-1">
            <Users className="w-4 h-4 mr-2" />
            {activeEmployees.length} työntekijää
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-full">
            {/* Header */}
            <div className="bg-muted/50 border-b">
              <div className="grid grid-cols-11 gap-px">
                <div className="p-4 bg-background">
                  <span className="text-sm font-medium text-muted-foreground">Työntekijä</span>
                </div>
                {dates.map((date, index) => (
                  <div key={index} className="p-3 bg-background text-center">
                    <div className="text-xs font-medium text-muted-foreground">{date.day}</div>
                    <div className="text-sm font-semibold mt-1">{date.date}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Employee Rows */}
            <div className="divide-y divide-border">
              {activeEmployees.map((employee) => (
                <div
                  key={employee.id}
                  className="grid grid-cols-11 gap-px hover:bg-accent/30 transition-colors"
                >
                  <div className="p-4 bg-background flex items-center justify-between">
                    <div>
                      <span className="font-medium">{employee.name}</span>
                      <div className="text-xs text-muted-foreground">{employee.department}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {getTotalHours(employee)}h
                    </Badge>
                  </div>

                  {dates.map((_, dayIndex) => {
                    const shift = getShift(employee.id, dayIndex);
                    const shiftDisplay = getShiftDisplay(shift);
                    const isSelected =
                      selectedCell?.employee === employee.id && selectedCell?.day === dayIndex;

                    return (
                      <Popover
  key={dayIndex}
  open={openPopover === `${employee.id}-${dayIndex}`}
  onOpenChange={(o) =>
    setOpenPopover(o ? `${employee.id}-${dayIndex}` : null)
  }
>
  <PopoverTrigger asChild>
    <div
      className={`
        h-16 p-2 m-0 rounded-none border-0 group cursor-pointer
        flex items-center justify-center
        ${shiftDisplay.color}
        ${isSelected ? "ring-2 ring-ring ring-offset-2" : ""}
        transition-all duration-200 hover:scale-105 hover:shadow-md
      `}
    >
      <div className="flex flex-col items-center space-y-1">
        {shiftDisplay.icon}
        {shiftDisplay.content && (
          <span className="text-xs font-medium">{shiftDisplay.content}</span>
        )}
      </div>
    </div>
  </PopoverTrigger>


                        <PopoverContent className="w-64 p-3 space-y-3" side="bottom" align="center">
                          <div className="text-sm font-medium text-center">
                            {employee.name} – {dates[dayIndex].day} {dates[dayIndex].date}
                          </div>

                          {/* Pikavalinnat */}
                          <div className="grid grid-cols-2 gap-2">
                            {[4, 6, 7.5, 8].map((h) => (
                            <Button
  key={h}
  variant="outline"
  size="sm"
  onClick={() => {
    handleCellClick(employee.id, dayIndex, h);
    setOpenPopover(null); // sulkee popoverin heti
  }}
  className="justify-center"
>
  {h}h
</Button>
                            ))}
                          </div>

                          {/* Muu-arvo */}
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="0.5"
                              placeholder="esim. 5.5"
                              className="h-8"
                             onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") {
    const val = parseFloat(e.currentTarget.value);
    if (!isNaN(val)) {
      handleCellClick(employee.id, dayIndex, val);
      setOpenPopover(null);
    }
  }
}}

                            />
                            <Button
                              size="sm"
                              onClick={(e) => {
                                const input = (e.currentTarget.parentElement?.querySelector(
                                  "input"
                                ) as HTMLInputElement) || null;
                                const val = input ? parseFloat(input.value) : NaN;
                                if (!isNaN(val)) handleCellClick(employee.id, dayIndex, val);
                              }}
                            >
                              ✓
                            </Button>
                          </div>

                          <div className="text-xs text-muted-foreground text-center">
                            Vinkki: 0h poistaa vuoron.
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Summary Row */}
            <div className="bg-accent/50 border-t-2 border-primary/20">
              <div className="grid grid-cols-11 gap-px">
                <div className="p-4 bg-background">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      Yhteensä ({activeEmployees.length} työntekijää)
                    </span>
                  </div>
                </div>
                {dates.map((_, dayIndex) => {
                  const dayTotal = activeEmployees.reduce((total, emp) => {
                    const s = getShift(emp.id, dayIndex);
                    return total + (s?.hours || 0);
                  }, 0);

                  const filledCount = activeEmployees.filter(
                    (emp) => getShift(emp.id, dayIndex)?.type !== "empty"
                  ).length;

                  return (
                    <div key={dayIndex} className="p-3 bg-background text-center">
                      <div className="text-sm font-semibold text-primary">{dayTotal}h</div>
                      <div className="text-xs text-muted-foreground">{filledCount} henkilöä</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Legend */}
    <Card className="shadow-md">
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-4 items-center justify-center">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-primary rounded-sm flex items-center justify-center">
              <Clock className="w-2.5 h-2.5 text-primary-foreground" />
            </div>
            <span className="text-sm">Normaali vuoro</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-amber-500 rounded-sm flex items-center justify-center">
              <Lock className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-sm">Lukittu vuoro</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-destructive rounded-sm flex items-center justify-center">
              <AlertCircle className="w-2.5 h-2.5 text-destructive-foreground" />
            </div>
            <span className="text-sm">Poissaolo</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center">
              <Plane className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-sm">Loma</span>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Footer Note */}
    <div className="text-center text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
      Vinkki: klikkaa solua → valitse tunnit. 0h poistaa vuoron.
    </div>
  </div>
);
}

export default ScheduleTable;
