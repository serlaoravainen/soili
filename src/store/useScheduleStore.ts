// src/store/useScheduleStore.ts
"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "sonner";
import { supabase } from "@/lib/supaBaseClient";

// KÄYTÄ YHTÄ TOTUUTTA: ota tyypit yhdestä paikasta
import type { Employee, DateInfo } from "@/app/types";

// Sama DateCell kuin muualla
export type DateCell = DateInfo & { iso: string };

// Yhden solun persistomuoto
export type ShiftRow = {
  employee_id: string;
  work_date: string; // YYYY-MM-DD
  type: "normal" | "locked" | "absent" | "holiday";
  hours: number | null; // null sallitaan, mutta tallennetaan 0:ksi kun kirjoitetaan DB:hen
};
// Suodattimien tyyppi
export type Filters = {
  departments: string[];
  showActive: boolean;
  showInactive: boolean;
};

// Sisäinen muutos, jota kerätään saveAll:lle
type PendingChange = {
  employee_id: string;
  work_date: string;
  hours: number; // 0 => poista, >0 => upsert "normal"
};

type State = {
  // Hydratoitu perusdata
  employees: Employee[];
  dates: DateCell[];

  // Vuorot mapattuna
  shiftsMap: Record<string, ShiftRow>;

  // Muutokset jotka pitää tallentaa
  pending: Record<string, PendingChange>;

  // Undo/redo pino
  undoStack: PendingChange[];
  redoStack: PendingChange[];

  // UI-signaalit
  dirty: boolean;

  // Filtterit
  filters: Filters;
  setFilters: (partial: Partial<Filters>) => void;
  resetFilters: () => void;

  startDateISO: string;
  days: number;

  setRange: (startDateISO: string, days: number) => void;
  setStartDate: (startDateISO: string) => void;
  shiftRange: (deltaDays: number) => void;

  // Toiminnot
  hydrate: (payload: {
    employees: Employee[];
    dates: DateCell[];
    shifts: ShiftRow[];
  }) => void;

  applyCellChange: (p: { employee_id: string; work_date: string; hours: number | null }) => void;

  saveAll: () => Promise<void>;

  undo: () => void;
  redo: () => void;
};

function keyOf(empId: string, iso: string) {
  return `${empId}|${iso}`;
}

