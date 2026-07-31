import { NextResponse } from "next/server";
import { listWatchlist, watchHandle } from "@/lib/tracker";

export async function GET() {
  try {
    const items = await listWatchlist();
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load watchlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { handle?: string };
    if (!body.handle?.trim()) {
      return NextResponse.json({ error: "Missing handle" }, { status: 400 });
    }

    const listing = await watchHandle(body.handle.trim());
    return NextResponse.json({ listing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add to watchlist";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
