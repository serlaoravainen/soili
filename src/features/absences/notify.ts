// src/features/absences/notify.ts
import { supabase } from "@/lib/supaBaseClient";
import { sendEmail } from "@/lib/sendEmail";
import { useSettingsStore } from "@/store/useSettingsStore";

export type AbsenceDecision = "approved" | "declined";

export async function notifyAbsenceDecision(args: {
  employeeId: string;
  status: AbsenceDecision;
  startDate: string;
  endDate?: string | null;
  adminMessage?: string;
}) {
  const { employeeId, status, startDate, endDate, adminMessage } = args;

  // Lue asetus stores­ta ilman React-koukkua
  const settings = useSettingsStore.getState().settings;
  const emailEnabled = settings?.notifications?.emailNotifications ?? true;
  if (!emailEnabled) return;

  // Hae vastaanottaja
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("email, name")
    .eq("id", employeeId)
    .single();

  if (empErr) {
    console.warn("[notifyAbsenceDecision] employee fetch error", empErr);
    return;
  }
  if (!emp?.email) {
    console.warn("[notifyAbsenceDecision] employee has no email");
    return;
  }

  const period = endDate && endDate !== startDate ? `${startDate}–${endDate}` : startDate;
  const subject =
    status === "approved"
      ? `Poissaolopyyntösi on hyväksytty (${period})`
      : `Poissaolopyyntösi on hylätty (${period})`;

  const parts: string[] = [];
  if (adminMessage?.trim()) {
    parts.push(
      status === "approved"
        ? `Viestisi vastaus:\n\n${adminMessage.trim()}\n\n`
        : `Perustelu:\n\n${adminMessage.trim()}\n\n`
    );
  }
  parts.push(
    `Hei ${emp.name ?? ""},\n\nPoissaolopyyntösi on ${status === "approved" ? "hyväksytty" : "hylätty"}.\nJakso: ${period}\n`
  );
  if (status === "declined") parts.push("\nJos tämä on virhe, ole yhteydessä esihenkilöön.\n");
  parts.push("\nTerveisin,\nSoili");

  // Lähetä sähköposti (Resend sandbox huomio: menee vain omaan osoitteeseesi kunnes domain verifioitu)
  try {
    await sendEmail({ to: emp.email, subject, text: parts.join("") });
  } catch (e) {
    console.error("[notifyAbsenceDecision] email send failed", e);
    // Älä heitä eteenpäin – hyväksyntä/hylkäys ei saa kaatua mailiin
  }

  // Kirjaa loki (valinnainen, mutta hyödyllinen)
  try {
    await supabase.from("notifications").insert({
      type: status === "approved" ? "absence_approved" : "absence_declined",
      title: status === "approved" ? "Poissaolo hyväksytty" : "Poissaolo hylätty",
      message: `${emp.name ?? ""} • ${period}`,
    });
  } catch (e) {
    console.warn("[notifyAbsenceDecision] log insert failed", e);
  }
}
