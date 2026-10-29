import { useEffect, useMemo, useState } from "react";
import type { ReactNode, ElementType } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Package,
  Plus,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "../lib/api";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const formatUGX = (amount: number) =>
  `UGX ${Number(amount || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 })}`;

type DashboardPayload = {
  success: boolean;
  generatedAt: string;
  periodDays: number;
  stats: {
    revenueToday: number;
    transactionsToday: number;
    averageSaleToday: number;
    activeProducts: number;
    categoryCount: number;
    lowStockCount: number;
    outOfStockCount: number;
    outstandingBalance: number;
    customersWithBalances: number;
  };
  revenueChart: { date: string; label: string; amount: number }[];
  lowStockProducts: { name: string; sku: string; stock: number; reorderLevel: number }[];
  recentSales: {
    id: string;
    ref: string;
    createdAt: string;
    customer: string;
    total: number;
    status: string;
  }[];
  bestSellingProducts: { name: string; quantity: number; revenue: number }[];
};

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  trend,
  trendPositive = true,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ElementType;
  iconColor: string;
  iconBg: string;
  trend?: string;
  trendPositive?: boolean;
}) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
        {trend && (
          <span className={`flex items-center gap-1 text-xs font-medium ${trendPositive ? "text-emerald-600" : "text-amber-600"}`}>
            {trendPositive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
            {trend}
          </span>
        )}
      </div>
      <p className="mt-4 text-sm text-slate-500">{title}</p>
      <p className="mt-1 break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{subtitle}</p>
    </article>
  );
}

function formatSaleDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-UG", {
    timeZone: "Africa/Kampala",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return "Paid";
  if (normalized === "partial") return "Partial";
  return "Unpaid";
}

