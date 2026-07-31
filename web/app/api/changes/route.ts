import { NextResponse } from "next/server";
import { recentChanges } from "@/lib/tracker";

export async function GET() {
  try {
    const changes = await recentChanges();
    return NextResponse.json({ changes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load changes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
