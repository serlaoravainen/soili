import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  // Tämä hakee/refreshaa sessionin ja synkkaa cookiet (myös /api-reiteille)
  await supabase.auth.getSession();
  return res;
}

// Aja middleware kaikille sivuille ja /api-reiteille, poislukien Nextin assetit
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};