"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { CardListing, PriceChange, PriceSnapshot, WatchedProduct } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";

type Tab = "search" | "watchlist" | "changes";

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? "Request failed");
  }
  return data as T;
}

export default function TrackerApp() {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CardListing[]>([]);
  const [watchlist, setWatchlist] = useState<WatchedProduct[]>([]);
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const watchedHandles = new Set(watchlist.map((item) => item.handle));

  const loadWatchlist = useCallback(async () => {
    const data = await readJson<{ items: WatchedProduct[] }>(
      await fetch("/api/watchlist"),
    );
    setWatchlist(data.items);
  }, []);

  const loadChanges = useCallback(async () => {
    const data = await readJson<{ changes: PriceChange[] }>(
      await fetch("/api/changes"),
    );
    setChanges(data.changes);
  }, []);

  useEffect(() => {
    loadWatchlist().catch((err: Error) => setError(err.message));
  }, [loadWatchlist]);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await readJson<{ results: CardListing[] }>(
        await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&limit=20`),
      );
      setSearchResults(data.results);
      if (data.results.length === 0) {
        setMessage("No MTG singles found for that search.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleWatch(handle: string) {
    setError(null);
    setMessage(null);
    try {
      await readJson(await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      }));
      await loadWatchlist();
      setMessage("Added to watchlist.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to watchlist");
    }
  }

  async function handleUnwatch(handle: string) {
    setError(null);
    try {
      await readJson(await fetch(`/api/watchlist/${encodeURIComponent(handle)}`, {
        method: "DELETE",
      }));
      await loadWatchlist();
      setSnapshots((current) => {
        const removed = watchlist.find((item) => item.handle === handle);
        if (!removed) return current;
        return current.filter((snap) => snap.shopifyId !== removed.shopifyId);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove from watchlist");
    }
  }

  async function handleCheckPrices() {
    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      const data = await readJson<{ snapshots: PriceSnapshot[] }>(
        await fetch("/api/check", { method: "POST" }),
      );
      setSnapshots(data.snapshots);
      await loadChanges();
      setMessage(`Checked ${data.snapshots.length} listing(s).`);
      setTab("watchlist");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Price check failed");
    } finally {
      setChecking(false);
    }
  }

  async function openChangesTab() {
    setTab("changes");
    try {
      await loadChanges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load changes");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-400/90">
          Face to Face Games
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
          MTG Price Tracker
        </h1>
        <p className="max-w-2xl text-base leading-7 text-zinc-400">
          Search Magic singles, build a watchlist, and track CAD price changes over time.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {([
          ["search", "Search"],
          ["watchlist", `Watchlist (${watchlist.length})`],
          ["changes", "Price Changes"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => (id === "changes" ? openChangesTab() : setTab(id))}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? "bg-amber-400 text-zinc-950"
                : "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {(error || message) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            error
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {error ?? message}
        </div>
      )}

      {tab === "search" && (
        <section className="space-y-6">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Search cards, e.g. "Lightning Bolt"'
              className="min-w-0 flex-1 rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none ring-amber-400/0 transition focus:border-amber-400/60 focus:ring-4 focus:ring-amber-400/10"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          <div className="grid gap-4">
            {searchResults.map((item) => (
              <article
                key={item.handle}
                className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-lg shadow-black/20"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <h2 className="text-lg font-medium text-zinc-50">{item.title}</h2>
                    <p className="text-sm text-zinc-400">
                      {item.available ? "In stock" : "Out of stock"}
                      {item.compareAtPrice ? (
                        <span>
                          {" "}
                          · was {formatMoney(item.compareAtPrice)}
                        </span>
                      ) : null}
                    </p>
                    <a
                      href={item.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-amber-300 hover:text-amber-200"
                    >
                      View on Face to Face
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-semibold text-amber-300">
                      {formatMoney(item.price)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleWatch(item.handle)}
                      disabled={watchedHandles.has(item.handle)}
                      className="rounded-full border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:border-amber-400 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {watchedHandles.has(item.handle) ? "Watching" : "Watch"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "watchlist" && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-zinc-50">Your watchlist</h2>
            <button
              type="button"
              onClick={handleCheckPrices}
              disabled={checking || watchlist.length === 0}
              className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checking ? "Checking prices..." : "Check prices now"}
            </button>
          </div>

          {watchlist.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-zinc-700 px-5 py-10 text-center text-zinc-400">
              Your watchlist is empty. Search for a card and click Watch.
            </p>
          ) : (
            <div className="grid gap-4">
              {watchlist.map((item) => {
                const snapshot = snapshots.find((snap) => snap.shopifyId === item.shopifyId);
                return (
                  <article
                    key={item.handle}
                    className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <h3 className="text-lg font-medium text-zinc-50">{item.title}</h3>
                        <p className="text-sm text-zinc-400">
                          Added {formatDate(item.addedAt)}
                        </p>
                        {snapshot ? (
                          <p className="text-sm text-zinc-300">
                            Last checked {formatDate(snapshot.checkedAt)} ·{" "}
                            {snapshot.available ? "In stock" : "Out of stock"}
                          </p>
                        ) : null}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-amber-300 hover:text-amber-200"
                        >
                          View listing
                        </a>
                      </div>
                      <div className="flex items-center gap-3">
                        {snapshot ? (
                          <p className="text-2xl font-semibold text-amber-300">
                            {formatMoney(snapshot.price)}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleUnwatch(item.handle)}
                          className="rounded-full border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition hover:border-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "changes" && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-zinc-50">Recent price changes</h2>
            <button
              type="button"
              onClick={() => loadChanges()}
              className="rounded-full border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition hover:border-amber-400 hover:text-amber-300"
            >
              Refresh
            </button>
          </div>

          {changes.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-zinc-700 px-5 py-10 text-center text-zinc-400">
              No price changes yet. Run at least two price checks on your watchlist.
            </p>
          ) : (
            <div className="grid gap-4">
              {changes.map((change) => {
                const up = change.delta > 0;
                return (
                  <article
                    key={`${change.shopifyId}-${change.currentCheckedAt}`}
                    className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-zinc-50">{change.title}</h3>
                        <p className="text-sm text-zinc-400">
                          {formatDate(change.previousCheckedAt)} →{" "}
                          {formatDate(change.currentCheckedAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-semibold ${up ? "text-red-300" : "text-emerald-300"}`}>
                          {up ? "↑" : "↓"} {formatMoney(change.currentPrice)}
                        </p>
                        <p className="text-sm text-zinc-400">
                          from {formatMoney(change.previousPrice)} ({change.delta >= 0 ? "+" : ""}
                          {change.delta.toFixed(2)}, {change.deltaPct >= 0 ? "+" : ""}
                          {change.deltaPct.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
