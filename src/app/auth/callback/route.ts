import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Intercambia el código del magic link / confirmación de email por una sesión. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/inicio";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return NextResponse.redirect(`${origin}/login?error=enlace`);
}
