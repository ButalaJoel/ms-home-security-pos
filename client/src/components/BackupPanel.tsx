/**
 * Settings → Data & backups.
 * Download a complete backup, see when the last one was taken, and restore
 * from a backup file (admins only). Before any restore, a backup of the
 * current data is downloaded automatically, so a restore can be undone.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, DatabaseBackup, Download, LoaderCircle, Upload } from "lucide-react";
import { apiFetch } from "../lib/api";
import { apiJson } from "../lib/http";
import { formatDateTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { Modal, Notice, dangerButton, primaryButton, secondaryButton } from "./ui";

type Status = {
  lastBackupAt: string | null;
  lastBackupBy: string;
  lastRestoreAt: string | null;
  lastRestoreBy: string;
  counts: Record<string, number>;
};

const LABELS: Record<string, string> = {
  products: "Products",
  sales: "Sales",
  customers: "Customers",
  quotations: "Quotations",
  jobs: "Installation jobs",
  serials: "Serial numbers",
  suppliers: "Suppliers",
  stock_receipts: "Stock receipts",
  expenses: "Expenses",
  cashups: "Cash-ups",
  stock_adjustments: "Stock history entries",
  activity_log: "Activity log entries",
  users: "User accounts",
};

export const BACKUP_REMINDER_DAYS = 7;

export function daysSince(value: string | null): number | null {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / (24 * 60 * 60 * 1000));
}

/** Downloads a full backup file. Returns the file name. */
export async function downloadBackup(): Promise<string> {
  const response = await apiFetch("/api/backup/download");
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message || "Could not create the backup.");
  }
  const blob = await response.blob();
  const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
  const fileName = match?.[1] ?? `ms-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return fileName;
}

export default function BackupPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [includeUsers, setIncludeUsers] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setStatus(await apiJson<Status>("/api/backup/status"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the backup status.");
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDownload() {
    setDownloading(true);
    setError("");
    try {
      const name = await downloadBackup();
      setNotice(`Backup saved as ${name} in your Downloads folder. Keep a copy somewhere safe too (Google Drive, email or a flash disk).`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the backup.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleRestore() {
    if (!restoreFile) return;
    setRestoring(true);
    setError("");
    try {
      // Safety copy of the current data first, so this restore can be undone.
      await downloadBackup();
      const form = new FormData();
      form.append("file", restoreFile);
      form.append("includeUsers", includeUsers ? "true" : "false");
      const payload = await apiJson<{ message: string; restored: Record<string, number> }>("/api/backup/restore", {
        method: "POST",
        body: form,
      });
      const summary = Object.entries(payload.restored)
        .filter(([name]) => LABELS[name])
        .map(([name, count]) => `${LABELS[name]}: ${count}`)
        .join(", ");
      setRestoreFile(null);
      setConfirmText("");
      setNotice(`${payload.message} ${summary}. A copy of the data from before the restore was downloaded first.`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

  if (!isAdmin) {
    return <Notice tone="info">Only administrators can download or restore backups.</Notice>;
  }

  const age = daysSince(status?.lastBackupAt ?? null);
  const overdue = age === null || age >= BACKUP_REMINDER_DAYS;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-[#10213b]">Data & backups</h3>
        <p className="mt-1 text-xs text-[#627995]">
          Your data lives in the online database. A backup is a complete copy saved to this computer, so nothing is lost if something goes wrong.
        </p>
      </div>

      {error && <Notice tone="error" onClose={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice("")}>{notice}</Notice>}

      <div className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${overdue ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className={`rounded-full p-3 text-white ${overdue ? "bg-amber-500" : "bg-emerald-600"}`}>
          {overdue ? <AlertTriangle size={20} /> : <DatabaseBackup size={20} />}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-slate-900">
            {status?.lastBackupAt ? `Last backup: ${formatDateTime(status.lastBackupAt)}` : "No backup has been taken yet"}
          </p>
          <p className="text-xs text-slate-600">
            {status?.lastBackupAt
              ? `By ${status.lastBackupBy || "unknown"} · ${age === 0 ? "today" : `${age} day(s) ago`}${overdue ? " — time for a new one" : ""}`
              : "Download one now, then once a week (or every day at closing)."}
          </p>
        </div>
        <button type="button" className={primaryButton} disabled={downloading} onClick={() => void handleDownload()}>
          {downloading ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
          {downloading ? "Preparing…" : "Download backup"}
        </button>
      </div>

      {status && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What a backup contains right now</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(LABELS).map(([name, label]) => (
              <div key={name} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <span className="text-slate-500">{label}</span>
                <b className="float-right text-slate-900">{status.counts[name] ?? 0}</b>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Also included: business settings, logo link and document numbering. Product photos stay in Cloudinary; the backup keeps their links.</p>
        </div>
      )}

      <div className="rounded-xl border border-red-200 p-4">
        <h4 className="text-sm font-semibold text-slate-900">Restore from a backup</h4>
        <p className="mt-1 text-xs text-slate-600">
          Replaces the current data with the data in a backup file. Use only to recover from a mistake. A backup of the current data is downloaded first, so this can be undone.
          {status?.lastRestoreAt ? ` Last restore: ${formatDateTime(status.lastRestoreAt)} by ${status.lastRestoreBy}.` : ""}
        </p>
        <label className={`${secondaryButton} mt-3 cursor-pointer`}>
          <Upload size={16} /> Choose backup file…
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => {
              setRestoreFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      {restoreFile && (
        <Modal
          title="Restore this backup?"
          description={restoreFile.name}
          onClose={() => !restoring && setRestoreFile(null)}
          footer={
            <>
              <button type="button" className={secondaryButton} disabled={restoring} onClick={() => setRestoreFile(null)}>Cancel</button>
              <button type="button" className={dangerButton} disabled={restoring || confirmText.trim().toUpperCase() !== "RESTORE"} onClick={() => void handleRestore()}>
                {restoring ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                {restoring ? "Restoring…" : "Restore"}
              </button>
            </>
          }
        >
          <div className="space-y-4 text-sm">
            <Notice tone="error">
              Everything currently in the system (products, sales, quotations, payments, jobs, expenses…) will be replaced by the contents of this file. Anything recorded after the backup was taken will be gone from the system, but kept in the safety copy downloaded first.
            </Notice>
            <label className="flex items-start gap-2 text-slate-700">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={includeUsers} onChange={(e) => setIncludeUsers(e.target.checked)} />
              <span>Also restore user accounts and passwords from the file. Leave unticked unless logins were lost.</span>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Type RESTORE to confirm
              <input className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
