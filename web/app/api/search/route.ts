import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/tracker";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20");

  if (!query?.trim()) {
    return NextResponse.json({ error: "Missing search query (q)" }, { status: 400 });
  }

  try {
    const results = await search(query.trim(), limit);
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
