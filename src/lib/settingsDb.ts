// src/lib/settingsDb.ts
import { supabase } from "@/lib/supaBaseClient";
import type { Settings } from "@/lib/settingsSchema";

export async function saveNotificationSettingsToDb(notifs: Settings["notifications"]) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({
      id: 1,
      email_notifications: !!notifs.emailNotifications,
      notify_admin_on_new_absence: !!notifs.notifyAdminOnNewAbsence,
      admin_notification_emails: Array.isArray(notifs.adminNotificationEmails)
        ? notifs.adminNotificationEmails
        : [],
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (error) throw new Error(error.message);
}
