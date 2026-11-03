/**
 * A slim banner for administrators when no backup has been taken for a week.
 * Dismissing it hides it for the rest of the day on this device.
 */
import { useEffect, useState } from "react";
import { DatabaseBackup, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../lib/http";
import { useAuth } from "../context/AuthContext";
import { BACKUP_REMINDER_DAYS, daysSince } from "./BackupPanel";

const DISMISS_KEY = "ms-pos-backup-reminder-dismissed";

export default function BackupReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [age, setAge] = useState<number | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === new Date().toDateString();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (user?.role !== "admin") return;
    apiJson<{ lastBackupAt: string | null }>("/api/backup/status")
      .then((status) => setAge(daysSince(status.lastBackupAt)))
      .catch(() => setAge(undefined));
  }, [user?.role]);

  if (user?.role !== "admin" || dismissed || age === undefined) return null;
  if (age !== null && age < BACKUP_REMINDER_DAYS) return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6">
      <DatabaseBackup size={16} className="shrink-0" />
      <p className="min-w-0 flex-1">
        {age === null ? "No backup has been taken yet." : `Last backup was ${age} days ago.`}{" "}
        <button type="button" className="font-semibold underline" onClick={() => navigate("/settings?section=backups")}>
          Download a backup
        </button>
      </p>
      <button
        type="button"
        aria-label="Hide for today"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(DISMISS_KEY, new Date().toDateString());
          } catch {
            // Storage unavailable: the banner just hides until reload.
          }
        }}
        className="rounded p-1 opacity-70 hover:opacity-100"
      >
        <X size={16} />
      </button>
    </div>
  );
}
