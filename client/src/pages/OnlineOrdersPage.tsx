/**
 * Online orders: orders customers send from the public website.
 *
 * Payment A: nobody pays on the website. Staff call the customer, agree the
 * price and delivery, take Mobile Money or cash, ring the sale up at the till
 * (Point of Sale) and move the order along here so the customer's
 * "Track my order" page stays up to date.
 */
import { useCallback, useEffect, useState } from "react";
import { MapPin, MessageCircle, Phone, RefreshCw, Search, Store, Truck } from "lucide-react";
import { apiJson } from "../lib/http";
import { formatDateTime, formatUGX } from "../lib/format";
import { EmptyState, Modal, Notice, PageHeader, cardClass, inputClass, labelClass, primaryButton, secondaryButton } from "../components/ui";

type Status = "received" | "confirmed" | "paid" | "delivered" | "cancelled";

type Order = {
  id: string;
  number: string;
  status: Status;
  customer: { name: string; phone: string; phoneDisplay: string; email?: string; location?: string };
  delivery: "delivery" | "pickup";
  notes?: string;
  items: { productId: string; name: string; sku: string; model?: string; quantity: number; unitPrice: number }[];
  estimatedTotal: number;
  history: { status: Status; at: string; by: string; note?: string }[];
  createdAt: string;
};

