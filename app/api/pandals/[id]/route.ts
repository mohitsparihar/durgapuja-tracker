import { NextResponse, type NextRequest } from "next/server";
import { PHOTO_BUCKET } from "@/lib/config";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Owner deletes a pandal. The row delete runs as the signed-in user (RLS decides
 * ownership). A DB trigger queues every cascaded photo object in storage_cleanup inside
 * the same transaction, so no object can be missed or lost. We then drain this pandal's
 * queue with the service role; anything that fails stays queued for a later pass.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "NOT_SIGNED_IN" }, { status: 401 });

  const del = await sb.from("pandals").delete({ count: "exact" }).eq("id", id);
  if (del.error) return NextResponse.json({ error: del.error.message, code: del.error.code }, { status: 400 });
  if (!del.count) return NextResponse.json({ error: "PERMISSION" }, { status: 403 });

  const admin = supabaseAdmin();
  if (!admin) {
    console.error("SUPABASE_SERVICE_ROLE_KEY missing; photo objects left queued in storage_cleanup");
    return NextResponse.json({ ok: true, cleanup: "queued" });
  }
  const queued = await admin.from("storage_cleanup").select("path").eq("pandal_id", id);
  if (queued.error) {
    console.error("could not read storage_cleanup", queued.error.message);
    return NextResponse.json({ ok: true, cleanup: "queued" });
  }
  const paths = (queued.data ?? []).map((r) => r.path as string);
  let pending = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const r = await admin.storage.from(PHOTO_BUCKET).remove(chunk);
    if (r.error) {
      pending += chunk.length;
      continue;
    }
    const done = await admin.from("storage_cleanup").delete().in("path", chunk);
    if (done.error) console.error("objects removed but queue rows kept", done.error.message);
  }
  if (pending) console.error("storage cleanup incomplete; left queued", pending);
  return NextResponse.json({ ok: true, cleanup: pending ? "queued" : "done" });
}
