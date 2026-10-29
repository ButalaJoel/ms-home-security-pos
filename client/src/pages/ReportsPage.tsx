import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Download,
  Package,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { apiFetch } from "../lib/api";

// API records reflect the sales and product documents stored by the backend.
type SaleItem = {
  productId?: string;
  name?: string;
  productName?: string;
  sku?: string;
  unitPrice?: number;
  quantity?: number;
  lineTotal?: number;
  lineDiscountAmount?: number;
  costPrice?: number;
};

type Sale = {
  _id?: string;
  id?: string;
  receiptNumber?: string;
  customer?: string | { name?: string; phone?: string; email?: string };
  items?: SaleItem[];
  subtotal?: number;
  lineDiscountTotal?: number;
  overallDiscount?: number;
  tax?: number;
  grandTotal?: number;
  paymentMethod?: string;
  amountPaid?: number;
  balance?: number;
  change?: number;
  paymentStatus?: string;
  createdAt?: string;
};

type Product = {
  id?: string;
  _id?: string;
  name: string;
  sku?: string;
  category?: string;
  quantity?: number;
  stock?: number;
  costPrice?: number;
  sellingPrice?: number;
  reorderLevel?: number;
  active?: boolean;
};

type Period = "Daily" | "Weekly" | "Monthly";
type ReportType = "Sales" | "Products" | "Stock" | "Low stock" | "Balances" | "Profit";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const PAGE_SIZE = 8;

const reportLibrary: {
  title: string;
  description: string;
  type: ReportType;
  icon: typeof BarChart3;
}[] = [
  { title: "Daily, weekly & monthly sales", description: "Sales totals and revenue trends", type: "Sales", icon: BarChart3 },
  { title: "Best-selling products", description: "Rank products by units sold and revenue", type: "Products", icon: Package },
  { title: "Current stock levels", description: "Review available stock by product", type: "Stock", icon: Package },
  { title: "Low-stock products", description: "Identify products needing replenishment", type: "Low stock", icon: AlertTriangle },
  { title: "Outstanding customer balances", description: "Review unpaid customer amounts", type: "Balances", icon: Wallet },
  { title: "Estimated gross profit", description: "Compare sales revenue with product costs", type: "Profit", icon: BarChart3 },
];

const formatUGX = (amount: number) =>
  `UGX ${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString("en-UG")}`;

