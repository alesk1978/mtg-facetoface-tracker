"""CLI for Face to Face MTG price tracking."""

from __future__ import annotations

import argparse
import sys

from .tracker import Tracker


def _money(value: float) -> str:
    return f"${value:,.2f} CAD"


def cmd_search(args: argparse.Namespace) -> int:
    tracker = Tracker()
    results = tracker.search(args.query, limit=args.limit)
    if not results:
        print("No MTG singles found.")
        return 0

    print(f"Found {len(results)} listing(s) for {args.query!r}:\n")
    for index, item in enumerate(results, start=1):
        sale = f" (was {_money(item.compare_at_price)})" if item.compare_at_price else ""
        stock = "in stock" if item.available else "out of stock"
        print(f"{index:>2}. {_money(item.price)}{sale} — {item.title}")
        print(f"    handle: {item.handle}")
        print(f"    {item.product_url} [{stock}]")
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    tracker = Tracker()
    listing = tracker.watch_handle(args.handle)
    print(f"Watching: {listing.title}")
    print(f"Current price: {_money(listing.price)}")
    print(f"URL: {listing.product_url}")
    return 0


def cmd_unwatch(args: argparse.Namespace) -> int:
    tracker = Tracker()
    removed = tracker.unwatch(args.handle)
    if removed:
        print(f"Removed {args.handle} from watchlist.")
        return 0
    print(f"Handle not found on watchlist: {args.handle}")
    return 1


def cmd_list(_: argparse.Namespace) -> int:
    tracker = Tracker()
    items = tracker.list_watchlist()
    if not items:
        print("Watchlist is empty. Use `watch <handle>` after searching.")
        return 0

    print(f"{len(items)} watched card(s):\n")
    for item in items:
        print(f"- {item.title}")
        print(f"  handle: {item.handle}")
        print(f"  added:  {item.added_at}")
        print(f"  url:    {item.url}")
    return 0


def cmd_check(_: argparse.Namespace) -> int:
    tracker = Tracker()
    items = tracker.list_watchlist()
    if not items:
        print("Watchlist is empty.")
        return 0

    snapshots = tracker.check_prices()
    print(f"Checked {len(snapshots)} watched listing(s):\n")
    for snap in snapshots:
        sale = f" (compare at {_money(snap.compare_at_price)})" if snap.compare_at_price else ""
        stock = "in stock" if snap.available else "out of stock"
        print(f"- {snap.title}: {_money(snap.price)}{sale} [{stock}] @ {snap.checked_at}")
    return 0


def cmd_changes(_: argparse.Namespace) -> int:
    tracker = Tracker()
    changes = tracker.recent_changes()
    if not changes:
        print("No price changes since the previous check.")
        return 0

    print(f"{len(changes)} price change(s):\n")
    for change in changes:
        direction = "↑" if change.delta > 0 else "↓"
        print(f"{direction} {change.title}")
        print(
            f"  {_money(change.previous_price)} → {_money(change.current_price)} "
            f"({change.delta:+.2f}, {change.delta_pct:+.1f}%)"
        )
        print(f"  {change.previous_checked_at} → {change.current_checked_at}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Track Magic: The Gathering card price changes on Face to Face Games.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    search = sub.add_parser("search", help="Search MTG singles on Face to Face")
    search.add_argument("query", help="Card name to search")
    search.add_argument("--limit", type=int, default=20, help="Max results (default: 20)")
    search.set_defaults(func=cmd_search)

    watch = sub.add_parser("watch", help="Add a product handle to the watchlist")
    watch.add_argument("handle", help="Shopify product handle from search results")
    watch.set_defaults(func=cmd_watch)

    unwatch = sub.add_parser("unwatch", help="Remove a product from the watchlist")
    unwatch.add_argument("handle", help="Shopify product handle")
    unwatch.set_defaults(func=cmd_unwatch)

    list_cmd = sub.add_parser("list", help="Show watched cards")
    list_cmd.set_defaults(func=cmd_list)

    check = sub.add_parser("check", help="Fetch current prices for watched cards")
    check.set_defaults(func=cmd_check)

    changes = sub.add_parser("changes", help="Show price changes since the last check")
    changes.set_defaults(func=cmd_changes)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
