import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { apiFetch } from "../lib/api";

// Sales are loaded from the backend, not from hardcoded demo records.
type SaleItem = {
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  lineTotal: number;
};

type Sale = {
  id: string;
  _id?: string;
  receiptNumber: string;
  customer?: string;
  items: SaleItem[];
  subtotal: number;
  lineDiscountTotal?: number;
  overallDiscount?: number;
  taxEnabled?: boolean;
  taxRate?: number;
  tax?: number;
  grandTotal: number;
  paymentMethod: string;
  amountPaid: number;
  balance: number;
  change?: number;
  paymentStatus?: "paid" | "partial" | "unpaid" | string;
  createdAt: string;
};

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

const formatUGX = (amount: number) =>
  `UGX ${Math.round(Number(amount) || 0).toLocaleString("en-UG")}`;

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

function getSaleStatus(sale: Sale) {
  // Prefer the backend status, while deriving a fallback for older records.
  if (sale.paymentStatus) {
    return sale.paymentStatus.toLowerCase();
  }
  if (sale.balance <= 0) return "paid";
  return sale.amountPaid > 0 ? "partial" : "unpaid";
}

export default function SalesHistoryPage() {
  const navigate = useNavigate();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const pageSize = 8;

  const loadSales = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      // The API returns the most recent saved transactions first.
      const response = await apiFetch(`${API_BASE_URL}/api/sales?limit=200`);
      const data = await response.json();

      if (!response.ok || !data.success || !Array.isArray(data.sales)) {
        throw new Error(data.message || "Could not load sales history.");
      }

      const normalized: Sale[] = data.sales.map((raw: Record<string, unknown>) => {
        const id = String(raw.id ?? raw._id ?? "");
        const rawItems = Array.isArray(raw.items) ? raw.items : [];

        return {
          id,
          _id: String(raw._id ?? id),
          receiptNumber: String(raw.receiptNumber ?? id ?? "Sale"),
          customer: String(raw.customer ?? "Walk-in customer"),
          items: rawItems.map((entry) => {
            const item = entry as Record<string, unknown>;
            return {
              name: String(item.name ?? "Product"),
              sku: item.sku ? String(item.sku) : "",
              quantity: Number(item.quantity ?? 0),
              unitPrice: Number(item.unitPrice ?? 0),
              discountPercent: Number(item.discountPercent ?? 0),
              discountAmount: Number(item.discountAmount ?? 0),
              lineTotal: Number(item.lineTotal ?? 0),
            };
          }),
          subtotal: Number(raw.subtotal ?? 0),
          lineDiscountTotal: Number(raw.lineDiscountTotal ?? 0),
          overallDiscount: Number(raw.overallDiscount ?? 0),
          taxEnabled: raw.taxEnabled === true,
          taxRate: Number(raw.taxRate ?? 0),
          tax: Number(raw.tax ?? 0),
          grandTotal: Number(raw.grandTotal ?? 0),
          paymentMethod: String(raw.paymentMethod ?? "—"),
          amountPaid: Number(raw.amountPaid ?? 0),
          balance: Number(raw.balance ?? 0),
          change: Number(raw.change ?? 0),
          paymentStatus: String(raw.paymentStatus ?? ""),
          createdAt: String(raw.createdAt ?? ""),
        };
      });

      setSales(normalized);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load sales history. Check that the backend is running.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sales.filter((sale) => {
      const matchesSearch =
        !query ||
        sale.receiptNumber.toLowerCase().includes(query) ||
        (sale.customer ?? "").toLowerCase().includes(query) ||
        sale.items.some(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            (item.sku ?? "").toLowerCase().includes(query),
        );

      const date = new Date(sale.createdAt);
      const saleDay = Number.isNaN(date.getTime())
        ? ""
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      const matchesStart = !startDate || saleDay >= startDate;
      const matchesEnd = !endDate || saleDay <= endDate;
      const status = getSaleStatus(sale);
      const matchesStatus = paymentStatus === "all" || status === paymentStatus;
      const matchesMethod =
        paymentMethod === "all" || sale.paymentMethod.toLowerCase() === paymentMethod.toLowerCase();

      return matchesSearch && matchesStart && matchesEnd && matchesStatus && matchesMethod;
    });
  }, [sales, search, startDate, endDate, paymentStatus, paymentMethod]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleSales = filteredSales.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Summary values reflect the currently filtered results.
  const filteredTotal = filteredSales.reduce((sum, sale) => sum + sale.grandTotal, 0);
  const filteredPaid = filteredSales.reduce((sum, sale) => sum + sale.amountPaid, 0);
  const filteredBalance = filteredSales.reduce((sum, sale) => sum + sale.balance, 0);

  const updateFilter = (callback: () => void) => {
    callback();
    setPage(1);
  };

  const statusLabel = (sale: Sale) => {
    const status = getSaleStatus(sale);
    if (status === "paid") return "Paid";
    if (status === "partial") return "Partial";
    if (status === "unpaid") return "Unpaid";
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sales history
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review saved transactions, payment status and outstanding balances.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadSales(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate("/pos")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600"
          >
            <Plus size={18} />
            New sale
          </button>
        </div>
      </div>

      {/* Totals are calculated from the records currently matching the filters. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Sales total</p>
          <p className="mt-2 text-xl font-bold text-slate-900">{formatUGX(filteredTotal)}</p>
          <p className="mt-1 text-xs text-slate-400">{filteredSales.length} transaction(s)</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Amount collected</p>
          <p className="mt-2 text-xl font-bold text-emerald-700">{formatUGX(filteredPaid)}</p>
          <p className="mt-1 text-xs text-slate-400">Recorded payments</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Outstanding balance</p>
          <p className="mt-2 text-xl font-bold text-amber-700">{formatUGX(filteredBalance)}</p>
          <p className="mt-1 text-xs text-slate-400">Unpaid portions of these sales</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="relative block">
            <span className="sr-only">Search sales</span>
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => updateFilter(() => setSearch(event.target.value))}
              placeholder="Search receipt, customer, product..."
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="relative">
            <span className="sr-only">Start date</span>
            <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(event) => updateFilter(() => setStartDate(event.target.value))}
              className="w-full min-w-0 rounded-lg border border-slate-300 py-2.5 pl-9 pr-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              aria-label="Start date"
            />
          </label>

          <label className="relative">
            <span className="sr-only">End date</span>
            <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => updateFilter(() => setEndDate(event.target.value))}
              className="w-full min-w-0 rounded-lg border border-slate-300 py-2.5 pl-9 pr-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              aria-label="End date"
            />
          </label>

          <label>
            <span className="sr-only">Payment status</span>
            <select
              value={paymentStatus}
              onChange={(event) => updateFilter(() => setPaymentStatus(event.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">All payment statuses</option>
              <option value="paid">Fully paid</option>
              <option value="partial">Partially paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>

          <label>
            <span className="sr-only">Payment method</span>
            <select
              value={paymentMethod}
              onChange={(event) => updateFilter(() => setPaymentMethod(event.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">All payment methods</option>
              <option value="Cash">Cash</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Bank transfer">Bank transfer</option>
              <option value="Card">Card</option>
            </select>
          </label>
        </div>

        {error && (
          <div role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <p className="font-semibold">Could not load sales history</p>
            <p className="mt-1">{error}</p>
            <p className="mt-1 text-xs">Check that the backend is running and GET /api/sales is available.</p>
            <button type="button" onClick={() => void loadSales(true)} className="mt-2 font-semibold underline">
              Try again
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-4">Receipt / reference</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4 text-right">Total</th>
                <th className="px-5 py-4 text-right">Paid</th>
                <th className="px-5 py-4 text-right">Balance</th>
                <th className="px-5 py-4">Method</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && !error && visibleSales.map((sale) => {
                const status = getSaleStatus(sale);
                return (
                  <tr key={sale.id || sale.receiptNumber} className="transition hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedSale(sale)}
                        className="text-sm font-semibold text-sky-600 hover:text-sky-800 hover:underline"
                      >
                        {sale.receiptNumber}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">{formatDate(sale.createdAt)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-800">{sale.customer || "Walk-in customer"}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right text-sm text-slate-700">{formatUGX(sale.grandTotal)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right text-sm text-slate-700">{formatUGX(sale.amountPaid)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-medium text-slate-800">{formatUGX(sale.balance)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{sale.paymentMethod}</td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        status === "paid"
                          ? "bg-emerald-50 text-emerald-700"
                          : status === "partial"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700"
                      }`}>
                        {statusLabel(sale)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {loading && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">Loading saved sales from MongoDB…</td></tr>
              )}

              {!loading && !error && visibleSales.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">No saved sales match your search or filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-sm text-slate-500">
            Showing {filteredSales.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredSales.length)} of {filteredSales.length} sales
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span className="whitespace-nowrap text-sm text-slate-500">Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Sales history is connected to saved MongoDB transactions. Click a receipt reference to inspect its line items and payment breakdown.
      </p>

      {/* Quick details modal uses the saved record already returned by the API. */}
      {selectedSale && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sale-details-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedSale(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="sale-details-title" className="text-lg font-bold text-slate-900">Sale details</h2>
                <p className="mt-1 text-sm text-sky-700">{selectedSale.receiptNumber}</p>
              </div>
              <button type="button" onClick={() => setSelectedSale(null)} aria-label="Close sale details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><p className="text-slate-500">Date</p><p className="mt-1 font-medium">{formatDate(selectedSale.createdAt)}</p></div>
              <div><p className="text-slate-500">Customer</p><p className="mt-1 font-medium">{selectedSale.customer || "Walk-in customer"}</p></div>
              <div><p className="text-slate-500">Payment method</p><p className="mt-1 font-medium">{selectedSale.paymentMethod}</p></div>
              <div><p className="text-slate-500">Payment status</p><p className="mt-1 font-medium">{statusLabel(selectedSale)}</p></div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[450px] text-left text-sm">
                <thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-3 pr-3">Item</th><th className="py-3 px-2 text-right">Qty</th><th className="py-3 px-2 text-right">Unit price</th><th className="py-3 pl-2 text-right">Line total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedSale.items.map((item, index) => (
                    <tr key={`${item.sku}-${index}`}>
                      <td className="py-3 pr-3"><p className="font-medium">{item.name}</p>{item.sku && <p className="mt-1 text-xs text-slate-500">{item.sku}</p>}</td>
                      <td className="px-2 py-3 text-right">{item.quantity}</td>
                      <td className="px-2 py-3 text-right">{formatUGX(item.unitPrice)}</td>
                      <td className="py-3 pl-2 text-right font-medium">{formatUGX(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 ml-auto max-w-sm space-y-2 border-t border-slate-200 pt-4 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Subtotal</span><span>{formatUGX(selectedSale.subtotal)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Line discounts</span><span>− {formatUGX(selectedSale.lineDiscountTotal ?? 0)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Overall discount</span><span>− {formatUGX(selectedSale.overallDiscount ?? 0)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Tax {selectedSale.taxEnabled ? `(${selectedSale.taxRate ?? 0}%)` : ""}</span><span>{formatUGX(selectedSale.tax ?? 0)}</span></div>
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 font-bold"><span>Grand total</span><span>{formatUGX(selectedSale.grandTotal)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Amount paid</span><span>{formatUGX(selectedSale.amountPaid)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Balance</span><span className="font-semibold">{formatUGX(selectedSale.balance)}</span></div>
            </div>

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setSelectedSale(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
