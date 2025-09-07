"use client";

import { useScheduleStore } from "@/store/useScheduleStore";
import React, { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import NotificationsPopover from "./ui/NotificationsPopover";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import SettingsDialog from "./SettingsDialog";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  Upload,
  RefreshCw,
  Calendar as CalIcon,
  FileSpreadsheet,
  FileText,
  Wand2,
  Undo,
  Redo,
  Filter,
  Search,
  Check,
  ChevronDown,
  X,
  Building,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supaBaseClient";
import { addDaysLocalISO } from "@/lib/dateUtils";


// ——— Valikoiva, tyypitetty poiminta hashydrate-funktiolle ilman anyä ———
type HashydrateFn = (() => void) | undefined;
const selectHashydrate = <T extends object>(s: T): HashydrateFn =>
  (s as unknown as { hashydrate?: () => void }).hashydrate;




function formatTime(d = new Date()) {
  return d.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" });
}


  function getISOWeek(dateIso: string) {
  const d = new Date(dateIso + "T00:00:00");
  // ISO week algorithm
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    );
  return week;
}


type EmpRow = {
  id: string;
  name: string;
  email: string;
  department: string;
  is_active: boolean;
};

type ShiftRow = {
  employee_id: string;
  work_date: string;
  type: "normal" | "locked" | "absent" | "holiday";
  hours: number | null;
};

const Toolbar = () => {

  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);
  

  const START_ISO = useScheduleStore((s) => s.startDateISO);
  const DAYS = useScheduleStore((s) => s.days);


   const defaultHours = useSettingsStore((s) => s.settings.autoGeneration.defaultHours);
   const hashydrateSettings = useSettingsStore(selectHashydrate);
   const hashydrateSchedule = useScheduleStore(selectHashydrate);

  useEffect(() => {
    // Aja heti mountissa ja aina hashin vaihtuessa.
    // Järjestys: ensin asetukset -> sitten aikataulu.
    const run = () => {
      try { hashydrateSettings?.(); } catch {}
      try { hashydrateSchedule?.(); } catch {}
    };
    run();
    window.addEventListener("hashchange", run);
    return () => window.removeEventListener("hashchange", run);
  }, [hashydrateSettings, hashydrateSchedule]);



  const range = useMemo(
  () => Array.from({ length: DAYS }, (_, i) => addDaysLocalISO(START_ISO, i)),
  [START_ISO, DAYS]
);



const undo = useScheduleStore((s) => s.undo);
const redo = useScheduleStore((s) => s.redo);
const canUndo = useScheduleStore((s) => s.undoStack.length > 0);
const canRedo = useScheduleStore((s) => s.redoStack.length > 0);

const saveAll = useScheduleStore((s) => s.saveAll);
const dirty = useScheduleStore((s) => s.dirty);

// Julkaisu / peruutus
async function handlePublish() {
  const { publishShifts } = useScheduleStore.getState();
  await publishShifts();
}

async function handleUnpublish() {
  const { unpublishShifts } = useScheduleStore.getState();
  await unpublishShifts();
}