export default function DashboardPage() {
  const [period, setPeriod] = useState("7");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard?period=${period}`);
      const payload = (await response.json()) as DashboardPayload & { message?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Dashboard data could not be loaded.");
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to the API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
    // loadDashboard is intentionally triggered when the selected period changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const chartMax = useMemo(
    () => Math.max(1, ...(data?.revenueChart.map((item) => item.amount) ?? [1])),
    [data],
  );

  const stats = data?.stats;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Business overview</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Here&apos;s how your security equipment business is performing.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => { window.location.href = "/reports"; }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <BarChart3 size={17} /> View reports
          </button>
          <button type="button" onClick={() => { window.location.href = "/pos"; }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600">
            <Plus size={18} /> New sale
          </button>
          <button type="button" onClick={() => void loadDashboard()} disabled={loading} aria-label="Refresh dashboard" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span><strong>Dashboard connection failed:</strong> {error}</span>
          <button type="button" onClick={() => void loadDashboard()} className="font-semibold underline">Try again</button>
        </div>
      )}
      {loading && !data && (
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">Loading live business data from the database…</div>
      )}
      {data && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>Live data loaded from MongoDB.</span>
          <span className="text-xs text-emerald-700">Updated {formatSaleDate(data.generatedAt)}</span>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Today's sales revenue" value={formatUGX(stats?.revenueToday ?? 0)} subtitle="Recorded sales for today (Kampala time)" icon={BarChart3} iconColor="text-sky-600" iconBg="bg-sky-50" />
        <StatCard title="Transactions today" value={String(stats?.transactionsToday ?? 0)} subtitle={`Average sale: ${formatUGX(stats?.averageSaleToday ?? 0)}`} icon={Clock3} iconColor="text-violet-600" iconBg="bg-violet-50" />
        <StatCard title="Active products" value={(stats?.activeProducts ?? 0).toLocaleString("en-UG")} subtitle={`Across ${stats?.categoryCount ?? 0} categories`} icon={Package} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
        <StatCard title="Low-stock products" value={String(stats?.lowStockCount ?? 0)} subtitle={`${stats?.outOfStockCount ?? 0} products currently out of stock`} icon={AlertTriangle} iconColor="text-amber-600" iconBg="bg-amber-50" trend={(stats?.lowStockCount ?? 0) > 0 ? "Needs attention" : "Stock levels OK"} trendPositive={(stats?.lowStockCount ?? 0) === 0} />
        <StatCard title="Outstanding balances" value={formatUGX(stats?.outstandingBalance ?? 0)} subtitle={`Across ${stats?.customersWithBalances ?? 0} customer accounts`} icon={FileText} iconColor="text-rose-600" iconBg="bg-rose-50" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <SectionHeading title="Sales revenue" subtitle={`Saved sales revenue • UGX • ${period} day view`} action={
          <select aria-label="Sales chart period" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        } />
        <div className="mt-6 flex gap-3 sm:gap-5">
          <div className="flex h-56 flex-col justify-between pb-7 text-right text-[11px] text-slate-400 sm:h-64">
            {[4, 3, 2, 1, 0].map((tick) => <span key={tick}>{formatUGX((chartMax * tick) / 4).replace("UGX ", "")}</span>)}
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="pointer-events-none absolute inset-0 bottom-7 flex flex-col justify-between">{[0, 1, 2, 3, 4].map((line) => <div key={line} className="border-t border-slate-100" />)}</div>
            <div className="relative flex h-56 items-stretch gap-1 overflow-x-auto pb-7 sm:h-64 sm:gap-2">
              {(data?.revenueChart ?? []).map((item) => (
                <div key={item.date} className="relative flex h-full min-w-[24px] flex-1 flex-col items-center justify-end">
                  <span className="mb-2 hidden whitespace-nowrap text-[10px] font-semibold text-slate-500 sm:block">{item.amount ? `${(item.amount / 1000000).toFixed(1)}M` : ""}</span>
                  <div className="flex h-full w-full items-end justify-center">
                    <div title={`${item.label}: ${formatUGX(item.amount)}`} className="w-full max-w-12 rounded-t-md bg-sky-500 transition-opacity hover:opacity-80" style={{ height: `${item.amount > 0 ? Math.max(2, (item.amount / chartMax) * 100) : 0}%` }} />
                  </div>
                  <span className="absolute bottom-0 text-[10px] text-slate-500">{item.label}</span>
                </div>
              ))}
              {!loading && !data?.revenueChart.length && <p className="m-auto text-sm text-slate-400">No sales recorded in this period.</p>}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">Period revenue: <span className="font-bold text-slate-900">{formatUGX(data?.revenueChart.reduce((sum, item) => sum + item.amount, 0) ?? 0)}</span></p>
          <span className="text-xs text-slate-400">Selected period: last {period} days</span>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <SectionHeading title="Low-stock alerts" subtitle="Products requiring attention" action={<button type="button" onClick={() => { window.location.href = "/inventory"; }} className="text-sm font-semibold text-sky-600 hover:text-sky-700">View inventory <ChevronRight className="ml-1 inline" size={16} /></button>} />
        <div className="mt-5 divide-y divide-slate-100">
          {(data?.lowStockProducts ?? []).map((product) => (
            <div key={product.sku} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100"><Package size={19} className="text-slate-500" /></div>
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-slate-800">{product.name}</p><p className="mt-1 text-xs text-slate-400">{product.sku}</p></div>
              <span className={`shrink-0 text-xs font-semibold ${product.stock === 0 ? "text-red-600" : "text-amber-600"}`}>{product.stock === 0 ? "Out of stock" : `${product.stock} left`}</span>
            </div>
          ))}
          {data && data.lowStockProducts.length === 0 && <p className="py-4 text-sm text-slate-500">No low-stock products. Stock levels look good.</p>}
        </div>
        <button type="button" onClick={() => { window.location.href = "/inventory"; }} className="mt-5 w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Manage inventory</button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <SectionHeading title="Recent sales" subtitle="Latest saved transactions" action={<button type="button" onClick={() => { window.location.href = "/sales"; }} className="text-sm font-semibold text-sky-600 hover:text-sky-700">View all <ChevronRight className="ml-1 inline" size={16} /></button>} />
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead><tr className="border-y border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><th className="px-3 py-3 font-semibold">Reference</th><th className="px-3 py-3 font-semibold">Date</th><th className="px-3 py-3 font-semibold">Customer</th><th className="px-3 py-3 text-right font-semibold">Total</th><th className="px-3 py-3 text-center font-semibold">Status</th><th className="px-3 py-3" /></tr></thead>
            <tbody>
              {(data?.recentSales ?? []).map((sale) => {
                const label = statusLabel(sale.status);
                return <tr key={sale.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-4 font-semibold text-sky-700">{sale.ref}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-500">{formatSaleDate(sale.createdAt)}</td>
                  <td className="px-3 py-4 font-medium text-slate-800">{sale.customer}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right font-medium text-slate-800">{formatUGX(sale.total)}</td>
                  <td className="px-3 py-4 text-center"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${label === "Paid" ? "bg-emerald-50 text-emerald-700" : label === "Partial" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{label}</span></td>
                  <td className="px-3 py-4 text-right"><button type="button" aria-label={`View ${sale.ref}`} onClick={() => { window.location.href = `/documents?sale=${encodeURIComponent(sale.id)}`; }} className="rounded-md p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600"><Eye size={17} /></button></td>
                </tr>;
              })}
              {data && data.recentSales.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">No sales recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400 sm:hidden">Swipe horizontally to see all sale details.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <SectionHeading title="Best-selling products" subtitle={`Ranked by quantity • Last ${period} days`} />
        <div className="mt-5 divide-y divide-slate-100">
          {(data?.bestSellingProducts ?? []).map((product, index) => (
            <div key={`${product.name}-${index}`} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-slate-800">{product.name}</p><p className="mt-1 text-xs text-slate-500">{product.quantity} sold</p></div>
              <p className="shrink-0 text-right text-xs font-bold text-slate-800 sm:text-sm">{formatUGX(product.revenue)}</p>
            </div>
          ))}
          {data && data.bestSellingProducts.length === 0 && <p className="py-4 text-sm text-slate-500">No product sales in this period.</p>}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { window.location.href = "/products"; }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Plus size={17} /> Add product</button>
          <button type="button" onClick={() => { window.location.href = "/reports"; }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><BarChart3 size={17} /> Reports</button>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs text-slate-400">
        <span>MS Home Security Solutions · POS</span>
        <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : loading ? "bg-amber-500" : "bg-emerald-500"}`} />{error ? "API connection issue" : loading ? "Refreshing data" : "Connected to API"}</span>
      </footer>
    </div>
  );
}
