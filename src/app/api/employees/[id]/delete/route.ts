import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

    const userSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authHeader } },
  }
    );
    const { data: userRes } = await userSb.auth.getUser();
    if (!userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: me, error: roleErr } = await userSb
    .from("employees")
    .select("role")
      .eq("auth_user_id", userRes.user.id)
    .maybeSingle();
    if (roleErr || !me || me.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

    const adminSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: target, error: tgtErr } = await adminSb
    .from("employees")
    .select("auth_user_id")
      .eq("id", id)
    .maybeSingle();
    if (tgtErr || !target) {
      return NextResponse.json({ error: tgtErr?.message ?? "Not found" }, { status: 404 });
  }

    const { error: empErr } = await adminSb.from("employees").delete().eq("id", id);
    if (empErr) {
      return NextResponse.json({ error: empErr.message }, { status: 500 });
  }

    const { error: authErr } = await adminSb.auth.admin.deleteUser(target.auth_user_id);
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
}

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}

