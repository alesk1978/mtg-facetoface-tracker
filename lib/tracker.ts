import * as db from "./db";
import { catalogPriceChanges } from "./catalog-changes";
import { fetchByHandle, searchCards } from "./facetoface";
import type { CardListing, ChangeFilters, ChangeSearchResult, PriceSnapshot, WatchedProduct } from "./types";

export async function search(query: string, limit = 20): Promise<CardListing[]> {
  return searchCards(query, limit);
}

export async function watchHandle(handle: string): Promise<CardListing> {
  const listing = await fetchByHandle(handle);
  await db.addToWatchlist(
    listing.shopifyId,
    listing.title,
    listing.handle,
    listing.productUrl,
  );
  await db.recordSnapshot(
    listing.shopifyId,
    listing.title,
    listing.price,
    listing.compareAtPrice,
    listing.available,
  );
  return listing;
}

export async function unwatch(handle: string): Promise<boolean> {
  return db.removeFromWatchlist(handle);
}

export async function listWatchlist(): Promise<WatchedProduct[]> {
  return db.listWatchlist();
}

export async function checkPrices(): Promise<PriceSnapshot[]> {
  const items = await db.listWatchlist();
  for (const item of items) {
    const listing = await fetchByHandle(item.handle);
    await db.addToWatchlist(
      listing.shopifyId,
      listing.title,
      listing.handle,
      listing.productUrl,
    );
    await db.recordSnapshot(
      listing.shopifyId,
      listing.title,
      listing.price,
      listing.compareAtPrice,
      listing.available,
    );
  }
  return db.latestSnapshots();
}

export async function recentChanges(filters: ChangeFilters = {}): Promise<ChangeSearchResult> {
  return catalogPriceChanges(filters);
}
