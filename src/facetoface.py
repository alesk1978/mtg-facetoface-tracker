"""Face to Face Games (Shopify) price fetcher for MTG singles."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

BASE_URL = "https://www.facetofacegames.com"
USER_AGENT = "mtg-facetoface-tracker/0.1 (+local price watcher)"


@dataclass(frozen=True)
class CardListing:
    shopify_id: int
    title: str
    handle: str
    url: str
    price: float
    compare_at_price: float | None
    available: bool
    vendor: str
    product_type: str

    @property
    def product_url(self) -> str:
        return f"{BASE_URL}{self.url.split('?')[0]}"


def _request_json(path: str, params: dict[str, str] | None = None) -> Any:
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    url = f"{BASE_URL}{path}{query}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Face to Face request failed ({exc.code}): {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach Face to Face: {exc.reason}") from exc


def _parse_price(value: str | float | int | None) -> float:
    if value is None or value == "":
        return 0.0
    return float(value)


def _listing_from_product(raw: dict[str, Any]) -> CardListing | None:
    vendor = raw.get("vendor") or ""
    product_type = raw.get("type") or ""
    if vendor != "Magic" and product_type != "Singles":
        return None

    compare_raw = raw.get("compare_at_price_max") or raw.get("compare_at_price_min")
    compare_at = _parse_price(compare_raw) if compare_raw not in (None, "", "0.00", 0) else None

    return CardListing(
        shopify_id=int(raw["id"]),
        title=str(raw.get("title") or ""),
        handle=str(raw.get("handle") or ""),
        url=str(raw.get("url") or f"/products/{raw.get('handle')}"),
        price=_parse_price(raw.get("price_min") or raw.get("price")),
        compare_at_price=compare_at,
        available=bool(raw.get("available", True)),
        vendor=vendor,
        product_type=product_type,
    )


def search_cards(query: str, limit: int = 20) -> list[CardListing]:
    payload = _request_json(
        "/search/suggest.json",
        {
            "q": query,
            "resources[type]": "product",
            "resources[limit]": str(limit),
        },
    )
    products = payload.get("resources", {}).get("results", {}).get("products", [])
    listings: list[CardListing] = []
    for raw in products:
        listing = _listing_from_product(raw)
        if listing:
            listings.append(listing)
    return listings


def fetch_by_handle(handle: str) -> CardListing:
    payload = _request_json(f"/products/{handle}.json")
    product = payload.get("product")
    if not product:
        raise RuntimeError(f"Product not found: {handle}")

    variant = (product.get("variants") or [{}])[0]
    compare_at_raw = variant.get("compare_at_price")
    compare_at = _parse_price(compare_at_raw) if compare_at_raw not in (None, "", "0.00") else None

    return CardListing(
        shopify_id=int(product["id"]),
        title=str(product.get("title") or ""),
        handle=str(product.get("handle") or handle),
        url=f"/products/{product.get('handle') or handle}",
        price=_parse_price(variant.get("price")),
        compare_at_price=compare_at,
        available=bool(variant.get("available", True)),
        vendor=str(product.get("vendor") or ""),
        product_type=str(product.get("product_type") or ""),
    )
