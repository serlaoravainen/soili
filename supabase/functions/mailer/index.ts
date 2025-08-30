// supabase/functions/mailer/index.ts
// Prosessoi mailijonon: lähettää adminille mailin uusista poissaolopyynnöistä.
// Ajastus: cronilla esim. joka minuutti.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type MailJob = {
  id: number;
  type: string;
  payload: {
    absence_id: string;
    employee_id: string;
    start_date: string;
    end_date?: string | null;
    reason?: string | null;
  };
  status: "queued" | "sent" | "failed" | string;
  attempt_count: number;
  last_error?: string | null;
  created_at: string;
  processed_at?: string | null;
};

type AppSettingsRow = {
  id: 1;
  email_notifications: boolean;
  notify_admin_on_new_absence: boolean;
  admin_notification_emails: string[];
  updated_at: string;
};

// ---- ENV ----
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Soili <onboarding@resend.dev>";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!RESEND_API_KEY) {
  throw new Error("Missing RESEND_API_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---- Resend sender ----
async function sendEmail(to: string[], subject: string, text: string) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      text,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Resend failed: ${resp.status} ${errText}`);
  }
}

// ---- Load settings (DB is source of truth) ----
async function loadSettings(): Promise<AppSettingsRow> {
    const { data, error } = await sb
    .from("app_settings")
    .select("email_notifications, admin_notification_emails, absence_requests, schedule_changes, employee_updates, system_updates, daily_digest, digest_time")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data ?? {
    email_notifications: true,
    admin_notification_emails: [],
    absence_requests: true,
    schedule_changes: true,
    employee_updates: false,
    system_updates: false,
    daily_digest: false,
    digest_time: "08:00",
  };
}

// ---- Process one job ----
async function processAdminNewAbsence(job: MailJob, settings: AppSettingsRow) {
  if (!settings.email_notifications) return "skipped: email_notifications=false";
  if (!settings.absence_requests) return "skipped: absence_requests=false";
  const recipients = settings.admin_notification_emails ?? [];
  if (!Array.isArray(recipients) || recipients.length === 0) return "skipped: no recipients";

  // Hae nimi
  const { data: emp, error: empErr } = await sb
    .from("employees")
    .select("name")
    .eq("id", job.payload.employee_id)
    .maybeSingle();

  if (empErr) throw empErr;

  const employeeName = emp?.name ?? "Tuntematon";
  const s = job.payload.start_date;
  const e = job.payload.end_date ?? job.payload.start_date;

  const subject = `Uusi poissaolopyyntö: ${employeeName} (${s}${e !== s ? `–${e}` : ""})`;
  const lines = [
    `Työntekijä: ${employeeName}`,
    `Ajankohta: ${s}${e !== s ? ` – ${e}` : ""}`,
    job.payload.reason ? `Syy: ${job.payload.reason}` : null,
    // Voit halutessa lisätä dashboard-linkin .env:iin, esim. DASHBOARD_URL
    Deno.env.get("DASHBOARD_URL") ? `Avaa hallinta: ${Deno.env.get("DASHBOARD_URL")}` : null,
  ].filter(Boolean);
  const text = lines.join("\n");

  await sendEmail(recipients, subject, text);
  return "sent";
}

// ---- Main queue loop ----
async function processQueue(limit = 25) {
  const settings = await loadSettings();

  const { data: jobs, error } = await sb
    .from("mail_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!jobs || jobs.length === 0) return { processed: 0 };

  let success = 0;
  let failed = 0;

  for (const job of jobs as MailJob[]) {
    try {
      let outcome = "skipped";
      if (job.type === "admin_new_absence") {
        outcome = await processAdminNewAbsence(job, settings);
      } else {
        outcome = `skipped: unknown type ${job.type}`;
      }

      // Päivitä tila
      await sb
        .from("mail_jobs")
        .update({
          status: outcome.startsWith("sent")
            ? "sent"
            : outcome.startsWith("skipped")
            ? "sent"
            : "failed",
          attempt_count: job.attempt_count + 1,
          last_error: outcome.startsWith("sent") ? null : outcome,
          processed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (outcome.startsWith("sent")) success++;
      else if (!outcome.startsWith("skipped")) failed++;
    } catch (e: unknown) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      await sb
        .from("mail_jobs")
        .update({
          status: "failed",
          attempt_count: job.attempt_count + 1,
          last_error: msg.slice(0, 500),
          processed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }


  return { processed: jobs.length, success, failed };
}

// ---- Edge entrypoint ----
Deno.serve(async () => {
  try {
    const res = await processQueue(25);
    return new Response(JSON.stringify(res), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});