// Automaattinen tallennus debounce-logiikalla
useEffect(() => {
  if (!dirty) return;
  const timeout = setTimeout(() => {
    saveAll().then(() => {
      setLastSavedAt(formatTime());
    });
  }, 800); // debounce 800ms
  return () => clearTimeout(timeout);
}, [dirty, saveAll]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [empCount, setEmpCount] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ————— data hakuja joita export/healthcheck/auto-gen käyttää —————
  // Yleinen hakufunktio: includeInactive=true -> ei suodateta is_active:lla
  async function fetchEmployees(includeInactive: boolean): Promise<EmpRow[]> {
    let q = supabase
      .from("employees")
      .select("id, name, email, department, is_active")
      .order("created_at", { ascending: true });
    if (!includeInactive) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as EmpRow[];
    setEmpCount(rows.length);
    return rows;
  }
  // Säilytetään vanha signatuuri muulle koodille (auto-gen, import, PDF…)
 async function fetchActiveEmployees(): Promise<EmpRow[]> {
    return fetchEmployees(false);
  }

  async function fetchShiftsByRange(empIds?: string[]): Promise<ShiftRow[]> {
    const start = range[0];
    const end = range[range.length - 1];
    let q = supabase
      .from("shifts")
      .select("employee_id, work_date, type, hours")
      .gte("work_date", start)
      .lte("work_date", end);

    if (empIds && empIds.length) q = q.in("employee_id", empIds);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ShiftRow[];
  }

  type AbsenceRow = {
  employee_id: string;
  start_date: string;             // YYYY-MM-DD
  end_date: string | null;        // voi olla null → käytä start_datea
  status: "pending" | "approved" | "declined";
};

async function fetchAbsencesByRange(empIds: string[]): Promise<AbsenceRow[]> {
  const { data, error } = await supabase
    .from("absences")
    .select("employee_id, start_date, end_date, status")
    .in("employee_id", empIds)
    .neq("status", "declined"); // vain pending/approved blokkaa

  if (error) throw error;
  const rows = (data ?? []) as AbsenceRow[];

  // Pidä vain poissaolot, jotka osuvat johonkin RANGE-päivään
  return rows.filter((r) => {
    const s = r.start_date;
    const e = r.end_date ?? s;
    return range.some((day) => day >= s && day <= e);
  });
}


  // ————— ACTIONS —————

  // 1) Auto-generointi — täyttää puuttuvat vuorot 8h normaaliksi, jos ei poissaoloa
  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    try {
      toast.info("Aloitetaan automaattinen vuorojen generointi…");

      const employees = await fetchActiveEmployees();
      if (!employees.length) {
        toast.info("Ei aktiivisia työntekijöitä.");
        return;
      }
      const empIds = employees.map((e) => e.id);
      const [existing, absences] = await Promise.all([
        fetchShiftsByRange(empIds),
        fetchAbsencesByRange(empIds),
      ]);

      // Map helpot tarkistukset
      const existingSet = new Set(existing.map((s) => `${s.employee_id}|${s.work_date}`));
      const absenceMap = new Map<string, { s: string; e: string }[]>();
      absences.forEach((a: { employee_id: string; start_date: string; end_date?: string | null }) => {
        const arr = absenceMap.get(a.employee_id) ?? [];
        arr.push({ s: a.start_date, e: a.end_date ?? a.start_date });
        absenceMap.set(a.employee_id, arr);
      });

      const batch: ShiftRow[] = [];
      for (const emp of employees) {
        for (const d of range) {
          const key = `${emp.id}|${d}`;
          if (existingSet.has(key)) continue; // älä koske olemassaolevaan

          // jos poissaolo kattaa päivän, skippaa
          const ranges = absenceMap.get(emp.id) ?? [];
          const blocked = ranges.some((r) => d >= r.s && d <= r.e);
          if (blocked) continue;

          batch.push({
            employee_id: emp.id,
            work_date: d,
            type: "normal",
            hours: defaultHours,
          });
        }
      }

      if (!batch.length) {
        toast.info("Ei täytettäviä tyhjiä soluja tälle jaksolle.");
        return;
      }

      const { error } = await supabase
        .from("shifts")
        .upsert(batch, { onConflict: "employee_id,work_date" });

      if (error) throw error;

      setLastSavedAt(formatTime());
      toast.success(`Generoitu ${batch.length} vuoroa.`);
      // Kirjaa ilmoitus
await supabase.from("notifications").insert({
  type: "shift_auto",
  title: "Vuorot generoitu",
  message: `Generoitu ${batch.length} vuoroa jaksolle ${range[0]} – ${range[range.length - 1]}.`
});
   } catch (e) {
  console.error(e);
  toast.error("Generointi epäonnistui");
} finally {
      setIsGenerating(false);
    }
  };


  // 3) Export CSV (Excel avaa suoraan)
  const exportSettings = useSettingsStore((s) => s.settings.export);


  const handleExportExcel = async () => {
    try {
      // Hae työntekijät asetuksen mukaan (mukaan myös ei-aktiiviset tarvittaessa)
      const employees = await fetchEmployees(!!exportSettings.includeInactiveEmployees);
      const empIds = employees.map((e) => e.id);
      const shifts = await fetchShiftsByRange(empIds);
      const byId = new Map(employees.map((e) => [e.id, e]));

      // Dynaaminen header asetusten mukaan
      const header: string[] = [];
      if (exportSettings.includeNames) header.push("employee_name");
      if (exportSettings.includeEmails) header.push("employee_email");
      if (exportSettings.includeDepartments) header.push("department");
      header.push("work_date", "type", "hours");

      // Nopeaan lookupiin
      const shiftMap = new Map<string, ShiftRow>(); // empId|date -> shift
      shifts.forEach((s) => shiftMap.set(`${s.employee_id}|${s.work_date}`, s));

      // Apuri: muodosta yksi rivi
      const makeRow = (emp: EmpRow, date: string, s?: ShiftRow): (string | number)[] => {
        const row: (string | number)[] = [];
        if (exportSettings.includeNames) row.push(emp?.name ?? "");
        if (exportSettings.includeEmails) row.push(emp?.email ?? "");
        if (exportSettings.includeDepartments) row.push(emp?.department ?? "");
        row.push(date, s?.type ?? "", s?.hours ?? 0);
        return row;
      };

      // Rivit: includeEmptyShifts = jokaisesta päivästä rivi, muuten vain olemassa olevat
      const rows: (string | number)[][] = [];
      if (exportSettings.includeEmptyShifts) {
        for (const emp of employees) {
          for (const d of range) {
            rows.push(makeRow(emp, d, shiftMap.get(`${emp.id}|${d}`)));
          }
        }
      } else {
        shifts
          .sort((a, b) => (a.work_date < b.work_date ? -1 : a.work_date > b.work_date ? 1 : 0))
          .forEach((s) => rows.push(makeRow(byId.get(s.employee_id)!, s.work_date, s)));
      }

      let csv = [header, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");

        // Lisätty: tuntisummat loppuun, jos asetus päällä
      if (exportSettings.includeHourTotals) {
        const totals = new Map<string, number>(); // empId -> total hours
        for (const emp of employees) totals.set(emp.id, 0);
        for (const s of shifts) totals.set(s.employee_id, (totals.get(s.employee_id) ?? 0) + (s.hours ?? 0));
        const totalsRows = Array.from(totals.entries()).map(([empId, sum]) => {
          const emp = byId.get(empId)!;
          // label: nimi > email > id
          const label =
            exportSettings.includeNames ? emp.name :
            exportSettings.includeEmails ? emp.email : emp.id;
          return [label, String(sum)];
        });
        const totalsCsv =
          "\n\n" +
          ["employee", "total_hours"].join(",") +
          "\n" +
          totalsRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        csv += totalsCsv;
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
        // Tiedostonimeen yrityksen nimi
      const company = (exportSettings.companyName || "vuorot")
        .replace(/[^\p{L}\p{N}_-]+/gu, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^_|_$/g, "");
      a.download = `${company}_${range[0]}_${range[range.length - 1]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV ladattu");
    } catch (e) {
      console.error(e);
      toast.error("CSV-vienti epäonnistui");
    }
  };

  // 4) Export PDF (MVP: tulostusystävällinen näkymä -> print)
  const handleExportPDF = async () => {
    try {
      const employees = await fetchActiveEmployees();
      const shifts = await fetchShiftsByRange(employees.map((e) => e.id));
      const byId = new Map(employees.map((e) => [e.id, e]));

      const win = window.open("", "_blank", "width=1024,height=768");
      if (!win) {
        toast.error("Ponnahdusikkuna estetty");
        return;
      }
      const style = `
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system; padding: 24px; }
          h1,h2 { margin: 0 0 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f3f4f6; }
          .muted { color: #6b7280; font-size: 12px; margin-bottom: 12px; }
        </style>`;
      const header = `<h1>Vuorolistat</h1>
        <div class="muted">${range[0]} – ${range[range.length - 1]} • ${employees.length} työntekijää</div>`;

      const rowsHtml = shifts
        .sort((a, b) =>
          a.employee_id === b.employee_id
            ? a.work_date.localeCompare(b.work_date)
            : a.employee_id.localeCompare(b.employee_id)
        )
        .map((s) => {
          const e = byId.get(s.employee_id)!;
          return `<tr>
            <td>${e?.name ?? ""}</td>
            <td>${e?.email ?? ""}</td>
            <td>${e?.department ?? ""}</td>
            <td>${s.work_date}</td>
            <td>${s.type}</td>
            <td>${s.hours ?? 0}</td>
          </tr>`;
        })
        .join("");

      win.document.write(`
        <!doctype html><html><head><meta charset="utf-8" />
        <title>Vuorot</title>${style}</head><body>
          ${header}
          <table>
            <thead><tr>
              <th>Nimi</th><th>Sähköposti</th><th>Osasto</th>
              <th>Pvm</th><th>Tyyppi</th><th>Tunnit</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <script>window.print();</script>
        </body></html>
      `);
      win.document.close();
    } catch (e) {
      console.error(e);
      toast.error("PDF-vienti epäonnistui");
    }
  };

  // 5) Import CSV (email,work_date,hours)
  const handleImport = () => fileInputRef.current?.click();

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      // Odotettu header: email,work_date,hours
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) {
        toast.error("Tyhjä tiedosto");
        return;
      }

      const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
      const emailIdx = header.indexOf("email");
      const dateIdx = header.indexOf("work_date");
      const hoursIdx = header.indexOf("hours");
      if (emailIdx === -1 || dateIdx === -1 || hoursIdx === -1) {
        toast.error('Odotettu header: "email,work_date,hours"');
        return;
      }

      const employees = await fetchActiveEmployees();
      const byEmail = new Map(employees.map((e) => [e.email.toLowerCase(), e]));

      const bad: string[] = [];
      const batch: ShiftRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
        if (cols.length < 3) continue;
        const email = cols[emailIdx].toLowerCase();
        const d = cols[dateIdx];
        const h = parseFloat(cols[hoursIdx]);
        if (!email || !d || isNaN(h)) continue;
        const emp = byEmail.get(email);
        if (!emp) {
          bad.push(lines[i]);
          continue;
        }
        batch.push({
          employee_id: emp.id,
          work_date: d,
          type: h > 0 ? "normal" : "normal",
          hours: h > 0 ? h : 0,
        });
      }

      if (!batch.length) {
        toast.error("Ei kelvollisia rivejä importissa");
        return;
      }

      const { error } = await supabase
        .from("shifts")
        .upsert(batch, { onConflict: "employee_id,work_date" });
      if (error) throw error;

      setLastSavedAt(formatTime());
      if (bad.length) {
        toast.warning(
          `Import OK (${batch.length} riviä). ${bad.length} riviä jäi väliin tuntemattoman emailin takia.`
        );
      } else {
        toast.success(`Import OK (${batch.length} riviä).`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Import epäonnistui");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ————— UI —————
  const weekNo = useMemo(() => getISOWeek(START_ISO), [START_ISO]);
  const year = useMemo(() => new Date(START_ISO + "T00:00:00").getFullYear(), [START_ISO]);

  return (
    <Card className="shadow-md border-0 bg-gradient-to-r from-background to-secondary/10">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          {/* Left Section - Main Actions */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleAutoGenerate}
              disabled={isGenerating}
              className="bg-primary hover:bg-primary/90"
            >
              {isGenerating ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              {isGenerating ? "Generoidaan..." : "Auto-generointi"}
            </Button>

            <Separator orientation="vertical" className="h-8" />

{useScheduleStore((s) => s.publishStatus) === "pending" ? (
  <Button
    variant="outline"
    onClick={handleUnpublish}
    className="border-red-500 text-red-700"
  >
    <X className="w-4 h-4 mr-2" />
    Peru julkaisu
  </Button>
) : (
  <Button
    variant="outline"
    onClick={handlePublish}
    className="border-emerald-500 text-emerald-700"
  >
    <Check className="w-4 h-4 mr-2" />
    Julkaise vuorot
  </Button>
)}



<div className="flex items-center gap-1">
  <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo}>
    <Undo className="w-4 h-4" />
  </Button>
  <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo}>
    <Redo className="w-4 h-4" />
  </Button>
</div>
          </div>

    {/* Center Section - View Options */}
<div className="flex items-center gap-2">
  <SearchPopover />  {/* 🆕 oikea haku */}
  <FilterPopover />
  {/* Aikajakson valitsin */}
  <PeriodSelector />
</div>



          {/* Right Section - Export/Import */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
              }}
            />
            <Button variant="outline" onClick={handleImport}>
              <Upload className="w-4 h-4 mr-2" />
              Tuo
            </Button>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={handleExportExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>

            <Separator orientation="vertical" className="h-8" />
            <NotificationsPopover />


          <SettingsDialog />
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              Viimeksi tallennettu: {lastSavedAt ? lastSavedAt : "—"}
            </span>
            <span>•</span>
            <span>{empCount ?? "…"} työntekijää</span>
            <span>•</span>
            <span>
              Viikko {weekNo}/{year}
            </span>
            <span>•</span>
            <span>
              Jakso: {isClient && range.length > 0 ? `${range[0]} – ${range[range.length - 1]}` : "—"}
            </span>
          </div>
          
        </div>
      </CardContent>
    </Card>
  );
};

// === PeriodSelector ===
type PeriodValue = 7 | 10 | 14 | 30;
type PeriodItem = { value: PeriodValue; label: string; description: string };

const PERIODS: PeriodItem[] = [
  { value: 7,  label: "7 päivää",  description: "Viikkonäkymä" },
  { value: 10, label: "10 päivää", description: "Laajennettu" },
  { value: 14, label: "14 päivää", description: "Kaksiviikkoinen" },
  { value: 30, label: "30 päivää", description: "Kuukausinäkymä" },
];

function PeriodSelector() {
  const days = useScheduleStore((s) => s.days);
  const startISO = useScheduleStore((s) => s.startDateISO);
  const setRange = useScheduleStore((s) => s.setRange);


  const current = PERIODS.find((p) => p.value === days) ?? PERIODS[1];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 px-3 min-w-[160px] justify-start">
          <span className="inline-flex items-center gap-2">
            <CalIcon className="w-4 h-4" />
            <span>{current.label}</span>
            <ChevronDown className="w-3 h-3" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="center">
        <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
          Valitse aikajakso
        </div>
        <div className="space-y-1" role="menu" aria-label="Aikajakso">
          {PERIODS.map((option) => {
            const active = days === option.value;
            return (
              <button
                key={option.value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
  setRange(startISO, option.value); // ei alignointia täällä
}}
                className={`w-full flex items-center justify-between p-2 rounded-md text-left hover:bg-accent ${
                  active ? "bg-accent" : ""
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </div>
                <div className="flex items-center">
                  {active && <Check className="w-4 h-4 text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}




const DEFAULT_FILTERS = {
  departments: [] as string[],
  showActive: false,
  showInactive: false,
  searchTerm: "", 
  };

function FilterPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const filters = useScheduleStore((s) => s.filters) ?? DEFAULT_FILTERS;
  const setFilters = useScheduleStore((s) => s.setFilters) ?? (() => {});
  const resetFilters = useScheduleStore((s) => s.resetFilters) ?? (() => {});

 const employeesFromStore = useScheduleStore((s) => s.employees);
const employees = useMemo(() => employeesFromStore ?? [], [employeesFromStore]);

const employeeDepartments = useMemo(
  () => employees.map((e) => e.department),
  [employees]
);

const availableDepartments = useMemo(
  () => Array.from(new Set(employeeDepartments)).filter(Boolean) as string[],
  [employeeDepartments]
);


  // 2) Tila-suodatus on aktiivinen vain jos vain toinen toggle on päällä (XOR)
  const stateFilterActive = filters.showActive !== filters.showInactive;

  // 3) Badge: 1 piste osastofiltteristä (jos valittuja), 1 piste tila-XOR:sta
  const activeFilterCount =
    (filters.departments.length > 0 ? 1 : 0) +
    (stateFilterActive ? 1 : 0);

  const handleDepartmentToggle = (dept: string) => {
    const exists = filters.departments.includes(dept);
    setFilters({
      departments: exists
        ? filters.departments.filter((d) => d !== dept)
        : [...filters.departments, dept],
    });
  };

  const handleActiveToggle = () => setFilters({ showActive: !filters.showActive });
  const handleInactiveToggle = () => setFilters({ showInactive: !filters.showInactive });

  const handleClearFilters = () => {
    resetFilters();
    setIsOpen(false); // 4) UX: tyhjennä -> sulje
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div
          className={`
            inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium
            ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none
            disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-3 cursor-pointer
            ${activeFilterCount > 0 ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
          `}
        >
          <Filter className="w-4 h-4 mr-2" />
          Suodatin
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2 bg-white text-primary text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4" align="center">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Suodattimet</h3>
            {(filters.departments.length > 0 || stateFilterActive) && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-6 px-2 text-xs">
                <X className="w-3 h-3 mr-1" />
                Tyhjennä
              </Button>
            )}
          </div>

          <Separator />

          {/* Department Filters */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Osastot</span>
            </div>
            <div className="space-y-2 pl-6">
              {availableDepartments.map((department) => (
                <div key={department} className="flex items-center space-x-2">
                  <Checkbox
                    id={`dept-${department}`}
                    checked={filters.departments.includes(department)}
                    onCheckedChange={() => handleDepartmentToggle(department)}
                  />
                  <label htmlFor={`dept-${department}`} className="text-sm cursor-pointer">
                    {department}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Employee Status Filters */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Työntekijöiden tila</span>
            </div>
            <div className="space-y-2 pl-6">
              <div className="flex items-center space-x-2">
                <Checkbox id="show-active" checked={filters.showActive} onCheckedChange={handleActiveToggle} />
                <label htmlFor="show-active" className="text-sm cursor-pointer">
                  Näytä aktiiviset työntekijät
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="show-inactive" checked={filters.showInactive} onCheckedChange={handleInactiveToggle} />
                <label htmlFor="show-inactive" className="text-sm cursor-pointer">
                  Näytä ei-aktiiviset työntekijät
                </label>
              </div>
            </div>
          </div>

          {/* Filter Summary */}
          {(filters.departments.length > 0 || stateFilterActive) && (
            <>
              <Separator />
              <div className="text-xs text-muted-foreground">
                {filters.departments.length > 0 && <div>Osastot: {filters.departments.join(", ")}</div>}
                {stateFilterActive && (
                  <div>Tila: {filters.showActive ? "Vain aktiiviset" : "Vain ei-aktiiviset"}</div>
                )}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}



export default Toolbar;


function SearchPopover() {
  const filters = useScheduleStore((s) => s.filters) ?? DEFAULT_FILTERS;
  const setFilters = useScheduleStore((s) => s.setFilters);

  const [open, setOpen] = useState(false);
  const [localTerm, setLocalTerm] = useState(filters.searchTerm ?? "");
  const debTimer = React.useRef<number | null>(null);

  const handleSearchChange = (val: string) => {
    setLocalTerm(val);
    if (debTimer.current) window.clearTimeout(debTimer.current);
    debTimer.current = window.setTimeout(() => {
      setFilters({ searchTerm: val });
    }, 200);
  };

  const clear = () => {
    setLocalTerm("");
    setFilters({ searchTerm: "" });
  };

React.useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setLocalTerm("");
      setFilters({ searchTerm: "" });
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [open, setFilters]);

  const isActive = (filters.searchTerm ?? "").trim().length > 0;

  return (
      <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setLocalTerm(filters.searchTerm ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant={isActive ? "default" : "ghost"} size="sm" className="h-9">
          <Search className="w-4 h-4 mr-2" />
          Haku
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-4" align="center">
        <div className="space-y-3">
          <div className="text-base font-semibold">Haku</div>
          <div className="text-sm text-muted-foreground">Etsi työntekijöitä</div>
          <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
           <input
              className="w-full h-9 rounded-md border border-input bg-background px-3 pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Hae nimellä, sähköpostilla tai osastolla..."
              value={localTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              autoFocus
            />
            {localTerm && (
              <button
                type="button"
                aria-label="Tyhjennä haku"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={clear}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Haku toimii reaaliajassa ja etsii nimestä, sähköpostista ja osastosta
          </div>
          {isActive && (
            <>
              <Separator />
              <div className="text-xs text-muted-foreground bg-accent/50 p-2 rounded-md">
                <Search className="w-3 h-3 inline mr-1" />
                Hakutermi: “{filters.searchTerm}”
                <div className="mt-1">Näytetään työntekijät jotka vastaavat hakua</div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}