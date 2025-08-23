"use client";
import { create } from "zustand";
import { toast } from "sonner";
import { supabase } from "@/lib/supaBaseClient";
import type { Employee, DateInfo, ShiftType } from "@/app/types"; // ✅ käytä virallista tyyppiä


type ShiftRow = {
  employee_id: string;
  work_date: string; // YYYY-MM-DD
  type: "normal" | "locked" | "absent" | "holiday";
  hours: number | null;
};

type DateCell = DateInfo & { iso: string };

type Pending =
  | { kind: "upsert"; row: ShiftRow }
  | { kind: "delete"; employee_id: string; work_date: string };

type State = {
  employees: Employee[];                 // ✅ täysi Employee
  dates: DateCell[];
  shiftsMap: Record<string, ShiftRow>;
  pendingChanges: Pending[];
  undoStack: Pending[][];
  redoStack: Pending[][];
  dirty: boolean;
};

type Actions = {
  hydrate: (p: { employees: Employee[]; dates: DateCell[]; shifts: ShiftRow[] }) => void;
  applyCellChange: (row: { employee_id: string; work_date: string; hours: number | null; type?: ShiftRow["type"] }) => void;
  saveAll: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  autoGenerate: () => void;
  exportCSV: () => void;
  exportPrintable: () => void;
};

function keyOf(eid: string, iso: string) {
  return `${eid}|${iso}`;
}