const numeric = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function saleDate(sale: Sale): Date | null {
  if (!sale.createdAt) return null;
  const date = new Date(sale.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function customerName(customer: Sale["customer"]): string {
  if (typeof customer === "string") return customer || "Walk-in customer";
  return customer?.name || "Walk-in customer";
}

function paymentStatus(sale: Sale): string {
  if (sale.paymentStatus) return sale.paymentStatus.toLowerCase();
  const balance = numeric(sale.balance);
  return balance > 0 ? (numeric(sale.amountPaid) > 0 ? "partial" : "unpaid") : "paid";
}

function dateKey(date: Date, period: Period): string {
  if (period === "Daily") {
    return date.toLocaleTimeString("en-UG", { hour: "2-digit", hour12: true });
  }
  if (period === "Monthly") {
    return date.toLocaleDateString("en-UG", { month: "short", year: "2-digit" });
  }
  return date.toLocaleDateString("en-UG", { day: "2-digit", month: "short" });
}

function RevenueChart({ sales, period }: { sales: Sale[]; period: Period }) {
  const chartData = useMemo(() => {
    const groups = new Map<string, { label: string; revenue: number; payments: number; sort: number }>();
    for (const sale of sales) {
      const date = saleDate(sale);
      if (!date) continue;
      let bucketDate = date;
      if (period === "Weekly") {
        bucketDate = new Date(date);
        bucketDate.setHours(0, 0, 0, 0);
      } else if (period === "Monthly") {
        bucketDate = new Date(date.getFullYear(), date.getMonth(), 1);
      } else {
        bucketDate = new Date(date);
        bucketDate.setMinutes(0, 0, 0);
      }
      const label = dateKey(bucketDate, period);
      const key = period === "Monthly"
        ? `${bucketDate.getFullYear()}-${bucketDate.getMonth()}`
        : period === "Weekly"
          ? `${bucketDate.getFullYear()}-${bucketDate.getMonth()}-${bucketDate.getDate()}`
          : `${bucketDate.getFullYear()}-${bucketDate.getMonth()}-${bucketDate.getDate()}-${bucketDate.getHours()}`;
      const current = groups.get(key) || { label, revenue: 0, payments: 0, sort: bucketDate.getTime() };
      current.revenue += numeric(sale.grandTotal);
      current.payments += numeric(sale.amountPaid);
      groups.set(key, current);
    }
    return [...groups.values()].sort((a, b) => a.sort - b.sort).slice(-8);
  }, [sales, period]);

  if (!chartData.length) {
    return <div className="mt-6 flex h-56 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">No sales in this date range yet.</div>;
  }

  const max = Math.max(1, ...chartData.flatMap((item) => [item.revenue, item.payments])) * 1.1;
  const points = (key: "revenue" | "payments") =>
    chartData.map((item, index) => {
      const x = chartData.length === 1 ? 320 : (index / (chartData.length - 1)) * 640;
      const y = 175 - (item[key] / max) * 150;
      return `${x},${y}`;
    }).join(" ");

  return (
    <div className="mt-6">
      <div className="relative h-[230px] w-full">
        <svg viewBox="0 0 640 205" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={`${period} sales revenue and payments received`}>
          {[25, 75, 125, 175].map((y) => <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="#e2e8f0" strokeWidth="1" />)}
          <polyline points={points("revenue")} fill="none" stroke="#08a8d5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={points("payments")} fill="none" stroke="#202938" strokeWidth="2" strokeDasharray="5 5" strokeLinejoin="round" />
        </svg>
        <div className="absolute inset-x-0 -bottom-5 flex justify-between gap-1">
          {chartData.map((item, index) => <span key={`${item.label}-${index}`} className="max-w-[20%] truncate text-[9px] text-slate-500 sm:text-[11px]">{item.label}</span>)}
        </div>
      </div>
      <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Sales revenue</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-800" />Payments received</span>
      </div>
    </div>
  );
}

function PaymentDonut({ sales }: { sales: Sale[] }) {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const methods = useMemo(() => {
    const totals = new Map<string, number>();
    for (const sale of sales) {
      const name = sale.paymentMethod || "Unspecified";
      totals.set(name, (totals.get(name) || 0) + numeric(sale.amountPaid));
    }
    const colors = ["#08a8d5", "#202938", "#6ac6df", "#cbd5e1", "#8b5cf6"];
    const all = [...totals.entries()].map(([name, amount], index) => ({ name, amount, color: colors[index % colors.length] }));
    const total = all.reduce((sum, item) => sum + item.amount, 0);
    let position = 0;
    const segments = all.map((item) => {
      const percentage = total > 0 ? (item.amount / total) * 100 : 0;
      const segment = { ...item, percentage, start: position, end: position + percentage };
      position += percentage;
      return segment;
    });
    return { segments, total };
  }, [sales]);

  const selected = methods.segments.find((item) => item.name === selectedMethod);
  const gradient = methods.segments.length
    ? `conic-gradient(${methods.segments.map((item) => `${item.color} ${item.start}% ${item.end}%`).join(", ")})`
    : "#e2e8f0";

  return (
    <div className="mt-6 flex flex-col items-center gap-7 sm:flex-row">
      <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full" style={{ background: gradient }} role="img" aria-label="Payments received by payment method">
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white px-1 text-center">
          <span className="text-sm font-bold text-slate-900">{formatUGX(selected?.amount ?? methods.total)}</span>
          <span className="mt-1 text-[10px] text-slate-500">{selected?.name ?? "collected"}</span>
        </div>
      </div>
      <div className="w-full flex-1 space-y-3">
        {methods.segments.length ? methods.segments.map((item) => (
          <button type="button" key={item.name} onClick={() => setSelectedMethod((current) => current === item.name ? null : item.name)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-xs transition hover:bg-slate-50 ${selectedMethod === item.name ? "bg-sky-50" : ""}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="flex-1 text-slate-600">{item.name}</span>
            <span className="w-16 text-right text-slate-500">{item.percentage.toFixed(1)}%</span>
            <span className="w-28 text-right font-semibold text-slate-900">{formatUGX(item.amount)}</span>
          </button>
        )) : <p className="text-sm text-slate-500">No payments recorded for this period.</p>}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [period, setPeriod] = useState<Period>("Weekly");
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [reportPage, setReportPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Load real sales and current stock from the same API used by the POS and Inventory.
  async function loadReports(isRefresh = false) {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [salesResponse, productsResponse] = await Promise.all([
        apiFetch(`${API_URL}/api/sales?limit=2000`),
        apiFetch(`${API_URL}/api/products`),
      ]);
      if (!salesResponse.ok) throw new Error(`Sales API returned ${salesResponse.status}.`);
      if (!productsResponse.ok) throw new Error(`Products API returned ${productsResponse.status}.`);
      const salesJson = await salesResponse.json();
      const productsJson = await productsResponse.json();

      // Accept the standard API wrapper and plain arrays to make the page resilient.
      const salesRows = Array.isArray(salesJson) ? salesJson : salesJson.sales;
      const productRows = Array.isArray(productsJson) ? productsJson : productsJson.products;
      if (!Array.isArray(salesRows)) throw new Error("Sales API response did not include a sales list.");
      if (!Array.isArray(productRows)) throw new Error("Products API response did not include a products list.");
      setSales(salesRows);
      setProducts(productRows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load report data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadReports();
  }, []);

  // Date filtering is shared by summary cards, charts, payment mix and sales-based reports.
  const filteredSales = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59.999`);
    return sales.filter((sale) => {
      const date = saleDate(sale);
      return date && date >= start && date <= end;
    });
  }, [sales, startDate, endDate]);

  const stats = useMemo(() => {
    const revenue = filteredSales.reduce((sum, sale) => sum + numeric(sale.grandTotal), 0);
    const collected = filteredSales.reduce((sum, sale) => sum + numeric(sale.amountPaid), 0);
    const outstanding = filteredSales.reduce((sum, sale) => sum + numeric(sale.balance), 0);
    const soldItems = filteredSales.flatMap((sale) => sale.items || []);
    const costById = new Map(products.map((product) => [String(product.id || product._id || ""), numeric(product.costPrice)]));
    const estimatedCost = soldItems.reduce((sum, item) => {
      const cost = numeric(item.costPrice) || costById.get(String(item.productId || "")) || 0;
      return sum + cost * numeric(item.quantity);
    }, 0);
    const profit = revenue - estimatedCost;
    return [
      { label: "Sales revenue", value: formatUGX(revenue), note: `${filteredSales.length} transaction(s)`, positive: true },
      { label: "Payments received", value: formatUGX(collected), note: "Recorded payments", positive: true },
      { label: "Outstanding balances", value: formatUGX(outstanding), note: `${filteredSales.filter((sale) => numeric(sale.balance) > 0).length} sale(s) with balances`, positive: outstanding === 0 },
      { label: "Estimated gross profit", value: formatUGX(profit), note: estimatedCost > 0 ? `${revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0.0"}% estimated margin` : "Cost snapshots unavailable; estimate may be incomplete", positive: profit >= 0 },
    ];
  }, [filteredSales, products]);

  const paymentTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const sale of filteredSales) {
      const method = sale.paymentMethod || "Unspecified";
      totals.set(method, (totals.get(method) || 0) + numeric(sale.amountPaid));
    }
    return [...totals.entries()].map(([name, amount]) => ({ name, amount }));
  }, [filteredSales]);

  const reportRows = useMemo(() => {
    if (selectedReport === "Products" || selectedReport === "Profit") {
      const byProduct = new Map<string, { name: string; sku: string; units: number; revenue: number; estimatedProfit: number }>();
      for (const sale of filteredSales) {
        for (const item of sale.items || []) {
          const key = String(item.productId || item.sku || item.name || item.productName || "Unknown");
          const row = byProduct.get(key) || { name: item.name || item.productName || "Unknown product", sku: item.sku || "—", units: 0, revenue: 0, estimatedProfit: 0 };
          const units = numeric(item.quantity);
          const revenue = numeric(item.lineTotal) || numeric(item.unitPrice) * units;
          const product = products.find((entry) => String(entry.id || entry._id || "") === String(item.productId || ""));
          const unitCost = numeric(item.costPrice) || numeric(product?.costPrice);
          row.units += units;
          row.revenue += revenue;
          row.estimatedProfit += revenue - unitCost * units;
          byProduct.set(key, row);
        }
      }
      return [...byProduct.values()]
        .sort((a, b) => selectedReport === "Profit" ? b.estimatedProfit - a.estimatedProfit : b.units - a.units)
        .map((row) => ({ Product: row.name, SKU: row.sku, "Units sold": row.units, Revenue: formatUGX(row.revenue), ...(selectedReport === "Profit" ? { "Estimated gross profit": formatUGX(row.estimatedProfit) } : {}) }));
    }

    if (selectedReport === "Stock" || selectedReport === "Low stock") {
      return products
        .filter((product) => product.active !== false)
        .filter((product) => selectedReport !== "Low stock" || numeric(product.quantity ?? product.stock) <= numeric(product.reorderLevel))
        .sort((a, b) => numeric(a.quantity ?? a.stock) - numeric(b.quantity ?? b.stock))
        .map((product) => ({
          Product: product.name,
          SKU: product.sku || "—",
          Category: product.category || "—",
          "In stock": numeric(product.quantity ?? product.stock),
          "Reorder level": numeric(product.reorderLevel),
          "Cost value": formatUGX(numeric(product.costPrice) * numeric(product.quantity ?? product.stock)),
        }));
    }

    if (selectedReport === "Balances") {
      const balances = new Map<string, { customer: string; transactions: number; total: number; paid: number; balance: number }>();
      for (const sale of filteredSales) {
        const name = customerName(sale.customer);
        const row = balances.get(name) || { customer: name, transactions: 0, total: 0, paid: 0, balance: 0 };
        row.transactions += 1;
        row.total += numeric(sale.grandTotal);
        row.paid += numeric(sale.amountPaid);
        row.balance += numeric(sale.balance);
        balances.set(name, row);
      }
      return [...balances.values()].filter((row) => row.balance > 0).sort((a, b) => b.balance - a.balance)
        .map((row) => ({ Customer: row.customer, Transactions: row.transactions, "Sales total": formatUGX(row.total), "Amount paid": formatUGX(row.paid), Outstanding: formatUGX(row.balance) }));
    }

    return filteredSales
      .slice()
      .sort((a, b) => (saleDate(b)?.getTime() || 0) - (saleDate(a)?.getTime() || 0))
      .map((sale) => ({
        Date: saleDate(sale)?.toLocaleString("en-UG") || "—",
        Receipt: sale.receiptNumber || sale.id || sale._id || "—",
        Customer: customerName(sale.customer),
        "Sales total": formatUGX(numeric(sale.grandTotal)),
        Paid: formatUGX(numeric(sale.amountPaid)),
        Balance: formatUGX(numeric(sale.balance)),
        Method: sale.paymentMethod || "—",
        Status: paymentStatus(sale),
      }));
  }, [selectedReport, filteredSales, products]);

  const totalReportPages = Math.max(1, Math.ceil(reportRows.length / PAGE_SIZE));
  const visibleReportRows = reportRows.slice((reportPage - 1) * PAGE_SIZE, reportPage * PAGE_SIZE);

  function chooseReport(type: ReportType) {
    setSelectedReport(type);
    setReportPage(1);
  }

  // Export the currently filtered summary and detailed report as spreadsheet-friendly CSV.
  function exportCSV() {
    const rows: unknown[][] = [
      ["MS Home Security POS report"],
      ["Period start", startDate, "Period end", endDate],
      [],
      ["Metric", "Value", "Notes"],
      ...stats.map((stat) => [stat.label, stat.value, stat.note]),
      [],
      ["Payment method", "Amount received"],
      ...paymentTotals.map((item) => [item.name, item.amount]),
    ];
    if (selectedReport) {
      rows.push([], [reportLibrary.find((item) => item.type === selectedReport)?.title || selectedReport]);
      if (reportRows.length) {
        const columns = Object.keys(reportRows[0]);
        rows.push(columns);
        for (const row of reportRows) rows.push(columns.map((column) => (row as Record<string, unknown>)[column]));
      } else {
        rows.push(["No records for the selected report and date range."]);
      }
    }
    const csv = rows.map((row) => row.map((value) => {
      const cell = String(value ?? "");
      return `"${cell.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ms-home-security-report-${startDate}-to-${endDate}${selectedReport ? `-${selectedReport.toLowerCase().replace(/\s+/g, "-")}` : ""}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-full space-y-5 p-4 sm:p-6 lg:p-7">
      {/* Heading and export/refresh actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">Reports</h2>
          <p className="mt-1 text-sm text-slate-500">Business performance from saved sales and current inventory for {startDate} to {endDate}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadReports(true)} disabled={refreshing} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" onClick={exportCSV} disabled={loading || Boolean(error)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            <Download size={17} /> Export CSV
          </button>
        </div>
      </div>

      {/* Date range is applied consistently to all sale-based figures. */}
      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:flex-row xl:items-center">
        <div className="flex flex-wrap gap-2">
          {(["Daily", "Weekly", "Monthly"] as Period[]).map((item) => (
            <button type="button" key={item} onClick={() => setPeriod(item)} className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition ${period === item ? "border-sky-500 bg-sky-500 text-white shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{item}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
            <span className="sr-only">Start date</span>
            <CalendarDays size={15} className="shrink-0 text-slate-400" />
            <input type="date" value={startDate} onChange={(event) => { const next = event.target.value; setStartDate(next); if (next > endDate) setEndDate(next); }} className="w-full min-w-0 bg-transparent text-sm text-slate-700 outline-none" />
          </label>
          <span className="text-sm text-slate-500">to</span>
          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
            <span className="sr-only">End date</span>
            <CalendarDays size={15} className="shrink-0 text-slate-400" />
            <input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="w-full min-w-0 bg-transparent text-sm text-slate-700 outline-none" />
          </label>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs text-slate-600 xl:ml-auto">
          <span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : loading ? "bg-amber-500" : "bg-emerald-500"}`} />
          {error ? "Data unavailable" : loading ? "Loading live data…" : "Connected to live data"}
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><strong>Could not load reports.</strong> {error} Check that the backend is running and both APIs are reachable.</div>}

      {/* KPI cards are computed from saved sales rather than demo figures. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <section key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{stat.label}</p>
            <p className="mt-2 break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{loading ? "Loading…" : stat.value}</p>
            <p className={`mt-3 text-[11px] ${stat.positive ? "text-emerald-600" : "text-amber-700"}`}>{stat.note}</p>
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Revenue vs payments received</h3>
        <p className="mt-1 text-xs text-slate-500">Sales total compared with money collected in the selected date range.</p>
        <RevenueChart sales={filteredSales} period={period} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Payments by method</h3>
        <p className="mt-1 text-xs text-slate-500">Based on recorded amounts paid, not the sale grand total.</p>
        <PaymentDonut sales={filteredSales} />
      </section>

      {/* Report library opens a real detail table generated from API data. */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Report library</h3>
        <p className="mt-1 text-xs text-slate-500">Select a report to view live transaction or inventory details.</p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {reportLibrary.map((report) => {
            const Icon = report.icon;
            return (
              <button type="button" key={report.type} onClick={() => chooseReport(report.type)} className={`flex min-h-[66px] items-center gap-3 rounded-lg border p-3 text-left transition hover:border-sky-300 hover:bg-sky-50 ${selectedReport === report.type ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon size={19} /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-800">{report.title}</span><span className="mt-1 block text-[10px] text-slate-500">{report.description}</span></span>
                <ChevronRight size={17} className="shrink-0 text-slate-600" />
              </button>
            );
          })}
        </div>

        {selectedReport && (
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
              <div><h4 className="font-semibold text-slate-900">{reportLibrary.find((item) => item.type === selectedReport)?.title}</h4><p className="mt-1 text-xs text-slate-500">{reportRows.length} record(s) · {startDate} to {endDate}</p></div>
              <button type="button" onClick={() => setSelectedReport(null)} className="self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">Close report</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                {reportRows.length > 0 && <thead className="bg-white"><tr>{Object.keys(reportRows[0]).map((column) => <th key={column} className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{column}</th>)}</tr></thead>}
                <tbody className="divide-y divide-slate-100">
                  {visibleReportRows.map((row, index) => <tr key={`${selectedReport}-${index}`} className="hover:bg-slate-50">{Object.keys(row).map((column) => <td key={column} className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">{String((row as Record<string, unknown>)[column] ?? "—")}</td>)}</tr>)}
                  {!visibleReportRows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">No records for this report and date range.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">Showing {reportRows.length ? (reportPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(reportPage * PAGE_SIZE, reportRows.length)} of {reportRows.length}</p>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button type="button" disabled={reportPage <= 1} onClick={() => setReportPage((current) => current - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">Previous</button>
                <span className="text-xs text-slate-500">Page {reportPage} of {totalReportPages}</span>
                <button type="button" disabled={reportPage >= totalReportPages} onClick={() => setReportPage((current) => current + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">Next</button>
              </div>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">Reports use saved sales and current product inventory. Gross profit is an estimate unless each sale stores a cost-price snapshot; historical inventory reports reflect current stock, not past stock levels.</p>
    </div>
  );
}
