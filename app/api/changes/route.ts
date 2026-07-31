import { NextRequest, NextResponse } from "next/server";
import { recentChanges } from "@/lib/tracker";
import type { ChangeFilters } from "@/lib/types";

function parseFilters(request: NextRequest): ChangeFilters {
  const params = request.nextUrl.searchParams;
  const sets = params.getAll("set").filter(Boolean);
  const period = params.get("period");
  const minDelta = params.get("minDelta");
  const direction = params.get("direction");

  let periodDays: number | null = null;
  if (period === "7") periodDays = 7;
  else if (period === "30") periodDays = 30;
  else if (period === "90") periodDays = 90;
  else if (period === "365") periodDays = 365;
  else if (period === "all") periodDays = null;

  return {
    query: params.get("q") ?? undefined,
    minAbsDelta: minDelta ? Number(minDelta) : undefined,
    sets: sets.length ? sets : undefined,
    periodDays,
    direction:
      direction === "up" || direction === "down" || direction === "any"
        ? direction
        : "any",
  };
}

export async function GET(request: NextRequest) {
  try {
    const result = await recentChanges(parseFilters(request));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load changes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
