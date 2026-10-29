
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BarChart3,
  Box,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Package,
  Plus,
  Search,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "../lib/api";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

type AdjustmentType =
  | "Stock received"
  | "Stock issued"
  | "Damaged stock"
  | "Lost stock"
  | "Stock correction";

type StockStatus = "In stock" | "Low stock" | "Out of stock";

type InventoryProduct = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  costPrice: number;
  reorderLevel: number;
  lastAdjustment: string;
  lastAdjustmentNote: string;
};


const adjustmentTypes: AdjustmentType[] = [
  "Stock received",
  "Stock issued",
  "Damaged stock",
  "Lost stock",
  "Stock correction",
];

const reasonsByType: Record<AdjustmentType, string[]> = {
  "Stock received": [
    "Supplier delivery",
    "Purchase order",
    "Customer return",
    "Other",
  ],
  "Stock issued": ["Customer sale", "Internal use", "Transfer", "Other"],
  "Damaged stock": ["Handling damage", "Product defect", "Other"],
  "Lost stock": ["Missing stock", "Stock discrepancy", "Other"],
  "Stock correction": ["Stock count", "Data correction", "Other"],
};

function getStockStatus(product: InventoryProduct): StockStatus {
  if (product.quantity <= 0) return "Out of stock";
  if (product.quantity <= product.reorderLevel) return "Low stock";
  return "In stock";
}

function formatDate(value?: string): string {
  if (!value) return "No recorded adjustments";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatUGX(value: number): string {
  return `UGX ${value.toLocaleString("en-UG")}`;
}

async function readApiResponse(response: Response) {
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "The request failed.");
  }

  return data;
}

function StatusBadge({ status }: { status: StockStatus }) {
  const styles: Record<StockStatus, string> = {
    "In stock": "bg-emerald-50 text-emerald-700",
    "Low stock": "bg-amber-50 text-amber-700",
    "Out of stock": "bg-rose-50 text-rose-600",
  };

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof Box;
  tone: "blue" | "amber" | "red" | "green";
}) {
  const tones = {
    blue: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-rose-50 text-rose-600",
    green: "bg-emerald-50 text-emerald-600",
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}
      >
        <Icon size={19} />
      </div>
      <p className="mt-4 text-sm text-slate-600">{title}</p>
      <p className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </article>
  );
}

