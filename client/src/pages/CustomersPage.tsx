import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Users,
  X,
  Eye,
  Phone,
  Mail,
  MapPin,
  Building2,
  UserRound,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

import { apiFetch } from "../lib/api";

// Customer profiles are derived from completed sales. This prevents demo-only
// customers from appearing before they have made a transaction.
type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  type: "Customer" | "Company account";
  transactions: number;
  totalSpent: number;
  outstandingBalance: number;
  address: string;
  notes: string;
  lastSaleAt: string | null;
};

type SaleRecord = {
  _id?: string;
  id?: string;
  receiptNumber?: string;
  customer?: string | { name?: string; phone?: string; email?: string; address?: string };
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerType?: string;
  items?: Array<{ name?: string; productName?: string; quantity?: number; unitPrice?: number; lineTotal?: number }>;
  grandTotal?: number;
  amountPaid?: number;
  balance?: number;
  paymentStatus?: string;
  createdAt?: string;
};

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");
const PAGE_SIZE = 8;

const formatUGX = (amount: number) =>
  `UGX ${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString("en-UG")}`;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalisePhone(value: string): string {
  // Keep the phone number readable; remove only accidental surrounding spaces.
  return value.trim();
}

function getSaleCustomer(sale: SaleRecord) {
  const customerObject =
    sale.customer && typeof sale.customer === "object" ? sale.customer : null;

  const name =
    asText(sale.customerName) ||
    asText(customerObject?.name) ||
    (typeof sale.customer === "string" ? sale.customer.trim() : "") ||
    "Walk-in customer";

  return {
    name,
    phone: normalisePhone(asText(sale.customerPhone) || asText(customerObject?.phone)),
    email: asText(sale.customerEmail) || asText(customerObject?.email),
    address: asText(sale.customerAddress) || asText(customerObject?.address),
    type:
      asText(sale.customerType).toLowerCase() === "company account"
        ? ("Company account" as const)
        : ("Customer" as const),
  };
}

function toCustomerKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export default function CustomersPage() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All customers");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  async function loadSales() {
    setLoading(true);
    setLoadError("");

    try {
      // Sales are the source of truth for this page. No hardcoded customer data.
      const response = await apiFetch(`${API_URL}/api/sales?limit=1000`);

      if (!response.ok) {
        throw new Error(`Sales request failed (${response.status})`);
      }

      const payload: unknown = await response.json();
      const rows = Array.isArray(payload)
        ? payload
        : payload &&
            typeof payload === "object" &&
            Array.isArray((payload as { sales?: unknown[] }).sales)
          ? (payload as { sales: unknown[] }).sales
          : payload &&
              typeof payload === "object" &&
              Array.isArray((payload as { data?: unknown[] }).data)
            ? (payload as { data: unknown[] }).data
            : null;

      if (!rows) {
        throw new Error("The sales API returned an unexpected response format.");
      }

      setSales(rows as SaleRecord[]);
    } catch (error) {
      console.error("Could not load customers from sales:", error);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load customers from sales.",
      );
      setSales([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSales();
  }, []);

  // Group sales by customer name. Each customer appears once, while transaction
  // count, total spent and outstanding balance are calculated from their sales.
  const customers = useMemo<Customer[]>(() => {
    const grouped = new Map<
      string,
      Customer & { latestTimestamp: number }
    >();

    for (const sale of sales) {
      const details = getSaleCustomer(sale);
      const key = toCustomerKey(details.name);
      const total = Math.max(0, Number(sale.grandTotal) || 0);
      const paid = Math.max(0, Number(sale.amountPaid) || 0);
      const balance =
        sale.balance !== undefined
          ? Math.max(0, Number(sale.balance) || 0)
          : Math.max(0, total - paid);
      const timestamp = sale.createdAt ? new Date(sale.createdAt).getTime() : 0;
      const safeTimestamp = Number.isFinite(timestamp) ? timestamp : 0;
      const existing = grouped.get(key);

      if (existing) {
        existing.transactions += 1;
        existing.totalSpent += total;
        existing.outstandingBalance += balance;

        // Fill contact details from any sale that contains them.
        if (!existing.phone && details.phone) existing.phone = details.phone;
        if (!existing.email && details.email) existing.email = details.email;
        if (!existing.address && details.address) existing.address = details.address;
        if (details.type === "Company account") existing.type = details.type;

        if (safeTimestamp > existing.latestTimestamp) {
          existing.lastSaleAt = sale.createdAt || null;
          existing.latestTimestamp = safeTimestamp;
          // Prefer the customer's latest non-empty display name.
          existing.name = details.name;
        }
      } else {
        grouped.set(key, {
          id: key,
          name: details.name,
          phone: details.phone,
          email: details.email,
          type: details.type,
          transactions: 1,
          totalSpent: total,
          outstandingBalance: balance,
          address: details.address,
          notes: "",
          lastSaleAt: sale.createdAt || null,
          latestTimestamp: safeTimestamp,
        });
      }
    }

    return Array.from(grouped.values())
      .map(({ latestTimestamp: _latestTimestamp, ...customer }) => customer)
      .sort((a, b) => {
        const aTime = a.lastSaleAt ? new Date(a.lastSaleAt).getTime() : 0;
        const bTime = b.lastSaleAt ? new Date(b.lastSaleAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [sales]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesSearch =
        customer.name.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query);

      const matchesType =
        typeFilter === "All customers" || customer.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [customers, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleCustomers = filteredCustomers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const totalOutstanding = customers.reduce(
    (total, customer) => total + customer.outstandingBalance,
    0,
  );
  const companyAccounts = customers.filter(
    (customer) => customer.type === "Company account",
  ).length;

  function formatDate(value: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Page heading and refresh action */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-600">
            CUSTOMER MANAGEMENT
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Customers
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Customers are added automatically when a sale is recorded.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadSales()}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          Refresh customers
        </button>
      </div>

      {/* Summary cards use the actual saved sales, not illustrative values. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Unique customers</p>
            <span className="rounded-xl bg-sky-50 p-2 text-sky-600">
              <Users size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{customers.length}</p>
          <p className="mt-1 text-xs text-slate-400">Customers with recorded sales</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Company accounts</p>
            <span className="rounded-xl bg-violet-50 p-2 text-violet-600">
              <Building2 size={19} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{companyAccounts}</p>
          <p className="mt-1 text-xs text-slate-400">
            Only identified when the sale records this customer type
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Outstanding balances</p>
            <span className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <Users size={19} />
            </span>
          </div>
          <p className="mt-3 break-words text-2xl font-bold text-slate-900">
            {formatUGX(totalOutstanding)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Combined balances from saved sales
          </p>
        </div>
      </div>

      {/* Search, filters and paginated customer table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h3 className="font-semibold text-slate-900">Customer directory</h3>
            <p className="mt-1 text-xs text-slate-400">
              Search customers by name, phone or email.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 sm:w-72">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name, phone or email"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
            >
              <option>All customers</option>
              <option>Customer</option>
              <option>Company account</option>
            </select>
          </div>
        </div>

        {loadError && (
          <div className="m-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Could not load customer sales</p>
              <p className="mt-1">{loadError}</p>
              <p className="mt-1 text-xs">
                Confirm the backend is running and that GET /api/sales is available.
              </p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead className="bg-slate-50">
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-4">Customer</th>
                <th className="px-4 py-4">Phone</th>
                <th className="px-4 py-4">Email</th>
                <th className="px-4 py-4 text-center">Transactions</th>
                <th className="px-4 py-4 text-right">Outstanding balance</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleCustomers.map((customer) => (
                <tr key={customer.id} className="transition hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-700">
                        {customer.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="whitespace-nowrap text-sm font-semibold text-slate-900">
                          {customer.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {customer.type} · Last sale {formatDate(customer.lastSaleAt)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                    {customer.phone ? (
                      <a className="inline-flex items-center gap-1 hover:text-sky-600" href={`tel:${customer.phone}`}>
                        <Phone size={13} />
                        {customer.phone}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                    {customer.email ? (
                      <a className="hover:text-sky-600" href={`mailto:${customer.email}`}>
                        {customer.email}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-4 text-center text-sm text-slate-600">
                    {customer.transactions}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-4 text-right text-xs font-semibold ${customer.outstandingBalance > 0 ? "text-red-600" : "text-slate-600"}`}>
                    {formatUGX(customer.outstandingBalance)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(customer)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-sky-600 hover:bg-sky-50"
                    >
                      <Eye size={15} />
                      View
                      <ChevronRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && visibleCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <Users size={30} className="mx-auto mb-3 text-slate-300" />
                    <p className="font-semibold text-slate-700">
                      {search || typeFilter !== "All customers"
                        ? "No customers found"
                        : "No customers yet"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {search || typeFilter !== "All customers"
                        ? "Try another search or filter."
                        : "Record a sale in Point of Sale to add its customer here."}
                    </p>
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading customers from saved sales…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination is calculated after search and filtering. */}
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Showing {filteredCustomers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            {"–"}{Math.min(currentPage * PAGE_SIZE, filteredCustomers.length)} of{" "}
            {filteredCustomers.length} customers
          </p>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <span className="px-2 text-xs text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Customer directory is built from MongoDB sales. Contact details appear when the sale contains them.
      </p>

      {/* Customer detail drawer: read-only because this page is sales-derived. */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/40 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close customer details"
            onClick={() => setSelectedCustomer(null)}
            className="absolute inset-0 cursor-default"
          />
          <aside className="relative z-10 h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">
                  Customer profile
                </p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">Customer details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                aria-label="Close details"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-lg font-bold text-sky-700">
                  {selectedCustomer.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h4 className="break-words font-bold text-slate-900">{selectedCustomer.name}</h4>
                  <p className="mt-1 text-sm text-slate-500">{selectedCustomer.type}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Transactions</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{selectedCustomer.transactions}</p>
                </div>
                <div className="rounded-xl bg-red-50 p-4">
                  <p className="text-xs text-red-600">Outstanding</p>
                  <p className="mt-2 break-words text-base font-bold text-red-700">{formatUGX(selectedCustomer.outstandingBalance)}</p>
                </div>
                <div className="col-span-2 rounded-xl bg-sky-50 p-4">
                  <p className="text-xs text-sky-700">Total sales value</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{formatUGX(selectedCustomer.totalSpent)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <Phone size={18} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-400">Phone number</p>
                    {selectedCustomer.phone ? (
                      <a href={`tel:${selectedCustomer.phone}`} className="mt-1 block text-sm text-sky-700">
                        {selectedCustomer.phone}
                      </a>
                    ) : <p className="mt-1 text-sm text-slate-800">Not captured on sale</p>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Mail size={18} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-400">Email address</p>
                    {selectedCustomer.email ? (
                      <a href={`mailto:${selectedCustomer.email}`} className="mt-1 block break-words text-sm text-sky-700">
                        {selectedCustomer.email}
                      </a>
                    ) : <p className="mt-1 text-sm text-slate-800">Not captured on sale</p>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <MapPin size={18} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-400">Address</p>
                    <p className="mt-1 text-sm text-slate-800">{selectedCustomer.address || "Not captured on sale"}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <UserRound size={18} className="mt-0.5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-400">Notes</p>
                    <p className="mt-1 text-sm text-slate-800">
                      Customer details are derived from recorded transactions. To keep this page sales-only, new customer profiles are not manually added here.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-700">Purchase history</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {selectedCustomer.transactions} saved transaction(s). Open Sales History to inspect the individual receipts and payment breakdowns.
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
