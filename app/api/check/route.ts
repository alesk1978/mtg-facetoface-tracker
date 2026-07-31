import { NextResponse } from "next/server";
import { checkPrices } from "@/lib/tracker";

export async function POST() {
  try {
    const snapshots = await checkPrices();
    return NextResponse.json({ snapshots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price check failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