function AdjustmentModal({
  product,
  saving,
  onClose,
  onSave,
}: {
  product: InventoryProduct;
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    productId: string;
    type: AdjustmentType;
    quantity: number;
    reason: string;
    reference: string;
  }) => Promise<void>;
}) {
  const [type, setType] = useState<AdjustmentType>("Stock received");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("Supplier delivery");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  function changeType(nextType: AdjustmentType) {
    setType(nextType);
    setReason(reasonsByType[nextType][0]);
    setQuantity("");
    setError("");
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const amount = Number(quantity);
    const isCorrection = type === "Stock correction";

    // A correction sets the final stock quantity and may legitimately be zero.
    if (
      !Number.isInteger(amount) ||
      amount < 0 ||
      (!isCorrection && amount === 0)
    ) {
      setError(
        isCorrection
          ? "Enter a whole number zero or greater."
          : "Enter a whole number greater than zero."
      );
      return;
    }

    if (
      ["Stock issued", "Damaged stock", "Lost stock"].includes(type) &&
      amount > product.quantity
    ) {
      setError(`Only ${product.quantity} units are currently available.`);
      return;
    }

    if (!reason.trim()) {
      setError("Please select a reason.");
      return;
    }

    try {
      await onSave({
        productId: product.id,
        type,
        quantity: amount,
        reason,
        reference: reference.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save adjustment.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-stock-title"
        className="my-auto w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="adjust-stock-title" className="text-lg font-bold text-slate-900">
              Adjust stock
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Record a stock movement with its reason and reference.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm font-semibold text-sky-600 hover:text-sky-700 disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-lg bg-slate-50 p-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500">
            <Package size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold text-slate-800">
              {product.name}
            </p>
            <p className="mt-1 text-xs text-slate-500">{product.sku}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Current stock</p>
            <p className="text-sm font-bold text-slate-800">
              {product.quantity} units
            </p>
          </div>
        </div>

        <form onSubmit={submitAdjustment}>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-600">
              Adjustment type *
              <select
                value={type}
                onChange={(event) => changeType(event.target.value as AdjustmentType)}
                disabled={saving}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 font-normal text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                {adjustmentTypes.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-600">
              {type === "Stock correction" ? "New stock quantity *" : "Quantity *"}
              <input
                type="number"
                min={type === "Stock correction" ? 0 : 1}
                step="1"
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                disabled={saving}
                placeholder="Enter quantity"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="block text-sm font-medium text-slate-600">
              Reason *
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                disabled={saving}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 font-normal text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                {reasonsByType[type].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-600">
              Reference / notes
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                disabled={saving}
                placeholder="e.g. Supplier delivery note #123"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm font-medium text-rose-600">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse justify-end gap-3 border-t border-slate-200 pt-4 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-600 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={17} />}
              {saving ? "Saving…" : "Save adjustment"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function InventoryPage() {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All stock statuses");
  const [adjustingProduct, setAdjustingProduct] = useState<InventoryProduct | null>(null);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Fetch the same product records used by the Products page.
  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch(`${API_URL}/api/products`);
      const data = await readApiResponse(response);

      // Load stock adjustment history for each product to show its latest movement.
      const mapped: InventoryProduct[] = await Promise.all(
        data.products.map(async (item: Record<string, unknown>) => {
          const id = String(item.id ?? item._id);
          let lastAdjustment = "";
          let lastAdjustmentNote = "No adjustments recorded";

          try {
            const historyResponse = await apiFetch(
              `${API_URL}/api/products/${id}/adjustments`
            );
            const historyData = await readApiResponse(historyResponse);
            const latest = historyData.adjustments?.[0];

            if (latest) {
              lastAdjustment = formatDate(latest.createdAt);
              lastAdjustmentNote =
                latest.type === "Stock correction"
                  ? `Stock corrected · ${latest.newQuantity}`
                  : `${latest.type} · ${latest.change > 0 ? "+" : ""}${latest.change}`;
            }
          } catch {
            // Product quantities remain usable if history cannot be fetched.
            lastAdjustmentNote = "History unavailable";
          }

          return {
            id,
            name: String(item.name ?? ""),
            sku: String(item.sku ?? ""),
            quantity: Number(item.quantity ?? item.stock ?? 0),
            costPrice: Number(item.costPrice ?? 0),
            reorderLevel: Number(item.reorderLevel ?? 5),
            lastAdjustment,
            lastAdjustmentNote,
          };
        })
      );

      setProducts(mapped);
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : "Could not load inventory."} Check the backend at ${API_URL}.`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const searchText = `${product.name} ${product.sku}`.toLowerCase();
      const matchesSearch = searchText.includes(search.toLowerCase().trim());
      const status = getStockStatus(product);
      const matchesStatus =
        statusFilter === "All stock statuses" || status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [products, search, statusFilter]);

  const totalUnits = products.reduce((sum, product) => sum + product.quantity, 0);
  const lowStockCount = products.filter(
    (product) => getStockStatus(product) === "Low stock"
  ).length;
  const outOfStockCount = products.filter(
    (product) => getStockStatus(product) === "Out of stock"
  ).length;
  const inventoryValue = products.reduce(
    (sum, product) => sum + product.quantity * product.costPrice,
    0
  );

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  // Send the adjustment to the API; only update the page after the server confirms.
  async function saveAdjustment(input: {
    productId: string;
    type: AdjustmentType;
    quantity: number;
    reason: string;
    reference: string;
  }) {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await apiFetch(
        `${API_URL}/api/products/${input.productId}/adjustments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: input.type,
            quantity: input.quantity,
            reason: input.reason,
            reference: input.reference,
          }),
        }
      );

      await readApiResponse(response);

      setAdjustingProduct(null);
      setNotice("Stock adjustment saved to MongoDB.");
      await loadInventory();
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : "Could not save stock adjustment."
      );
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = [
      "Product",
      "SKU",
      "Quantity",
      "Status",
      "Cost Price",
      "Inventory Value",
      "Last Adjustment",
      "Adjustment Notes",
    ];

    const rows = filteredProducts.map((product) => [
      product.name,
      product.sku,
      product.quantity,
      getStockStatus(product),
      product.costPrice,
      product.quantity * product.costPrice,
      product.lastAdjustment,
      product.lastAdjustmentNote,
    ]);

    const escapeCsv = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "ms-home-security-inventory.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function changeFilters(nextSearch: string, nextStatus: string) {
    setSearch(nextSearch);
    setStatusFilter(nextStatus);
    setPage(1);
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Inventory
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Monitor stock levels and record every stock movement.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadInventory()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setAdjustingProduct(products[0] ?? null)}
            disabled={products.length === 0 || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:opacity-50"
          >
            <Plus size={18} />
            Adjust stock
          </button>
        </div>
      </section>

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void loadInventory()}
            className="rounded-lg border border-rose-300 px-3 py-2 font-semibold hover:bg-rose-100"
          >
            Try again
          </button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total stock units"
          value={totalUnits.toLocaleString("en-UG")}
          description="Physical units on hand"
          icon={BriefcaseBusiness}
          tone="blue"
        />
        <SummaryCard
          title="Low-stock products"
          value={String(lowStockCount)}
          description="At or below reorder levels"
          icon={AlertTriangle}
          tone="amber"
        />
        <SummaryCard
          title="Out-of-stock products"
          value={String(outOfStockCount)}
          description="Requires restocking"
          icon={Box}
          tone="red"
        />
        <SummaryCard
          title="Inventory value"
          value={formatUGX(inventoryValue)}
          description="At recorded cost prices"
          icon={BarChart3}
          tone="green"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => changeFilters(event.target.value, statusFilter)}
              placeholder="Search stock by product or SKU"
              aria-label="Search stock by product or SKU"
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={statusFilter}
              onChange={(event) => changeFilters(search, event.target.value)}
              aria-label="Filter by stock status"
              className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:min-w-40"
            >
              <option>All stock statuses</option>
              <option>In stock</option>
              <option>Low stock</option>
              <option>Out of stock</option>
            </select>

            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Download size={17} />
              Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last adjustment</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {loading && products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                    Loading inventory from MongoDB…
                  </td>
                </tr>
              )}

              {visibleProducts.map((product) => (
                <tr key={product.id} className="transition hover:bg-sky-50/40">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Package size={19} />
                      </span>
                      <span className="font-medium text-slate-800">
                        {product.name}
                      </span>
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                    {product.sku}
                  </td>

                  <td className="px-4 py-4 text-base font-bold text-slate-900">
                    {product.quantity}
                  </td>

                  <td className="px-4 py-4">
                    <StatusBadge status={getStockStatus(product)} />
                  </td>

                  <td className="px-4 py-3">
                    <p className="whitespace-nowrap text-xs text-slate-600">
                      {product.lastAdjustment || "—"}
                    </p>
                    <p className="mt-1 whitespace-nowrap text-xs text-slate-500">
                      {product.lastAdjustmentNote}
                    </p>
                  </td>

                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setAdjustingProduct(product)}
                      className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && visibleProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Package size={28} className="mx-auto text-slate-300" />
                    <p className="mt-3 font-semibold text-slate-700">
                      No inventory found
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Try a different search term or stock status.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Showing{" "}
            {filteredProducts.length === 0 ? 0 : (safePage - 1) * pageSize + 1}
            {"–"}
            {Math.min(safePage * pageSize, filteredProducts.length)} of{" "}
            {filteredProducts.length} products
          </p>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={15} />
              Previous
            </button>

            <span className="whitespace-nowrap text-xs text-slate-600">
              Page {safePage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Inventory and stock movements are loaded from MongoDB.
      </p>

      {adjustingProduct && (
        <AdjustmentModal
          product={adjustingProduct}
          saving={saving}
          onClose={() => setAdjustingProduct(null)}
          onSave={saveAdjustment}
        />
      )}
    </div>
  );
}