export const useScheduleStore = create<State>()(
  devtools((set, get) => ({
    employees: [],
    dates: [],
    shiftsMap: {},
    pending: {},
    undoStack: [],
    redoStack: [],
    dirty: false,

    startDateISO: new Date().toISOString().substring(0, 10),
    days: 10,

    hydrate: ({ employees, dates, shifts }) => {
      // Rakennetaan map shifteistä
      const map: Record<string, ShiftRow> = {};
      for (const s of shifts) {
        map[keyOf(s.employee_id, s.work_date)] = {
          ...s,
          hours: s.hours ?? 0,
          // Varmista että type on unionista (tai normal jos tuntematon)
          type:
            s.type === "normal" ||
            s.type === "locked" ||
            s.type === "absent" ||
            s.type === "holiday"
              ? s.type
              : "normal",
        };
      }
      set({
        employees,
        dates,
        shiftsMap: map,
        pending: {},
        undoStack: [],
        redoStack: [],
        dirty: false,

        // ---Filtterit---
        filters: {
          departments: [],
          showActive: false,
          showInactive: false,
        },

        setFilters: (partial) =>
          set((state) => ({ filters: { ...state.filters, ...partial } })),

        resetFilters: () =>
          set({
            filters: { departments: [], showActive: false, showInactive: false },
            }),
      });
    },

    applyCellChange: ({ employee_id, work_date, hours }) => {
      const h = typeof hours === "number" ? hours : 0;
      const k = keyOf(employee_id, work_date);
      const { shiftsMap, pending, undoStack } = get();

      // Laske edellinen arvo (käytetään undo:ssa)
      const prev = shiftsMap[k];

      // Päivitä live-näkymään:
      const nextMap = { ...shiftsMap };
      if (h <= 0) {
        // 0h => poista vuoro näkyvistä
        delete nextMap[k];
      } else {
        // >0h => laita normal-h vuoro
        nextMap[k] = {
          employee_id,
          work_date,
          type: "normal",
          hours: h,
        };
      }

      // Päivitä pending: 0h => merkkaa poistoksi, muuten upsertiksi
      const nextPending = { ...pending, [k]: { employee_id, work_date, hours: h } };

      set({
        shiftsMap: nextMap,
        pending: nextPending,
        undoStack: [...undoStack, { employee_id, work_date, hours: prev?.hours ?? 0 }],
        redoStack: [],
        dirty: true,
      });
    },

 setRange: (startDateISO: string, days: number) => set({ startDateISO, days }),

setStartDate: (startDateISO: string) => set({ startDateISO }),

shiftRange: (deltaDays: number) => {
  const { startDateISO, days } = get();
  const d = new Date(startDateISO + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  const nextStart = d.toISOString().slice(0, 10);
  set({ startDateISO: nextStart, days });
},

    saveAll: async () => {
      const { pending } = get();
      const changes = Object.values(pending);
      if (!changes.length) {
        toast.info("Ei tallennettavia muutoksia");
        return;
      }

      const upserts: ShiftRow[] = [];
      const deletes: { employee_id: string; work_date: string }[] = [];

      for (const c of changes) {
        if (c.hours <= 0) {
          deletes.push({ employee_id: c.employee_id, work_date: c.work_date });
        } else {
          upserts.push({
            employee_id: c.employee_id,
            work_date: c.work_date,
            type: "normal",
            hours: c.hours,
          });
        }
      }

      try {
        // Tee transaktio peräkkäin: ensin upsert, sitten deletet
        if (upserts.length) {
          const { error } = await supabase
            .from("shifts")
            .upsert(upserts, { onConflict: "employee_id,work_date" });
          if (error) throw error;
        }

        if (deletes.length) {
          // Supabasen "in" yhdistelmäehdolla: suorita chunkkeina
          const chunkSize = 500;
          for (let i = 0; i < deletes.length; i += chunkSize) {
            const chunk = deletes.slice(i, i + chunkSize);
            const { error } = await supabase
              .from("shifts")
              .delete()
              .in(
                "employee_id",
                chunk.map((d) => d.employee_id)
              )
              .in(
                "work_date",
                chunk.map((d) => d.work_date)
              );
            if (error) throw error;
          }
        }

        set({ pending: {}, dirty: false });
        toast.success("Tallennettu");
      } catch (e) {
        console.error(e);
        toast.error("Tallennus epäonnistui");
        // ÄLÄ nollaa pendingiä epäonnistumisessa
      }
    },

    undo: () => {
      const { undoStack, shiftsMap, pending, redoStack } = get();
      if (!undoStack.length) return;
      const last = undoStack[undoStack.length - 1];

      const k = keyOf(last.employee_id, last.work_date);
      const current = shiftsMap[k]; // mitä on nyt UI:ssa

      // Palauta entinen tuntimäärä
      const nextMap = { ...shiftsMap };
      if (!last.hours || last.hours <= 0) {
        delete nextMap[k];
      } else {
        nextMap[k] = {
          employee_id: last.employee_id,
          work_date: last.work_date,
          type: "normal",
          hours: last.hours,
        };
      }

      // Päivitä pending vastaamaan undo-tilaa
      const nextPending = { ...pending, [k]: { employee_id: last.employee_id, work_date: last.work_date, hours: last.hours ?? 0 } };

      // Siirrä nykyinen tila redo-pinon itemiksi
      const redoItem: PendingChange = {
        employee_id: last.employee_id,
        work_date: last.work_date,
        hours: current?.hours ?? 0,
      };

      set({
        shiftsMap: nextMap,
        pending: nextPending,
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, redoItem],
        dirty: true,
      });
    },

    redo: () => {
      const { redoStack, shiftsMap, pending, undoStack } = get();
      if (!redoStack.length) return;
      const next = redoStack[redoStack.length - 1];

      const k = keyOf(next.employee_id, next.work_date);
      const prev = shiftsMap[k];

      const nextMap = { ...shiftsMap };
      if (!next.hours || next.hours <= 0) {
        delete nextMap[k];
      } else {
        nextMap[k] = {
          employee_id: next.employee_id,
          work_date: next.work_date,
          type: "normal",
          hours: next.hours,
        };
      }

      const nextPending = { ...pending, [k]: { ...next } };

      set({
        shiftsMap: nextMap,
        pending: nextPending,
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, { employee_id: next.employee_id, work_date: next.work_date, hours: prev?.hours ?? 0 }],
        dirty: true,
      });
    },
  }))
);
