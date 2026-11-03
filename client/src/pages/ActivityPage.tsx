/**
 * Activity log: who did what, and when.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { apiJson } from "../lib/http";
import { formatDateTime } from "../lib/format";
import { EmptyState, Notice, PageHeader, cardClass, secondaryButton } from "../components/ui";

type Entry = { id: string; userName: string; area: string; action: string; summary: string; createdAt: string };

export default function ActivityPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: "300" });
      if (area) query.set("area", area);
      if (search.trim()) query.set("search", search.trim());
      const payload = await apiJson<{ entries: Entry[]; areas: string[] }>(`/api/activity?${query}`);
      setEntries(payload.entries);
      setAreas(payload.areas);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the activity log.");
    } finally {
      setLoading(false);
    }
  }, [area, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Group entries by day for easier reading.
  const groups: { day: string; items: Entry[] }[] = [];
  for (const entry of entries) {
    const day = new Date(entry.createdAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Kampala" });
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(entry);
    else groups.push({ day, items: [entry] });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accountability"
        title="Activity log"
        description="Every sale, price change, stock adjustment, payment and edit — with who did it and when."
        actions={<button type="button" className={secondaryButton} onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</button>}
      />
      {error && <Notice tone="error">{error}</Notice>}

      <div className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row`}>
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by person, action or details" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-sky-400" />
        </div>
        <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" aria-label="Filter by area">
          <option value="">Everything</option>
          {areas.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>

      {entries.length === 0 ? (
        <div className={cardClass}>
          <EmptyState title={loading ? "Loading…" : "Nothing recorded yet"} description="Actions appear here as people use the app." />
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.day} className={`${cardClass} overflow-hidden`}>
            <h3 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.day}</h3>
            <ul className="divide-y divide-slate-100">
              {group.items.map((entry) => (
                <li key={entry.id} className="flex gap-3 px-4 py-3 text-sm">
                  <span className="w-14 shrink-0 text-xs text-slate-400">{formatDateTime(entry.createdAt).slice(-5)}</span>
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-900">{entry.userName}</span>{" "}
                    <span className="text-slate-700">{entry.action.toLowerCase()}</span>
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{entry.area}</span>
                    {entry.summary && <span className="block break-words text-xs text-slate-500">{entry.summary}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
