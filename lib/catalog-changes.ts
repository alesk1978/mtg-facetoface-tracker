import { collectSetsFromTitles } from "./card-meta";
import { isMissingTableError } from "./catalog-sync";
import { getSupabase } from "./supabase";
import type { ChangeFilters, ChangeSearchResult, PriceChange } from "./types";

interface SyncRunRow {
  id: number;
  completedAt: string;
}

interface SnapshotRow {
  shopifyId: number;
  title: string;
  handle: string;
  setName: string | null;
  price: number;
  imageUrl: string | null;
}

function periodStartIso(periodDays: number | null | undefined): string | null {
  if (periodDays === null || periodDays === undefined) return null;
  const start = new Date();
  start.setDate(start.getDate() - periodDays);
  return start.toISOString();
}

async function getCompleteRuns(): Promise<SyncRunRow[]> {
  const { data, error } = await getSupabase()
    .from("catalog_sync_runs")
    .select("id, completed_at")
    .eq("status", "complete")
    .order("completed_at", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    completedAt: String(row.completed_at),
  }));
}

function pickRuns(
  runs: SyncRunRow[],
  periodDays: number | null | undefined,
): { baselineRunId: number; currentRunId: number } | null {
  if (runs.length < 2) return null;

  const current = runs[runs.length - 1];
  const periodStart = periodStartIso(periodDays);

  let baseline = runs[0];
  if (periodStart) {
    const inPeriod = runs.filter((run) => run.completedAt >= periodStart);
    if (inPeriod.length >= 2) {
      baseline = inPeriod[0];
    } else {
      const beforePeriod = runs.filter((run) => run.completedAt <= periodStart);
      baseline = beforePeriod.length ? beforePeriod[beforePeriod.length - 1] : runs[0];
    }
  }

  if (baseline.id === current.id) return null;
  return { baselineRunId: baseline.id, currentRunId: current.id };
}

async function snapshotsForRun(runId: number): Promise<Map<number, SnapshotRow>> {
  const { data, error } = await getSupabase()
    .from("catalog_snapshots")
    .select("shopify_id, title, handle, set_name, price, image_url")
    .eq("run_id", runId);
  if (error) throw new Error(error.message);

  const map = new Map<number, SnapshotRow>();
  for (const row of data ?? []) {
    map.set(Number(row.shopify_id), {
      shopifyId: Number(row.shopify_id),
      title: String(row.title),
      handle: String(row.handle),
      setName: row.set_name ? String(row.set_name) : null,
      price: Number(row.price),
      imageUrl: row.image_url ? String(row.image_url) : null,
    });
  }
  return map;
}

function matchesFilters(change: PriceChange, filters: ChangeFilters): boolean {
  if (filters.query?.trim()) {
    const q = filters.query.trim().toLowerCase();
    if (!change.title.toLowerCase().includes(q)) return false;
  }
  if (filters.minAbsDelta !== undefined && filters.minAbsDelta > 0) {
    if (Math.abs(change.delta) < filters.minAbsDelta) return false;
  }
  if (filters.sets?.length) {
    if (!change.set || !filters.sets.includes(change.set)) return false;
  }
  if (filters.direction === "up" && change.delta <= 0) return false;
  if (filters.direction === "down" && change.delta >= 0) return false;
  return true;
}

export async function catalogPriceChanges(
  filters: ChangeFilters = {},
): Promise<ChangeSearchResult & { baselineAt: string | null; currentAt: string | null }> {
  const runs = await getCompleteRuns();
  const picked = pickRuns(runs, filters.periodDays);
  if (!picked) {
    return { changes: [], sets: [], baselineAt: null, currentAt: null };
  }

  const baselineRun = runs.find((run) => run.id === picked.baselineRunId)!;
  const currentRun = runs.find((run) => run.id === picked.currentRunId)!;

  const [baselineMap, currentMap] = await Promise.all([
    snapshotsForRun(picked.baselineRunId),
    snapshotsForRun(picked.currentRunId),
  ]);

  const changes: PriceChange[] = [];
  for (const [shopifyId, current] of currentMap) {
    const baseline = baselineMap.get(shopifyId);
    if (!baseline) continue;
    if (baseline.price === current.price) continue;

    const delta = current.price - baseline.price;
    const deltaPct = baseline.price ? (delta / baseline.price) * 100 : 0;

    const change: PriceChange = {
      shopifyId,
      title: current.title,
      handle: current.handle,
      url: `https://www.facetofacegames.com/products/${current.handle}`,
      set: current.setName,
      imageUrl: current.imageUrl,
      previousPrice: baseline.price,
      currentPrice: current.price,
      delta,
      deltaPct,
      previousCheckedAt: baselineRun.completedAt,
      currentCheckedAt: currentRun.completedAt,
    };

    if (matchesFilters(change, filters)) {
      changes.push(change);
    }
  }

  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const sets = collectSetsFromTitles([...currentMap.values()].map((item) => item.title));

  return {
    changes,
    sets,
    baselineAt: baselineRun.completedAt,
    currentAt: currentRun.completedAt,
  };
}
