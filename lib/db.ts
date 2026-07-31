import { getSupabase } from "./supabase";
import type { PriceChange, PriceSnapshot, WatchedProduct } from "./types";

function utcNow(): string {
  return new Date().toISOString();
}

export async function addToWatchlist(
  shopifyId: number,
  title: string,
  handle: string,
  url: string,
): Promise<void> {
  const { error } = await getSupabase().from("watchlist").upsert(
    {
      shopify_id: shopifyId,
      title,
      handle,
      url,
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
    .select("shopify_id, title, handle, url, added_at")
    .order("title");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    shopifyId: Number(row.shopify_id),
    title: row.title,
    handle: row.handle,
    url: row.url,
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

export async function priceChanges(): Promise<PriceChange[]> {
  const products = await listWatchlist();
  const changes: PriceChange[] = [];

  for (const product of products) {
    const { data, error } = await getSupabase()
      .from("price_snapshots")
      .select("price, checked_at")
      .eq("shopify_id", product.shopifyId)
      .order("checked_at", { ascending: false })
      .limit(2);
    if (error) throw new Error(error.message);
    if (!data || data.length < 2) continue;

    const current = data[0];
    const previous = data[1];
    const prevPrice = Number(previous.price);
    const currPrice = Number(current.price);

    if (prevPrice === currPrice) continue;

    const delta = currPrice - prevPrice;
    const deltaPct = prevPrice ? (delta / prevPrice) * 100 : 0;

    changes.push({
      shopifyId: product.shopifyId,
      title: product.title,
      previousPrice: prevPrice,
      currentPrice: currPrice,
      delta,
      deltaPct,
      previousCheckedAt: previous.checked_at,
      currentCheckedAt: current.checked_at,
    });
  }

  changes.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  return changes;
}
