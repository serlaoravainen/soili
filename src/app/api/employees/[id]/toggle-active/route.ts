import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { is_active } = await req.json();

    // 1) Authorization: Bearer <token>
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

    // 2) Kuka kutsuu?
    const userSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authHeader } },
  }
    );
    const { data: userRes } = await userSb.auth.getUser();
    if (!userRes?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 3) Admin-check
    const { data: me, error: roleErr } = await userSb
    .from("employees")
    .select("role")
      .eq("auth_user_id", userRes.user.id)
    .maybeSingle();
    if (roleErr || !me || me.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

    // 4) Päivitä aktiivisuus (service role -client, varmin)
    const adminSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data, error } = await adminSb
    .from("employees")
      .update({ is_active: !!is_active })
      .eq("id", id)
      .select("id, name, email, department, is_active")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  }

    return NextResponse.json({ employee: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
}
}

