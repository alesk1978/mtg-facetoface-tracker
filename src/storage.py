"""SQLite persistence for watchlist and price history."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "prices.db"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class WatchedProduct:
    shopify_id: int
    title: str
    handle: str
    url: str
    added_at: str


@dataclass
class PriceSnapshot:
    shopify_id: int
    title: str
    price: float
    compare_at_price: float | None
    available: bool
    checked_at: str


@dataclass
class PriceChange:
    shopify_id: int
    title: str
    previous_price: float
    current_price: float
    delta: float
    delta_pct: float
    previous_checked_at: str
    current_checked_at: str


class Storage:
    def __init__(self, db_path: Path = DEFAULT_DB) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS watchlist (
                    shopify_id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    handle TEXT NOT NULL UNIQUE,
                    url TEXT NOT NULL,
                    added_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS price_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    shopify_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    price REAL NOT NULL,
                    compare_at_price REAL,
                    available INTEGER NOT NULL,
                    checked_at TEXT NOT NULL,
                    FOREIGN KEY (shopify_id) REFERENCES watchlist(shopify_id)
                );

                CREATE INDEX IF NOT EXISTS idx_snapshots_product_time
                    ON price_snapshots (shopify_id, checked_at DESC);
                """
            )

    def add_to_watchlist(self, shopify_id: int, title: str, handle: str, url: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO watchlist (shopify_id, title, handle, url, added_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(shopify_id) DO UPDATE SET
                    title = excluded.title,
                    handle = excluded.handle,
                    url = excluded.url
                """,
                (shopify_id, title, handle, url, utc_now()),
            )

    def remove_from_watchlist(self, handle: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM watchlist WHERE handle = ?", (handle,))
            return cur.rowcount > 0

    def list_watchlist(self) -> list[WatchedProduct]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT shopify_id, title, handle, url, added_at FROM watchlist ORDER BY title"
            ).fetchall()
        return [WatchedProduct(**dict(row)) for row in rows]

    def record_snapshot(
        self,
        shopify_id: int,
        title: str,
        price: float,
        compare_at_price: float | None,
        available: bool,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO price_snapshots
                    (shopify_id, title, price, compare_at_price, available, checked_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (shopify_id, title, price, compare_at_price, int(available), utc_now()),
            )

    def latest_snapshots(self) -> list[PriceSnapshot]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT s.shopify_id, s.title, s.price, s.compare_at_price, s.available, s.checked_at
                FROM price_snapshots s
                INNER JOIN (
                    SELECT shopify_id, MAX(checked_at) AS max_checked_at
                    FROM price_snapshots
                    GROUP BY shopify_id
                ) latest
                    ON latest.shopify_id = s.shopify_id
                   AND latest.max_checked_at = s.checked_at
                ORDER BY s.title
                """
            ).fetchall()
        return [
            PriceSnapshot(
                shopify_id=row["shopify_id"],
                title=row["title"],
                price=row["price"],
                compare_at_price=row["compare_at_price"],
                available=bool(row["available"]),
                checked_at=row["checked_at"],
            )
            for row in rows
        ]

    def price_changes(self) -> list[PriceChange]:
        changes: list[PriceChange] = []
        with self._connect() as conn:
            products = conn.execute("SELECT shopify_id, title FROM watchlist").fetchall()
            for product in products:
                rows = conn.execute(
                    """
                    SELECT price, checked_at
                    FROM price_snapshots
                    WHERE shopify_id = ?
                    ORDER BY checked_at DESC
                    LIMIT 2
                    """,
                    (product["shopify_id"],),
                ).fetchall()
                if len(rows) < 2:
                    continue
                current, previous = rows[0], rows[1]
                prev_price = float(previous["price"])
                curr_price = float(current["price"])
                if prev_price == curr_price:
                    continue
                delta = curr_price - prev_price
                delta_pct = (delta / prev_price * 100) if prev_price else 0.0
                changes.append(
                    PriceChange(
                        shopify_id=product["shopify_id"],
                        title=product["title"],
                        previous_price=prev_price,
                        current_price=curr_price,
                        delta=delta,
                        delta_pct=delta_pct,
                        previous_checked_at=previous["checked_at"],
                        current_checked_at=current["checked_at"],
                    )
                )
        changes.sort(key=lambda item: abs(item.delta_pct), reverse=True)
        return changes
