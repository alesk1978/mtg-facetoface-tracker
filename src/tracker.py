"""Watchlist orchestration and price checks."""

from __future__ import annotations

from .facetoface import CardListing, fetch_by_handle, search_cards
from .storage import PriceChange, PriceSnapshot, Storage, WatchedProduct


class Tracker:
    def __init__(self, storage: Storage | None = None) -> None:
        self.storage = storage or Storage()

    def search(self, query: str, limit: int = 20) -> list[CardListing]:
        return search_cards(query, limit=limit)

    def watch_handle(self, handle: str) -> CardListing:
        listing = fetch_by_handle(handle)
        self.storage.add_to_watchlist(
            shopify_id=listing.shopify_id,
            title=listing.title,
            handle=listing.handle,
            url=listing.product_url,
        )
        self.storage.record_snapshot(
            shopify_id=listing.shopify_id,
            title=listing.title,
            price=listing.price,
            compare_at_price=listing.compare_at_price,
            available=listing.available,
        )
        return listing

    def unwatch(self, handle: str) -> bool:
        return self.storage.remove_from_watchlist(handle)

    def list_watchlist(self) -> list[WatchedProduct]:
        return self.storage.list_watchlist()

    def check_prices(self) -> list[PriceSnapshot]:
        snapshots: list[PriceSnapshot] = []
        for item in self.storage.list_watchlist():
            listing = fetch_by_handle(item.handle)
            self.storage.add_to_watchlist(
                shopify_id=listing.shopify_id,
                title=listing.title,
                handle=listing.handle,
                url=listing.product_url,
            )
            self.storage.record_snapshot(
                shopify_id=listing.shopify_id,
                title=listing.title,
                price=listing.price,
                compare_at_price=listing.compare_at_price,
                available=listing.available,
            )
        return self.storage.latest_snapshots()

    def recent_changes(self) -> list[PriceChange]:
        return self.storage.price_changes()