export const useScheduleStore = create<State & Actions>((set, get) => ({
  employees: [],        // ✅
  dates: [],
  shiftsMap: {},
  pendingChanges: [],
  undoStack: [],
  redoStack: [],
  dirty: false,

  hydrate: ({ employees, dates, shifts }) => {
    const m: Record<string, ShiftRow> = {};
    shifts.forEach(r => { m[keyOf(r.employee_id, r.work_date)] = r; });
    set({
      employees,         // ✅ talleta täysi Employee-lista
      dates,
      shiftsMap: m,
      pendingChanges: [],
      undoStack: [],
      redoStack: [],
      dirty: false,
    });
  },

applyCellChange: ({ employee_id, work_date, hours, type }) => {
  const { shiftsMap, pendingChanges, undoStack } = get();
  const k = `${employee_id}|${work_date}`;
  const nextMap = { ...shiftsMap };

  let change: Pending;

  if (hours && hours > 0) {
    const row: ShiftRow = { employee_id, work_date, type: type ?? "normal", hours };
    nextMap[k] = row;
    change = { kind: "upsert", row };
  } else {
    delete nextMap[k];
    change = { kind: "delete", employee_id, work_date };
  }

  set({
    shiftsMap: nextMap,
    pendingChanges: [...pendingChanges, change],
    undoStack: [...undoStack, [change]],   // 🔑 lisätään viimeisin muutos batchina
    redoStack: [],
    dirty: true,
  });
},



saveAll: async () => {
  const { pendingChanges } = get();
  if (pendingChanges.length === 0) {
    toast.message("Ei tallennettavia muutoksia");
    return;
  }

  const upserts: ShiftRow[] = [];
  const deletes: { employee_id: string; work_date: string }[] = [];

  pendingChanges.forEach((c) => {
    if (c.kind === "upsert") upserts.push(c.row);
    else deletes.push({ employee_id: c.employee_id, work_date: c.work_date });
  });

  try {
    if (upserts.length) {
      const { error } = await supabase.from("shifts").upsert(upserts, {
        onConflict: "employee_id,work_date",
      });
      if (error) throw error;
    }

    for (const d of deletes) {
      const { error } = await supabase
        .from("shifts")
        .delete()
        .eq("employee_id", d.employee_id)
        .eq("work_date", d.work_date);
      if (error) throw error;
    }

    set({ pendingChanges: [], dirty: false });
    toast.success("Muutokset tallennettu");
  } catch (e) {
    console.error(e);
    toast.error("Tallennus epäonnistui");
  }
},


 undo: () => {
  const { undoStack, shiftsMap, redoStack } = get();
  if (undoStack.length === 0) return;

  const lastBatch = undoStack[undoStack.length - 1];
  const newMap = { ...shiftsMap };

  // Käännä viimeisin batch
  lastBatch.forEach((c) => {
    if (c.kind === "upsert") {
      delete newMap[`${c.row.employee_id}|${c.row.work_date}`];
    } else {
      // Jos poistettiin, tähän voisi palauttaa rivin, mutta MVP:ssä skippaa
    }
  });

  set({
    shiftsMap: newMap,
    undoStack: undoStack.slice(0, -1),
    redoStack: [...redoStack, lastBatch],
    dirty: true,
  });
},

redo: () => {
  const { redoStack, shiftsMap, undoStack } = get();
  if (redoStack.length === 0) return;

  const batch = redoStack[redoStack.length - 1];
  const newMap = { ...shiftsMap };

  batch.forEach((c) => {
    if (c.kind === "upsert") {
      newMap[`${c.row.employee_id}|${c.row.work_date}`] = c.row;
    } else {
      delete newMap[`${c.employee_id}|${c.work_date}`];
    }
  });

  set({
    shiftsMap: newMap,
    undoStack: [...undoStack, batch],
    redoStack: redoStack.slice(0, -1),
    dirty: true,
  });
},


  autoGenerate: () => {
    const { employees, dates, shiftsMap, undoStack } = get();
    const nextMap = { ...shiftsMap };
    const batch: Pending[] = [];

    // Sääntö: Arkipäivät (ma–pe) tyhjät solut -> 8h
    dates.forEach((d) => {
      const wd = new Date(d.iso + "T00:00:00").getDay(); // 1=Mon ... 5=Fri
      const isWeekday = wd >= 1 && wd <= 5;
      if (!isWeekday) return;

      employees
        .filter((e) => e.isActive)
        .forEach((e) => {
          const k = keyOf(e.id, d.iso);
          if (!nextMap[k]) {
            const row: ShiftRow = {
              employee_id: e.id,
              work_date: d.iso,
              type: "normal",
              hours: 8,
            };
            nextMap[k] = row;
            batch.push({ kind: "upsert", row });
          }
        });
    });

    if (batch.length === 0) {
      toast.message("Ei tyhjiä arkipäiviä täytettäväksi");
      return;
    }

    set({
      shiftsMap: nextMap,
      pendingChanges: [...get().pendingChanges, ...batch],
      undoStack: [...get().undoStack, batch],
      redoStack: [],
      dirty: true,
    });
    toast.success(`Autogeneroitu ${batch.length} vuoroa (8h)`);
  },

  exportCSV: () => {
    const { employees, dates, shiftsMap } = get();
    const header = ["Employee", ...dates.map((d) => d.iso), "TotalHours"];
    const rows = employees.map((e) => {
      let total = 0;
      const cols = dates.map((d) => {
        const r = shiftsMap[keyOf(e.id, d.iso)];
        const h = r?.hours ?? 0;
        total += h || 0;
        return h ? String(h) : "";
      });
      return [e.name, ...cols, String(total)];
    });

    const csv = [header, ...rows].map((r) => r.map((x) => `"${x}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV luotu");
  },

  exportPrintable: () => {
    const { employees, dates, shiftsMap } = get();
    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Schedule</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border:1px solid #ddd; padding:6px; font-size:12px; text-align:center; }
  th { background:#f4f4f6; }
  h1{ font-size:16px; }
</style>
</head>
<body>
  <h1>Vuorotaulukko</h1>
  <table>
    <thead>
      <tr>
        <th>Employee</th>
        ${dates.map((d) => `<th>${d.iso}</th>`).join("")}
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${employees
        .map((e) => {
          let total = 0;
          const cells = dates
            .map((d) => {
              const r = shiftsMap[keyOf(e.id, d.iso)];
              const h = r?.hours ?? 0;
              total += h || 0;
              return `<td>${h ? h : ""}</td>`;
            })
            .join("");
          return `<tr><td style="text-align:left">${e.name}</td>${cells}<td>${total}</td></tr>`;
        })
        .join("")}
    </tbody>
  </table>
  <script>window.print()</script>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    toast.success("Tulostettava näkymä avattu (Tallenna PDF:ksi)");
  },
}));
