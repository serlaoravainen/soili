// supabase/functions/sendemail/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend@3";
import { z } from "npm:zod@3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") ?? "");
const FROM = Deno.env.get("FROM_EMAIL") ?? "Soili <onboarding@resend.dev>";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

function corsHeaders(origin: string | null) {
  const o = origin && ALLOWED_ORIGIN !== "*" ? ALLOWED_ORIGIN : "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

const BodySchema = z.object({
  to: z.union([
    z.string().email(),
    z.array(z.string().email()).nonempty(),
  ]),
  subject: z.string().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
  replyTo: z.string().email().optional(),
  _honey: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders(req.headers.get("Origin")),
    });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      { status: 405, headers: { "content-type": "application/json", ...corsHeaders(req.headers.get("Origin")) } },
    );
  }

  try {
    console.log("=== DEBUG: sendemail request received ===");
    console.log("Authorization header:", req.headers.get("authorization"));
    const raw = await req.clone().text();
    console.log("Raw body string:", raw);

    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch {
      console.log("Body is not valid JSON");
    }
    console.log("Parsed body:", json);

    const origin = req.headers.get("Origin");
    const headers = {
      "content-type": "application/json",
      ...corsHeaders(origin),
    };

    const auth = req.headers.get("authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization Bearer token" }), {
        status: 401,
        headers,
      });
    }

    if (!json) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers,
      });
    }

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({
        error: "Invalid body",
        details: parsed.error.flatten(),
      }), {
        status: 400,
        headers,
      });
    }

    const { to, subject, text, html, replyTo, _honey } = parsed.data;

    if (_honey && _honey.trim() !== "") {
      return new Response(JSON.stringify({ ok: true, dropped: true }), {
        status: 200,
        headers,
      });
    }

    if (!text && !html) {
      return new Response(JSON.stringify({ error: "Provide 'text' or 'html'" }), {
        status: 400,
        headers,
      });
    }

async function sendInChunks(
  to: string[],
  subject: string,
  text?: string,
  html?: string,
  replyTo?: string,
) {
  const CHUNK_SIZE = 1; // testaa ensin 1 vastaanottaja per request
  const results: any[] = [];
  for (let i = 0; i < to.length; i += CHUNK_SIZE) {
    const chunk = to.slice(i, i + CHUNK_SIZE);
    console.log("Sending chunk:", chunk);

    try {
      const sendRes = await resend.emails.send({
        from: FROM,
        to: chunk,
        subject,
        text: text ?? undefined,
        html: html ?? undefined,
        reply_to: replyTo,
      });

      if (sendRes.error) {
        console.error("Resend error:", sendRes.error);
      } else {
        results.push(sendRes);
      }
    } catch (err) {
      console.error("Exception while sending:", err);
    }
  }
  return results;
}


    const results = await sendInChunks(
      Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
      replyTo,
    );

    return new Response(JSON.stringify({ ok: true, sent: results.length }), {
      status: 200,
      headers,
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: "Internal error",
      details: String(e),
    }), {
      status: 500,
      headers: {
        "content-type": "application/json",
        ...corsHeaders(req.headers.get("Origin")),
      },
    });
  }
});
