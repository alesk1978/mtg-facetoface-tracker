import { NextResponse } from "next/server";
import { unwatch } from "@/lib/tracker";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ handle: string }> },
) {
  try {
    const { handle } = await context.params;
    const removed = await unwatch(decodeURIComponent(handle));
    if (!removed) {
      return NextResponse.json({ error: "Handle not on watchlist" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove from watchlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
