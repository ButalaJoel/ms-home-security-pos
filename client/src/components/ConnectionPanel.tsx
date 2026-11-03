/**
 * Settings → Connection & sync: real status of the internet connection,
 * the server, and sales saved offline that are waiting to upload.
 */
import { useCallback, useEffect, useState } from "react";
import { CloudUpload, LoaderCircle, RefreshCw, Server, Wifi, WifiOff } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useConnectionStatus } from "../hooks/useConnectionStatus";
import { getPendingSaleCount } from "../db/offlineService";
import { localDb } from "../db/database";
import { formatDateTime, formatUGX } from "../lib/format";
import { syncPendingSales } from "../db/syncService";
import { Notice, secondaryButton } from "./ui";

type ServerState = { ok: boolean; ms: number; checkedAt: Date } | null;

type QueuedSale = {
  operationId: string;
  saleId: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  total: number;
  customer: string;
  items: string;
};

/** Offline sales still waiting on this device, with the server's last answer. */
async function loadQueue(): Promise<QueuedSale[]> {
  const operations = await localDb.pendingSync.orderBy("createdAt").toArray();
  const rows: QueuedSale[] = [];
  for (const operation of operations) {
    const sale = await localDb.sales.get(operation.recordId);
    const payload = (sale?.requestPayload ?? {}) as { customerName?: string };
    rows.push({
      operationId: operation.operationId,
      saleId: operation.recordId,
      createdAt: sale?.createdAt ?? operation.createdAt,
      attempts: operation.attempts,
      lastError: operation.lastError,
      total: sale?.total ?? 0,
      customer: payload.customerName || "Walk-in customer",
      items: (sale?.items ?? []).map((item) => `${item.quantity} × ${item.name}`).join(", "),
    });
  }
  return rows;
}

function Row({ icon, title, detail, tone }: { icon: React.ReactNode; title: string; detail: string; tone: "good" | "warn" | "bad" }) {
  const styles = {
    good: "border-emerald-200 bg-emerald-50",
    warn: "border-amber-200 bg-amber-50",
    bad: "border-red-200 bg-red-50",
  }[tone];
  const iconStyles = { good: "bg-emerald-600", warn: "bg-amber-500", bad: "bg-red-600" }[tone];
  return (
    <div className={`flex items-center gap-4 rounded-xl border p-4 ${styles}`}>
      <div className={`rounded-full p-3 text-white ${iconStyles}`}>{icon}</div>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-600">{detail}</p>
      </div>
    </div>
  );
}

export default function ConnectionPanel() {
  const connection = useConnectionStatus();
  const online = connection === "online";
  const [server, setServer] = useState<ServerState>(null);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [queue, setQueue] = useState<QueuedSale[]>([]);

  const check = useCallback(async () => {
    setChecking(true);
    const started = performance.now();
    try {
      const response = await apiFetch("/api/health", { cache: "no-store" });
      setServer({ ok: response.ok, ms: Math.round(performance.now() - started), checkedAt: new Date() });
    } catch {
      setServer({ ok: false, ms: 0, checkedAt: new Date() });
    } finally {
      setChecking(false);
    }
    try {
      setPending(await getPendingSaleCount());
      setQueue(await loadQueue());
    } catch {
      setPending(null);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check, online]);

  async function syncNow() {
    setSyncing(true);
    setMessage("");
    try {
      const result = await syncPendingSales();
      setMessage(
        result.processed === 0
          ? "Nothing waiting to upload."
          : `Uploaded ${result.synchronized} of ${result.processed} offline sale(s).${result.failed ? ` ${result.failed} could not be uploaded yet; they will retry automatically.` : ""}`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed. It will retry automatically.");
    } finally {
      setSyncing(false);
      void check();
    }
  }

  const slow = server?.ok && server.ms > 5000;

  async function discard(entry: QueuedSale) {
    if (!window.confirm(`Discard the offline sale of ${formatUGX(entry.total)} (${entry.customer})? Only do this after recording it again correctly.`)) return;
    await localDb.transaction("rw", localDb.sales, localDb.pendingSync, async () => {
      await localDb.pendingSync.where("operationId").equals(entry.operationId).delete();
      await localDb.sales.delete(entry.saleId);
    });
    setMessage("Offline sale discarded from this device.");
    void check();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-[#10213b]">Connection & sync</h3>
        <p className="mt-1 text-xs text-[#627995]">Live status of this device's connection and of sales recorded while offline.</p>
      </div>

      <Row
        icon={online ? <Wifi size={20} /> : <WifiOff size={20} />}
        title={online ? "This device is online" : "This device is offline"}
        detail={online ? "Sales, stock and payments save straight to the server." : "Sales are kept on this device and upload automatically when the internet returns."}
        tone={online ? "good" : "bad"}
      />

      <Row
        icon={checking ? <LoaderCircle size={20} className="animate-spin" /> : <Server size={20} />}
        title={
          checking ? "Checking the server…" : !server ? "Server not checked yet" : server.ok ? `Server reachable (${(server.ms / 1000).toFixed(1)} s)` : "Server not reachable"
        }
        detail={
          !server || checking
            ? "Contacting the server…"
            : !server.ok
              ? "Check the internet connection. If it continues, the server may be restarting; try again in a minute."
              : slow
                ? "Slow response. On the free plan the server sleeps when unused and takes up to a minute to wake."
                : `Last checked ${server.checkedAt.toLocaleTimeString("en-GB")}.`
        }
        tone={!server || checking ? "warn" : server.ok ? (slow ? "warn" : "good") : "bad"}
      />

      <Row
        icon={<CloudUpload size={20} />}
        title={pending === null ? "Offline sales: unknown" : pending === 0 ? "No offline sales waiting" : `${pending} offline sale(s) waiting to upload`}
        detail={pending ? "They upload automatically when online. You can also upload them now." : "Everything recorded on this device has reached the server."}
        tone={pending ? "warn" : "good"}
      />

      {queue.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Offline sales on this device</p>
          <ul className="divide-y divide-slate-100">
            {queue.map((entry) => (
              <li key={entry.operationId} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <b className="text-slate-900">{formatUGX(entry.total)}</b> · {entry.customer}
                    <span className="block text-xs text-slate-500">{formatDateTime(entry.createdAt)} · {entry.items}</span>
                  </span>
                  <button type="button" onClick={() => void discard(entry)} className="text-xs font-semibold text-red-600 hover:underline">Discard</button>
                </div>
                {entry.lastError ? (
                  <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
                    Not accepted by the server ({entry.attempts} attempt{entry.attempts === 1 ? "" : "s"}): {entry.lastError} Fix the cause (e.g. add stock in Inventory), then press Upload now.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-700">Waiting for the internet.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && <Notice tone="info" onClose={() => setMessage("")}>{message}</Notice>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} disabled={checking} onClick={() => void check()}>
          <RefreshCw size={16} className={checking ? "animate-spin" : ""} /> Check again
        </button>
        {!!pending && (
          <button type="button" className={secondaryButton} disabled={syncing || !online} onClick={() => void syncNow()}>
            <CloudUpload size={16} /> {syncing ? "Uploading…" : "Upload offline sales now"}
          </button>
        )}
      </div>
    </div>
  );
}
