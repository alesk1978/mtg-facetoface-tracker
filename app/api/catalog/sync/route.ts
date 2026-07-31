import { NextResponse } from "next/server";
import { syncCatalogBatch } from "@/lib/catalog-sync";

export async function POST() {
  try {
    const status = await syncCatalogBatch();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
