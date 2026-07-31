import { parseSetFromTitle } from "./card-meta";
import { fetchMagicCatalogPage } from "./facetoface";
import { getSupabase } from "./supabase";

export const MAGIC_CATALOG_PAGES = 100;
export const PAGES_PER_SYNC = 1;
const UPSERT_CHUNK_SIZE = 100;

interface SyncRun {
  id: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  lastPage: number;
  productsSynced: number;
}

export interface CatalogSyncStatus {
  isRunning: boolean;
  lastCompleteAt: string | null;
  completeRuns: number;
  currentRun: {
    lastPage: number;
    totalPages: number;
    productsSynced: number;
  } | null;
}

function mapRun(row: Record<string, unknown>): SyncRun {
  return {
    id: Number(row.id),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    status: String(row.status),
    lastPage: Number(row.last_page),
    productsSynced: Number(row.products_synced),
  };
}

export function isMissingTableError(error: { message?: string; code?: string }): boolean {
  return (
    error.code === "42P01" ||
    Boolean(error.message?.includes("does not exist")) ||
    Boolean(error.message?.includes("Could not find the table"))
  );
}

async function getRunningRun(): Promise<SyncRun | null> {
  const { data, error } = await getSupabase()
    .from("catalog_sync_runs")
    .select("id, started_at, completed_at, status, last_page, products_synced")
    .eq("status", "running")
    .order("last_page", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }
  return data ? mapRun(data) : null;
}

async function startRun(): Promise<SyncRun> {
  const { data, error } = await getSupabase()
    .from("catalog_sync_runs")
    .insert({ status: "running", last_page: 0, products_synced: 0 })
    .select("id, started_at, completed_at, status, last_page, products_synced")
    .single();
  if (error) throw new Error(error.message);
  return mapRun(data);
}

async function completeRun(runId: number, lastPage: number, productsSynced: number) {
  const { error } = await getSupabase()
    .from("catalog_sync_runs")
    .update({
      status: "complete",
      completed_at: new Date().toISOString(),
      last_page: lastPage,
      products_synced: productsSynced,
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

async function updateRunProgress(runId: number, lastPage: number, productsSynced: number) {
  const { error } = await getSupabase()
    .from("catalog_sync_runs")
    .update({ last_page: lastPage, products_synced: productsSynced })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

export async function getCatalogSyncStatus(): Promise<CatalogSyncStatus> {
  const { data: completeRuns, error: completeError } = await getSupabase()
    .from("catalog_sync_runs")
    .select("completed_at")
    .eq("status", "complete")
    .order("completed_at", { ascending: false });
  if (completeError) {
    if (isMissingTableError(completeError)) {
      return {
        isRunning: false,
        lastCompleteAt: null,
        completeRuns: 0,
        currentRun: null,
      };
    }
    throw new Error(completeError.message);
  }

  const running = await getRunningRun();

  return {
    isRunning: Boolean(running),
    lastCompleteAt: completeRuns?.[0]?.completed_at ?? null,
    completeRuns: completeRuns?.length ?? 0,
    currentRun: running
      ? {
          lastPage: running.lastPage,
          totalPages: MAGIC_CATALOG_PAGES,
          productsSynced: running.productsSynced,
        }
      : null,
  };
}

async function upsertSnapshots(
  rows: Array<{
    run_id: number;
    shopify_id: number;
    title: string;
    handle: string;
    set_name: string | null;
    price: number;
    compare_at_price: number | null;
    available: boolean;
  }>,
): Promise<void> {
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE);
    const { error } = await getSupabase()
      .from("catalog_snapshots")
      .upsert(chunk, { onConflict: "run_id,shopify_id" });
    if (error) throw new Error(error.message);
  }
}

export async function syncCatalogBatch(
  pagesPerBatch = PAGES_PER_SYNC,
): Promise<CatalogSyncStatus> {
  let run = await getRunningRun();
  if (!run) run = await startRun();

  let page = run.lastPage + 1;
  const endPage = Math.min(page + pagesPerBatch - 1, MAGIC_CATALOG_PAGES);
  let productsSynced = run.productsSynced;

  while (page <= endPage) {
    const listings = await fetchMagicCatalogPage(page);
    if (listings.length === 0) {
      throw new Error(
        `Face to Face returned no products for page ${page}. Wait a minute and try again.`,
      );
    }

    const rows = listings.map((item) => ({
      run_id: run!.id,
      shopify_id: item.shopifyId,
      title: item.title,
      handle: item.handle,
      set_name: parseSetFromTitle(item.title),
      price: item.price,
      compare_at_price: item.compareAtPrice,
      available: item.available,
    }));

    await upsertSnapshots(rows);

    productsSynced += listings.length;
    await updateRunProgress(run.id, page, productsSynced);
    page += 1;
  }

  const finishedPage = page - 1;
  if (finishedPage >= MAGIC_CATALOG_PAGES) {
    await completeRun(run.id, MAGIC_CATALOG_PAGES, productsSynced);
  }

  return getCatalogSyncStatus();
}
