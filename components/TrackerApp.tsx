"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { CatalogSyncStatus } from "@/lib/catalog-sync";
import type { CardListing, PriceChange, PriceSnapshot, WatchedProduct } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";

type Tab = "search" | "watchlist" | "changes";
type ChangePeriod = "7" | "30" | "90" | "365" | "all";
type ChangeDirection = "any" | "up" | "down";

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
  const [availableSets, setAvailableSets] = useState<string[]>([]);
  const [changeQuery, setChangeQuery] = useState("");
  const [minDelta, setMinDelta] = useState("");
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [changePeriod, setChangePeriod] = useState<ChangePeriod>("30");
  const [changeDirection, setChangeDirection] = useState<ChangeDirection>("any");
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [syncStatus, setSyncStatus] = useState<CatalogSyncStatus | null>(null);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [changeBaselineAt, setChangeBaselineAt] = useState<string | null>(null);
  const [changeCurrentAt, setChangeCurrentAt] = useState<string | null>(null);
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

  const loadSyncStatus = useCallback(async () => {
    const status = await readJson<CatalogSyncStatus>(await fetch("/api/catalog/status"));
    setSyncStatus(status);
  }, []);

  const loadChanges = useCallback(async () => {
    const params = new URLSearchParams();
    if (changeQuery.trim()) params.set("q", changeQuery.trim());
    if (minDelta.trim()) params.set("minDelta", minDelta.trim());
    params.set("period", changePeriod);
    params.set("direction", changeDirection);
    for (const set of selectedSets) params.append("set", set);

    const query = params.toString();
    const data = await readJson<{
      changes: PriceChange[];
      sets: string[];
      baselineAt?: string | null;
      currentAt?: string | null;
    }>(await fetch(`/api/changes${query ? `?${query}` : ""}`));
    setChanges(data.changes);
    setAvailableSets(data.sets);
    setChangeBaselineAt(data.baselineAt ?? null);
    setChangeCurrentAt(data.currentAt ?? null);
  }, [changeQuery, minDelta, selectedSets, changePeriod, changeDirection]);

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
    setLoadingChanges(true);
    setError(null);
    try {
      await loadChanges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load changes");
    } finally {
      setLoadingChanges(false);
    }
    loadSyncStatus().catch(() => {
      setSyncStatus(null);
    });
  }

  async function handleSyncCatalog() {
    setSyncingCatalog(true);
    setError(null);
    setMessage(null);
    try {
      const status = await readJson<CatalogSyncStatus>(
        await fetch("/api/catalog/sync", { method: "POST" }),
      );
      setSyncStatus(status);
      setMessage("Catalog sync batch completed.");
      await loadChanges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Catalog sync failed");
    } finally {
      setSyncingCatalog(false);
    }
  }

  async function refreshChanges() {
    setLoadingChanges(true);
    setError(null);
    try {
      await loadChanges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load changes");
    } finally {
      setLoadingChanges(false);
    }
  }

  async function handleChangeSearch(event: FormEvent) {
    event.preventDefault();
    await refreshChanges();
  }

  function toggleSet(setName: string) {
    setSelectedSets((current) =>
      current.includes(setName)
        ? current.filter((item) => item !== setName)
        : [...current, setName],
    );
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
          ["changes", "Catalog Changes"],
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
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-50">Catalog price changes</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Search all Face to Face Magic singles, not just your watchlist.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSyncCatalog}
                  disabled={syncingCatalog}
                  className="rounded-full border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition hover:border-amber-400 hover:text-amber-300 disabled:opacity-60"
                >
                  {syncingCatalog ? "Syncing..." : "Sync catalog batch"}
                </button>
                <button
                  type="button"
                  onClick={refreshChanges}
                  disabled={loadingChanges}
                  className="rounded-full border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition hover:border-amber-400 hover:text-amber-300 disabled:opacity-60"
                >
                  {loadingChanges ? "Searching..." : "Refresh"}
                </button>
              </div>
            </div>

            {syncStatus ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400">
                {syncStatus.completeRuns < 2 ? (
                  <p>
                    Catalog history building: {syncStatus.completeRuns} full snapshot
                    {syncStatus.completeRuns === 1 ? "" : "s"} saved. Need at least 2 full
                    syncs to compare prices. Click &quot;Sync catalog batch&quot; repeatedly
                    until a full sync completes (~10 batches).
                  </p>
                ) : (
                  <p>
                    Last full catalog sync:{" "}
                    {syncStatus.lastCompleteAt ? formatDate(syncStatus.lastCompleteAt) : "never"}.
                    {syncStatus.currentRun
                      ? ` Current sync in progress: page ${syncStatus.currentRun.lastPage}/${syncStatus.currentRun.totalPages}.`
                      : null}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Run <code className="rounded bg-zinc-900 px-1">supabase/catalog.sql</code> in
                Supabase, then use Sync catalog batch to start tracking all cards.
              </div>
            )}

            {changeBaselineAt && changeCurrentAt ? (
              <p className="text-sm text-zinc-500">
                Comparing snapshots from {formatDate(changeBaselineAt)} → {formatDate(changeCurrentAt)}
              </p>
            ) : null}

            <form
              onSubmit={handleChangeSearch}
              className="grid gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-zinc-300">Card name</span>
                  <input
                    value={changeQuery}
                    onChange={(event) => setChangeQuery(event.target.value)}
                    placeholder='e.g. "Lightning Bolt"'
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-400/60"
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-zinc-300">Min. $ change (CAD)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minDelta}
                    onChange={(event) => setMinDelta(event.target.value)}
                    placeholder="e.g. 0.50"
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-400/60"
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-zinc-300">Period</span>
                  <select
                    value={changePeriod}
                    onChange={(event) => setChangePeriod(event.target.value as ChangePeriod)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-400/60"
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last year</option>
                    <option value="all">All time</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-zinc-300">Direction</span>
                  <select
                    value={changeDirection}
                    onChange={(event) => setChangeDirection(event.target.value as ChangeDirection)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-400/60"
                  >
                    <option value="any">Any change</option>
                    <option value="up">Price increased</option>
                    <option value="down">Price decreased</option>
                  </select>
                </label>
              </div>

              {availableSets.length > 0 ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-zinc-300">Sets</legend>
                  <div className="flex flex-wrap gap-2">
                    {availableSets.map((setName) => {
                      const active = selectedSets.includes(setName);
                      return (
                        <button
                          key={setName}
                          type="button"
                          onClick={() => toggleSet(setName)}
                          className={`rounded-full px-3 py-1.5 text-sm transition ${
                            active
                              ? "bg-amber-400 text-zinc-950"
                              : "border border-zinc-700 text-zinc-300 hover:border-zinc-500"
                          }`}
                        >
                          {setName}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              <button
                type="submit"
                disabled={loadingChanges}
                className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingChanges ? "Searching..." : "Search changes"}
              </button>
            </form>
          </div>

          {changes.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-zinc-700 px-5 py-10 text-center text-zinc-400">
              No matching catalog price changes yet. Run catalog sync batches until you have at
              least 2 full snapshots, then search again.
            </p>
          ) : (
            <div className="grid gap-4">
              <p className="text-sm text-zinc-400">{changes.length} result(s)</p>
              {changes.map((change) => {
                const up = change.delta > 0;
                return (
                  <article
                    key={`${change.shopifyId}-${change.currentCheckedAt}`}
                    className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <h3 className="text-lg font-medium text-zinc-50">{change.title}</h3>
                        {change.set ? (
                          <p className="text-sm text-amber-300/80">{change.set}</p>
                        ) : null}
                        <p className="text-sm text-zinc-400">
                          {formatDate(change.previousCheckedAt)} →{" "}
                          {formatDate(change.currentCheckedAt)}
                        </p>
                        <a
                          href={change.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-amber-300 hover:text-amber-200"
                        >
                          View listing
                        </a>
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
