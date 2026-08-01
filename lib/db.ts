import { collectSetsFromTitles, parseSetFromTitle } from "./card-meta";
import { getSupabase } from "./supabase";
import type { ChangeFilters, ChangeSearchResult, PriceChange, PriceSnapshot, WatchedProduct } from "./types";

function utcNow(): string {
  return new Date().toISOString();
}

interface SnapshotRow {
  shopifyId: number;
  title: string;
  price: number;
  checkedAt: string;
}

function periodStartIso(periodDays: number | null | undefined): string | null {
  if (periodDays === null || periodDays === undefined) return null;
  const start = new Date();
  start.setDate(start.getDate() - periodDays);
  return start.toISOString();
}

function computeChange(
  product: WatchedProduct,
  snapshots: SnapshotRow[],
  periodDays: number | null | undefined,
): PriceChange | null {
  if (snapshots.length < 2) return null;

  const periodStart = periodStartIso(periodDays);
  const baseline = periodStart
    ? [...snapshots].reverse().find((snap) => snap.checkedAt <= periodStart) ??
      snapshots[0]
    : snapshots[0];
  const current = snapshots[snapshots.length - 1];

  if (baseline.checkedAt === current.checkedAt) return null;

  const prevPrice = baseline.price;
  const currPrice = current.price;
  if (prevPrice === currPrice) return null;

  if (periodStart && current.checkedAt < periodStart) return null;

  const delta = currPrice - prevPrice;
  const deltaPct = prevPrice ? (delta / prevPrice) * 100 : 0;

  return {
    shopifyId: product.shopifyId,
    title: product.title,
    handle: product.handle,
    url: product.url,
    set: parseSetFromTitle(product.title),
    imageUrl: product.imageUrl,
    previousPrice: prevPrice,
    currentPrice: currPrice,
    delta,
    deltaPct,
    previousCheckedAt: baseline.checkedAt,
    currentCheckedAt: current.checkedAt,
  };
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

export async function addToWatchlist(
  shopifyId: number,
  title: string,
  handle: string,
  url: string,
  imageUrl: string | null = null,
): Promise<void> {
  const { error } = await getSupabase().from("watchlist").upsert(
    {
      shopify_id: shopifyId,
      title,
      handle,
      url,
      image_url: imageUrl,
      added_at: utcNow(),
    },
    { onConflict: "shopify_id" },
  );
  if (error) throw new Error(error.message);
}

export async function removeFromWatchlist(handle: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("watchlist")
    .delete()
    .eq("handle", handle)
    .select("shopify_id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function listWatchlist(): Promise<WatchedProduct[]> {
  const { data, error } = await getSupabase()
    .from("watchlist")
    .select("shopify_id, title, handle, url, image_url, added_at")
    .order("title");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    shopifyId: Number(row.shopify_id),
    title: row.title,
    handle: row.handle,
    url: row.url,
    imageUrl: row.image_url ? String(row.image_url) : null,
    addedAt: row.added_at,
  }));
}

export async function recordSnapshot(
  shopifyId: number,
  title: string,
  price: number,
  compareAtPrice: number | null,
  available: boolean,
): Promise<void> {
  const { error } = await getSupabase().from("price_snapshots").insert({
    shopify_id: shopifyId,
    title,
    price,
    compare_at_price: compareAtPrice,
    available,
    checked_at: utcNow(),
  });
  if (error) throw new Error(error.message);
}

export async function latestSnapshots(): Promise<PriceSnapshot[]> {
  const { data, error } = await getSupabase()
    .from("price_snapshots")
    .select("shopify_id, title, price, compare_at_price, available, checked_at")
    .order("checked_at", { ascending: false });
  if (error) throw new Error(error.message);

  const seen = new Set<number>();
  const snapshots: PriceSnapshot[] = [];

  for (const row of data ?? []) {
    const shopifyId = Number(row.shopify_id);
    if (seen.has(shopifyId)) continue;
    seen.add(shopifyId);
    snapshots.push({
      shopifyId,
      title: row.title,
      price: Number(row.price),
      compareAtPrice:
        row.compare_at_price === null ? null : Number(row.compare_at_price),
      available: Boolean(row.available),
      checkedAt: row.checked_at,
    });
  }

  snapshots.sort((a, b) => a.title.localeCompare(b.title));
  return snapshots;
}

export async function priceChanges(filters: ChangeFilters = {}): Promise<ChangeSearchResult> {
  const products = await listWatchlist();
  const sets = collectSetsFromTitles(products.map((item) => item.title));
  const productById = new Map(products.map((item) => [item.shopifyId, item]));

  const { data, error } = await getSupabase()
    .from("price_snapshots")
    .select("shopify_id, title, price, checked_at")
    .order("checked_at", { ascending: true });
  if (error) throw new Error(error.message);

  const grouped = new Map<number, SnapshotRow[]>();
  for (const row of data ?? []) {
    const shopifyId = Number(row.shopify_id);
    const bucket = grouped.get(shopifyId) ?? [];
    bucket.push({
      shopifyId,
      title: String(row.title),
      price: Number(row.price),
      checkedAt: String(row.checked_at),
    });
    grouped.set(shopifyId, bucket);
  }

  const changes: PriceChange[] = [];
  for (const [shopifyId, snapshots] of grouped) {
    const product = productById.get(shopifyId);
    if (!product) continue;

    const change = computeChange(product, snapshots, filters.periodDays);
    if (!change) continue;
    if (!matchesFilters(change, filters)) continue;
    changes.push(change);
  }

  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { changes, sets };
}
