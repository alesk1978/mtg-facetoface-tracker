import { NextResponse } from "next/server";
import { getCatalogSyncStatus } from "@/lib/catalog-sync";

export async function GET() {
  try {
    const status = await getCatalogSyncStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sync status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
