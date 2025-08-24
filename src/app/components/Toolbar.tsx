"use client";

import { useScheduleStore } from "@/store/useScheduleStore";
import React, { useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Upload,
  RefreshCw,
  Settings,
  Calendar as CalIcon,
  FileSpreadsheet,
  FileText,
  Wand2,
  Save,
  Undo,
  Redo,
  Filter,
  Search,
  Bell,
  Check,
  ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supaBaseClient";





// pvm apurit
function addDaysISO(iso: string, add: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}


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
  const START_ISO = useScheduleStore((s) => s.startDateISO);
  const DAYS = useScheduleStore((s) => s.days);
  const range = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDaysISO(START_ISO, i)), [START_ISO, DAYS]);


const undo = useScheduleStore((s) => s.undo);
const redo = useScheduleStore((s) => s.redo);
const canUndo = useScheduleStore((s) => s.undoStack.length > 0);
const canRedo = useScheduleStore((s) => s.redoStack.length > 0);

const saveAll = useScheduleStore((s) => s.saveAll);
const dirty = useScheduleStore((s) => s.dirty);

async function handleSave() {
  await saveAll();
}

  const [isGenerating, setIsGenerating] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [empCount, setEmpCount] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ————— data hakuja joita export/healthcheck/auto-gen käyttää —————
  async function fetchActiveEmployees(): Promise<EmpRow[]> {
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, email, department, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) throw error;
    const rows = (data ?? []) as EmpRow[];
    setEmpCount(rows.length);
    return rows;
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
            hours: 8,
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
   } catch (e) {
  console.error(e);
  toast.error("Generointi epäonnistui");
} finally {
      setIsGenerating(false);
    }
  };


  // 3) Export CSV (Excel avaa suoraan)
  const handleExportExcel = async () => {
    try {
      const employees = await fetchActiveEmployees();
      const shifts = await fetchShiftsByRange(employees.map((e) => e.id));
      const byId = new Map(employees.map((e) => [e.id, e]));
      const header = [
        "employee_name",
        "employee_email",
        "department",
        "work_date",
        "type",
        "hours",
      ];

      const rows = shifts
        .sort((a, b) => (a.work_date < b.work_date ? -1 : a.work_date > b.work_date ? 1 : 0))
        .map((s) => {
          const emp = byId.get(s.employee_id)!;
          return [
            emp?.name ?? "",
            emp?.email ?? "",
            emp?.department ?? "",
            s.work_date,
            s.type,
            s.hours ?? 0,
          ];
        });

      // lisää myös puuttuvat (tyhjät) rivit jos haluat: MVP ei lisää

      const csv = [header, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vuorot_${range[0]}_${range[range.length - 1]}.csv`;
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

<Button
  variant="outline"
  onClick={handleSave}
  disabled={!dirty}
  className={dirty ? "border-amber-500 text-amber-600" : ""}
>
  <Save className="w-4 h-4 mr-2" />
  Tallenna
  {dirty && (
    <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700">
      •
    </Badge>
  )}
</Button>


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
  <Button
    variant="ghost"
    size="sm"
    onClick={() => toast.info("Haku avautuu myöhemmin globaalina filttering-näkymänä")}
  >
    <Search className="w-4 h-4 mr-2" />
    Haku
  </Button>
  <Button
    variant="ghost"
    size="sm"
    onClick={() => toast.info("Suodatus tulee pian (osasto, tuntialue, tila)")}
  >
    <Filter className="w-4 h-4 mr-2" />
    Suodatin
  </Button>

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

            <Button variant="ghost" size="sm" onClick={() => toast.info("Ilmoitukset tulevat pian.")}>
              <Bell className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="sm" onClick={() => toast.info("Asetukset tulevat pian.")}>
              <Settings className="w-4 h-4" />
            </Button>
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
              Jakso: {range[0]} – {range[range.length - 1]}
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
                onClick={() => setRange(startISO, option.value)}
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


export default Toolbar;
