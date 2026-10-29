import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, AlertTriangle, Package, Receipt, RefreshCw, Wallet, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { localDb } from "../../db/database";

type Notice = {
  id: string;
  type: "sale" | "stock" | "balance" | "sync";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

const STORAGE_KEY = "ms-home-security-notifications-v1";
const SEEN_SALES_KEY = "ms-home-security-seen-sales-v1";

function readStored(): Notice[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) as Notice[] : [];
  } catch {
    return [];
  }
}

function rowsFrom(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  for (const key of ["sales", "products", "items", "data", "results"]) {
    if (Array.isArray(object[key])) return object[key] as Record<string, unknown>[];
    if (object[key] && typeof object[key] === "object") {
      const nested = rowsFrom(object[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
}

function money(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export default function NotificationBell() {
  const [notices, setNotices] = useState<Notice[]>(readStored);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const save = useCallback((next: Notice[]) => {
    const limited = next.slice(0, 100);
    setNotices(limited);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    } catch (error) {
      console.error("Could not persist notifications:", error);
    }
  }, []);

  const checkEvents = useCallback(async () => {
    if (!navigator.onLine || checking) {
      await checkLocalSyncErrors(save);
      return;
    }

    setChecking(true);
    const additions: Notice[] = [];
    const existing = readStored();
    const existingIds = new Set(existing.map((item) => item.id));

    const add = (notice: Notice) => {
      if (!existingIds.has(notice.id) && !additions.some((item) => item.id === notice.id)) {
        additions.push(notice);
      }
    };

    try {
      const [salesResponse, productsResponse] = await Promise.all([
        apiFetch("/api/sales"),
        apiFetch("/api/products"),
      ]);

      if (salesResponse.ok) {
        const payload: unknown = await salesResponse.json();
        const sales = rowsFrom(payload);
        let seen: string[] = [];

        try {
          seen = JSON.parse(localStorage.getItem(SEEN_SALES_KEY) || "[]") as string[];
        } catch {
          seen = [];
        }

        const currentIds = sales
          .map((sale) => text(sale.id ?? sale._id ?? sale.saleId))
          .filter(Boolean);

        if (localStorage.getItem(SEEN_SALES_KEY) !== null) {
          for (const sale of sales) {
            const id = text(sale.id ?? sale._id ?? sale.saleId);
            if (!id || seen.includes(id)) continue;
            add({
              id: `sale:${id}`,
              type: "sale",
              title: "New sale recorded",
              message: `Receipt ${text(sale.receiptNumber, id)} has been recorded.`,
              createdAt: new Date().toISOString(),
              read: false,
            });
          }
        }

        try {
          localStorage.setItem(SEEN_SALES_KEY, JSON.stringify(currentIds.slice(0, 500)));
        } catch {
          // Notifications remain usable for this session if storage is unavailable.
        }

        for (const sale of sales) {
          const balance = money(sale.balance ?? sale.outstandingBalance);
          const status = text(sale.paymentStatus ?? sale.status).toLowerCase();
          if (balance > 0 || status === "partial" || status === "unpaid") {
            const id = text(sale.id ?? sale._id ?? sale.saleId);
            if (!id) continue;
            add({
              id: `balance:${id}`,
              type: "balance",
              title: "Outstanding customer balance",
              message: `${text(sale.customerName ?? sale.customer, "Customer")} — UGX ${balance.toLocaleString("en-UG")}${balance === 0 ? " (payment status requires review)" : " outstanding"}.`,
              createdAt: text(sale.createdAt, new Date().toISOString()),
              read: false,
            });
          }
        }
      }

      if (productsResponse.ok) {
        const payload: unknown = await productsResponse.json();
        for (const product of rowsFrom(payload)) {
          const quantity = money(product.stockQuantity ?? product.quantity ?? product.stock);
          const threshold = money(product.lowStockThreshold ?? product.reorderLevel ?? 5);
          const active = product.active !== false;
          const id = text(product.id ?? product._id ?? product.productId);
          if (!id || !active || quantity > threshold) continue;
          add({
            id: `stock:${id}:${quantity}`,
            type: "stock",
            title: "Low stock alert",
            message: `${text(product.name, "Product")} has ${quantity} unit(s) remaining.`,
            createdAt: new Date().toISOString(),
            read: false,
          });
        }
      }
    } catch (error) {
      console.error("Notification refresh failed:", error);
    } finally {
      await checkLocalSyncErrors(save);
      if (additions.length) save([...additions, ...readStored()]);
      setChecking(false);
    }
  }, [checking, save]);

  useEffect(() => {
    void checkEvents();
    const interval = window.setInterval(() => void checkEvents(), 60000);
    const onFocus = () => void checkEvents();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [checkEvents]);

  const unread = notices.filter((notice) => !notice.read).length;

  function markAllRead() {
    save(notices.map((notice) => ({ ...notice, read: true })));
  }

  function markRead(id: string) {
    save(notices.map((notice) => notice.id === id ? { ...notice, read: true } : notice));
  }

  const iconFor = (type: Notice["type"]) => {
    if (type === "sale") return <Receipt size={18} />;
    if (type === "stock") return <Package size={18} />;
    if (type === "balance") return <Wallet size={18} />;
    return <RefreshCw size={18} />;
  };

  return (
    <div className="fixed right-4 top-4 z-[100] sm:right-6 sm:top-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section className="absolute right-0 mt-3 w-[min(90vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="font-semibold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-500">{unread} unread event(s)</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={markAllRead} title="Mark all as read" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <CheckCheck size={18} />
              </button>
              <button type="button" onClick={() => setOpen(false)} title="Close notifications" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="max-h-[65vh] overflow-y-auto">
            {notices.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Bell className="mx-auto text-slate-300" size={28} />
                <p className="mt-3 text-sm font-medium text-slate-700">You're all caught up</p>
                <p className="mt-1 text-xs text-slate-500">New sales, stock alerts and sync issues will appear here.</p>
              </div>
            ) : notices.map((notice) => (
              <button
                key={notice.id}
                type="button"
                onClick={() => markRead(notice.id)}
                className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${notice.read ? "opacity-70" : "bg-sky-50/60"}`}
              >
                <span className={`mt-0.5 ${notice.type === "sync" ? "text-red-600" : notice.type === "stock" ? "text-amber-600" : "text-sky-600"}`}>
                  {notice.type === "sync" ? <AlertTriangle size={18} /> : iconFor(notice.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{notice.title}</span>
                  <span className="mt-1 block break-words text-xs leading-5 text-slate-600">{notice.message}</span>
                  <span className="mt-1 block text-[10px] text-slate-400">{new Date(notice.createdAt).toLocaleString("en-UG")}</span>
                </span>
                {!notice.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sky-500" />}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
            Checks every minute while the app is open.
          </div>
        </section>
      )}
    </div>
  );
}

async function checkLocalSyncErrors(save: (next: Notice[]) => void) {
  try {
    const operations = await localDb.pendingSync.toArray();
    const current = readStored();
    const ids = new Set(current.map((item) => item.id));
    const errors: Notice[] = [];

    for (const operation of operations) {
      if (!operation.lastError && operation.attempts === 0) continue;
      const id = `sync:${operation.operationId}:${operation.attempts}`;
      if (ids.has(id)) continue;
      errors.push({
        id,
        type: "sync",
        title: "Offline sale synchronization issue",
        message: operation.lastError || `Synchronization has failed ${operation.attempts} time(s).`,
        createdAt: new Date().toISOString(),
        read: false,
      });
    }

    if (errors.length) save([...errors, ...current]);
  } catch (error) {
    console.error("Could not check local synchronization errors:", error);
  }
}