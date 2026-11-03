/**
 * Small shared building blocks for the newer pages, styled to match the
 * existing ones (sky accents, slate text, rounded-2xl white cards).
 */
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export const inputClass =
  "mt-1.5 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50";
export const labelClass = "block text-xs font-semibold text-slate-600";
export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
export const dangerButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";
export const cardClass = "rounded-2xl border border-slate-200 bg-white";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-600">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone, children, onClose }: { tone: "error" | "success" | "info"; children: ReactNode; onClose?: () => void }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <div className="min-w-0">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Sent: "bg-sky-100 text-sky-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-100 text-red-700",
  Expired: "bg-amber-100 text-amber-800",
  Converted: "bg-violet-100 text-violet-700",
  Scheduled: "bg-sky-100 text-sky-700",
  "In progress": "bg-amber-100 text-amber-800",
  Completed: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-slate-200 text-slate-600",
  Active: "bg-emerald-100 text-emerald-700",
  "Expiring soon": "bg-amber-100 text-amber-800",
  "No warranty": "bg-slate-100 text-slate-600",
  Paid: "bg-emerald-100 text-emerald-700",
  "Partially paid": "bg-amber-100 text-amber-800",
  Unpaid: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${badgeTones[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? "sm:max-w-4xl" : "sm:max-w-xl"}`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-900";
  return (
    <div className={`${cardClass} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${value === tab.id ? "bg-sky-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