const STATUS_LABEL: Record<Status, string> = {
  received: "New",
  confirmed: "Confirmed",
  paid: "Paid",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<Status, string> = {
  received: "bg-amber-100 text-amber-800",
  confirmed: "bg-sky-100 text-sky-700",
  paid: "bg-emerald-100 text-emerald-700",
  delivered: "bg-slate-200 text-slate-700",
  cancelled: "bg-red-100 text-red-700",
};

/** The next step for each status, shown as the main button. */
const NEXT: Partial<Record<Status, { status: Status; label: string }>> = {
  received: { status: "confirmed", label: "Mark confirmed" },
  confirmed: { status: "paid", label: "Mark paid" },
  paid: { status: "delivered", label: "Mark delivered" },
};

const FILTERS: { id: Status | "all"; label: string }[] = [
  { id: "received", label: "New" },
  { id: "confirmed", label: "Confirmed" },
  { id: "paid", label: "Paid" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

function whatsappUrl(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export default function OnlineOrdersPage() {
  const [filter, setFilter] = useState<Status | "all">("received");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [noteFor, setNoteFor] = useState<Order | null>(null);
  const [cancelFor, setCancelFor] = useState<Order | null>(null);
  const [noteText, setNoteText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (filter !== "all") query.set("status", filter);
      if (search.trim()) query.set("search", search.trim());
      const data = await apiJson<{ orders: Order[] }>(`/api/website-orders?${query.toString()}`);
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load website orders.");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  async function update(order: Order, body: { status?: Status; note?: string }) {
    setBusyId(order.id);
    setError("");
    try {
      const data = await apiJson<{ message: string; order: Order }>(`/api/website-orders/${order.id}`, { method: "PATCH", json: body });
      setMessage(`${order.number}: ${data.message}`);
      window.dispatchEvent(new Event("ms-pos:website-orders-changed"));
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the order.");
      return false;
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sell"
        title="Online orders"
        description="Orders sent from the website. Call the customer, agree the price, take payment, then ring the sale up at the till."
        actions={
          <button type="button" onClick={() => void load()} className={secondaryButton}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      {message && <Notice tone="success" onClose={() => setMessage("")}>{message}</Notice>}
      {error && <Notice tone="error" onClose={() => setError("")}>{error}</Notice>}

      <div className={`${cardClass} flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between`}>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${filter === item.id ? "bg-sky-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative block lg:w-80">
          <span className="sr-only">Search orders</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order number, name, phone or product" className={`${inputClass} !mt-0 pl-9`} />
        </label>
      </div>

      {loading && orders.length === 0 ? (
        <div className={`${cardClass} px-6 py-14 text-center text-sm text-slate-500`}>Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className={cardClass}>
          <EmptyState
            title={filter === "received" && !search ? "No new orders" : "No orders here"}
            description={filter === "received" && !search ? "New orders from the website appear here. The sidebar shows a number when one arrives." : "Try another status or search."}
          />
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => {
            const next = NEXT[order.status];
            const firstName = order.customer.name.split(" ")[0];
            const lastNotes = order.history.filter((h) => h.note);
            return (
              <li key={order.id} className={`${cardClass} overflow-hidden`}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-bold text-slate-900">{order.number}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Sent {formatDateTime(order.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Estimate at POS prices</p>
                    <p className="text-lg font-bold text-slate-900">{order.estimatedTotal > 0 ? formatUGX(order.estimatedTotal) : "Not priced"}</p>
                  </div>
                </div>

                <div className="grid gap-5 px-5 py-4 md:grid-cols-[1fr_1.2fr]">
                  <div className="space-y-2 text-sm">
                    <p className="text-base font-semibold text-slate-900">{order.customer.name}</p>
                    <p className="flex items-center gap-2 text-slate-700"><Phone size={15} className="text-slate-400" />{order.customer.phoneDisplay}</p>
                    {order.customer.email && <p className="break-all text-slate-600">{order.customer.email}</p>}
                    <p className="flex items-start gap-2 text-slate-700">
                      {order.delivery === "pickup" ? <Store size={15} className="mt-0.5 text-slate-400" /> : <Truck size={15} className="mt-0.5 text-slate-400" />}
                      {order.delivery === "pickup" ? "Will collect from the shop" : <>Deliver to <span className="font-semibold">{order.customer.location}</span></>}
                    </p>
                    {order.notes && <p className="rounded-xl bg-amber-50 px-3 py-2 text-slate-700"><span className="font-semibold">Customer note:</span> {order.notes}</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <a href={`tel:+${order.customer.phone}`} className={secondaryButton}><Phone size={15} /> Call</a>
                      <a
                        href={whatsappUrl(order.customer.phone, `Hello ${firstName}, this is MS Security Systems about your website order ${order.number}. `)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={secondaryButton}
                      >
                        <MessageCircle size={15} className="text-emerald-600" /> WhatsApp
                      </a>
                    </div>
                  </div>

                  <div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="pb-2 font-semibold">Item</th>
                          <th className="pb-2 text-right font-semibold">Qty</th>
                          <th className="pb-2 text-right font-semibold">POS price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {order.items.map((item) => (
                          <tr key={item.productId}>
                            <td className="py-2 pr-2">
                              <p className="font-medium text-slate-900">{item.name}</p>
                              <p className="text-xs text-slate-500">{[item.sku, item.model].filter(Boolean).join(" · ")}</p>
                            </td>
                            <td className="py-2 text-right">{item.quantity}</td>
                            <td className="py-2 text-right text-slate-600">{item.unitPrice > 0 ? formatUGX(item.unitPrice) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {lastNotes.length > 0 && (
                      <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                        {lastNotes.map((h, i) => (
                          <li key={i}><span className="font-semibold text-slate-700">{h.by}</span>, {formatDateTime(h.at)}: {h.note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                  <p className="text-xs text-slate-500">
                    {order.delivery === "delivery" && <><MapPin size={12} className="mr-1 inline" />Delivery cost is agreed on the call. </>}
                    Last change: {STATUS_LABEL[order.history.at(-1)?.status ?? order.status]} by {order.history.at(-1)?.by ?? "Website"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setNoteFor(order); setNoteText(""); }} className={secondaryButton} disabled={busyId === order.id}>Add note</button>
                    {order.status !== "cancelled" && order.status !== "delivered" && (
                      <button type="button" onClick={() => { setCancelFor(order); setNoteText(""); }} className={secondaryButton} disabled={busyId === order.id}>Cancel order</button>
                    )}
                    {order.status === "cancelled" && (
                      <button type="button" onClick={() => void update(order, { status: "received", note: "Order reopened." })} className={secondaryButton} disabled={busyId === order.id}>Reopen</button>
                    )}
                    {next && (
                      <button type="button" onClick={() => void update(order, { status: next.status })} className={primaryButton} disabled={busyId === order.id}>
                        {busyId === order.id ? "Saving…" : next.label}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {noteFor && (
        <Modal
          title={`Note on ${noteFor.number}`}
          description="Only staff see notes."
          onClose={() => setNoteFor(null)}
          footer={
            <>
              <button type="button" onClick={() => setNoteFor(null)} className={secondaryButton}>Close</button>
              <button
                type="button"
                className={primaryButton}
                disabled={!noteText.trim() || busyId === noteFor.id}
                onClick={async () => { if (await update(noteFor, { note: noteText.trim() })) setNoteFor(null); }}
              >
                Save note
              </button>
            </>
          }
        >
          <label className={labelClass} htmlFor="order-note">Note</label>
          <textarea id="order-note" rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Called, agreed UGX 1,450,000 with delivery to Ntinda on Friday." className={inputClass} />
        </Modal>
      )}

      {cancelFor && (
        <Modal
          title={`Cancel ${cancelFor.number}?`}
          description="The customer sees “Cancelled” when they track the order."
          onClose={() => setCancelFor(null)}
          footer={
            <>
              <button type="button" onClick={() => setCancelFor(null)} className={secondaryButton}>Keep order</button>
              <button
                type="button"
                className={`${primaryButton} !bg-red-600 hover:!bg-red-700`}
                disabled={busyId === cancelFor.id}
                onClick={async () => { if (await update(cancelFor, { status: "cancelled", note: noteText.trim() || undefined })) setCancelFor(null); }}
              >
                Cancel order
              </button>
            </>
          }
        >
          <label className={labelClass} htmlFor="cancel-reason">Reason (staff only, optional)</label>
          <textarea id="cancel-reason" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Customer changed their mind." className={inputClass} />
        </Modal>
      )}
    </div>
  );
}
