// src/lib/sendEmail.ts
export type SendEmailPayload = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  _honey?: string;
};

const PROJECT_REF = "musrmpblsazxcrhwthtc"; // esim. abcd1234
const url = `https://${PROJECT_REF}.functions.supabase.co/sendemail`;

export async function sendEmail(payload: SendEmailPayload) {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (!anon) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY puuttuu (env). Käynnistä dev-server uudestaan env-muutosten jälkeen.");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text(); // ota talteen, vaikka ei olisi JSONia
let data: Record<string, unknown> | null = null;
try {
  data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
} catch {
  data = null;
}

  if (!res.ok) {
    const msg = [
      `Email send failed`,
      `status=${res.status}`,
      `statusText=${res.statusText}`,
      data?.error ? `error=${JSON.stringify(data.error)}` : text ? `body=${text}` : "",
    ].filter(Boolean).join(" | ");
    throw new Error(msg);
  }

  return data ?? { ok: true };
}
