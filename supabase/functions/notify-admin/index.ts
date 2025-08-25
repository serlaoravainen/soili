/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// NPM-moduulit Deno:ssa
import webpush from "npm:web-push";
import { Resend } from "npm:resend";

// ENV
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// VAPID config
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// helperi: hae subskriptiot (service-role keyllä funktio saa täysoikeudet)
async function getSubscriptions(): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resp = await fetch(`${url}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth&is_active=eq.true`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!resp.ok) throw new Error(`fetch subs failed ${resp.status}`);
  return await resp.json();
}

type NotifyPayload = {
  type: "absence_request" | "absence_approved" | "absence_declined" | "employee_added" | "shift_auto" | "generic";
  title: string;
  message: string;
  url?: string;
  emailFallback?: boolean;
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: NotifyPayload;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // 1) web push kaikille aktiivisille
  let success = 0, fail = 0;
  try {
    const subs = await getSubscriptions();
    const payload = JSON.stringify({
      title: body.title,
      body: body.message,
      url: body.url || "/",
    });

await Promise.all(
  subs.map(async (s) => {
    try {
      const subscription: import("web-push").PushSubscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      await webpush.sendNotification(subscription, payload);
      success++;
    } catch {
      fail++;
    }
  }),
);
  } catch (e) {
    console.error("Push error", e);
  }

  // 2) maili (valinnainen)
  let mailStatus = "skipped";
  if (resend && body.emailFallback && ADMIN_EMAILS.length) {
    try {
      await resend.emails.send({
        from: "Soili <noreply@yourdomain.test>",
        to: ADMIN_EMAILS,
        subject: body.title,
        text: body.message,
      });
      mailStatus = "sent";
    } catch (e) {
      console.error("Resend error", e);
      mailStatus = "failed";
    }
  }

  return new Response(
    JSON.stringify({ ok: true, pushed_ok: success, pushed_fail: fail, mail: mailStatus }),
    { headers: { "content-type": "application/json" } },
  );
});
