/**
 * Settings → Connection & sync: real status of the internet connection,
 * the server, and sales saved offline that are waiting to upload.
 */
import { useCallback, useEffect, useState } from "react";
import { CloudUpload, LoaderCircle, RefreshCw, Server, Wifi, WifiOff } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useConnectionStatus } from "../hooks/useConnectionStatus";
import { getPendingSaleCount } from "../db/offlineService";
import { syncPendingSales } from "../db/syncService";
import { Notice, secondaryButton } from "./ui";

type ServerState = { ok: boolean; ms: number; checkedAt: Date } | null;

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
