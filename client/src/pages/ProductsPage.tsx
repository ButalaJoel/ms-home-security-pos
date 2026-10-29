
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Search,
  Plus,
  Package,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "../lib/api";

// Keep the API URL configurable for development and deployment.
const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  reorderLevel: number;
  active: boolean;
};

type ProductForm = {
  name: string;
  sku: string;
  category: string;
  brand: string;
  costPrice: string;
  sellingPrice: string;
  quantity: string;
  reorderLevel: string;
};

const emptyForm: ProductForm = {
  name: "",
  sku: "",
  category: "",
  brand: "",
  costPrice: "",
  sellingPrice: "",
  quantity: "0",
  reorderLevel: "5",
};

const formatUGX = (amount: number) =>
  `UGX ${amount.toLocaleString("en-UG")}`;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [stockStatus, setStockStatus] = useState("All stock statuses");
  const [sortOrder, setSortOrder] = useState("Newest first");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formError, setFormError] = useState("");

  // Fetch the catalogue from MongoDB through the Express API.
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch("/api/products");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load products.");
      }

      // The API stores stock as "quantity". The existing UI uses "stock".
      const mappedProducts: Product[] = data.products.map(
        (item: Record<string, unknown>) => ({
          id: String(item.id ?? item._id),
          name: String(item.name ?? ""),
          sku: String(item.sku ?? ""),
          category: String(item.category ?? ""),
          brand: String(item.brand ?? ""),
          costPrice: Number(item.costPrice ?? 0),
          sellingPrice: Number(item.sellingPrice ?? 0),
          stock: Number(item.quantity ?? item.stock ?? 0),
          reorderLevel: Number(item.reorderLevel ?? 5),
          active: item.active !== false,
        })
      );

      setProducts(mappedProducts);
    } catch (err) {
      setError(
        `${getErrorMessage(err)} Check that the backend is running at ${API_URL}.`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(),
    [products]
  );

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => {
        const term = search.trim().toLowerCase();

        const matchesSearch =
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term) ||
          product.brand.toLowerCase().includes(term);

        const matchesCategory =
          category === "All categories" || product.category === category;

        const matchesStock =
          stockStatus === "All stock statuses" ||
          (stockStatus === "In stock" && product.stock > 0) ||
          (stockStatus === "Low stock" &&
            product.stock > 0 &&
            product.stock <= product.reorderLevel) ||
          (stockStatus === "Out of stock" && product.stock === 0);

        return matchesSearch && matchesCategory && matchesStock;
      })
      .sort((a, b) => {
        if (sortOrder === "Name A–Z") return a.name.localeCompare(b.name);
        if (sortOrder === "Price: low to high") return a.sellingPrice - b.sellingPrice;
        if (sortOrder === "Price: high to low") return b.sellingPrice - a.sellingPrice;

        // The API returns alphabetically sorted products. Reverse the stable
        // list for a simple initial catalogue order until createdAt sorting
        // is explicitly added to the API.
        return b.name.localeCompare(a.name);
      });
  }, [products, search, category, stockStatus, sortOrder]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const visibleProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  function resetPage() {
    setPage(1);
  }

  function openAddModal() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError("");
    setNotice("");
    setModalOpen(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      brand: product.brand,
      costPrice: String(product.costPrice),
      sellingPrice: String(product.sellingPrice),
      quantity: String(product.stock),
      reorderLevel: String(product.reorderLevel),
    });
    setFormError("");
    setNotice("");
    setModalOpen(true);
  }

  function updateForm(field: keyof ProductForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");

    const costPrice = Number(form.costPrice);
    const sellingPrice = Number(form.sellingPrice);
    const quantity = Number(form.quantity);
    const reorderLevel = Number(form.reorderLevel);

    if (!form.name.trim() || !form.sku.trim() || !form.category.trim()) {
      setFormError("Product name, SKU and category are required.");
      return;
    }

    if (
      ![costPrice, sellingPrice, quantity, reorderLevel].every(
        (value) => Number.isFinite(value) && value >= 0
      )
    ) {
      setFormError("Prices and quantities must be valid non-negative numbers.");
      return;
    }

    if (![quantity, reorderLevel].every(Number.isInteger)) {
      setFormError("Stock quantity and reorder level must be whole numbers.");
      return;
    }

    // Stock changes must use the Inventory adjustment API.
    // Therefore, the quantity field is available only when creating a product.
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      category: form.category.trim(),
      brand: form.brand.trim(),
      costPrice,
      sellingPrice,
      reorderLevel,
      ...(editingProduct ? {} : { quantity }),
    };

    setSaving(true);

    try {
      const url = editingProduct
        ? `${API_URL}/api/products/${editingProduct.id}`
        : `${API_URL}/api/products`;

      const response = await apiFetch(url, {
        method: editingProduct ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not save product.");
      }

      setModalOpen(false);
      setNotice(
        editingProduct
          ? "Product updated successfully."
          : "Product added successfully."
      );

      await loadProducts();
      resetPage();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Products
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your product catalogue, pricing and availability.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2"
          >
            <Plus size={18} />
            Add product
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void loadProducts()}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-2 font-semibold hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <label className="relative block">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="Search by product"
              aria-label="Search products"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="relative">
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                resetPage();
              }}
              aria-label="Filter by category"
              className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-9 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option>All categories</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </label>

          <label className="relative">
            <select
              value={stockStatus}
              onChange={(event) => {
                setStockStatus(event.target.value);
                resetPage();
              }}
              aria-label="Filter by stock status"
              className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-9 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option>All stock statuses</option>
              <option>In stock</option>
              <option>Low stock</option>
              <option>Out of stock</option>
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </label>

          <label className="relative">
            <select
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value);
                resetPage();
              }}
              aria-label="Sort products"
              className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-9 text-sm text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option>Newest first</option>
              <option>Name A–Z</option>
              <option>Price: low to high</option>
              <option>Price: high to low</option>
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category / Brand</th>
                <th className="px-4 py-3 text-right">Cost price</th>
                <th className="px-4 py-3 text-right">Selling price</th>
                <th className="px-4 py-3 text-right">In stock</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {loading && products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                    Loading products from MongoDB…
                  </td>
                </tr>
              )}

              {!loading &&
                visibleProducts.map((product) => (
                  <tr key={product.id} className="transition hover:bg-sky-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <Package size={19} strokeWidth={1.7} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">
                            {product.name}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {product.sku}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-600">{product.category}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{product.brand}</p>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-600">
                      {formatUGX(product.costPrice)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold text-slate-800">
                      {formatUGX(product.sellingPrice)}
                    </td>

                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right text-xs ${
                        product.stock === 0
                          ? "font-semibold text-red-600"
                          : product.stock <= product.reorderLevel
                            ? "font-semibold text-amber-600"
                            : "text-slate-600"
                      }`}
                    >
                      {product.stock}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(product)}
                        aria-label={`Edit ${product.name}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}

              {!loading && visibleProducts.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                    No products match your search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Showing{" "}
            {filteredProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            {"–"}
            {Math.min(currentPage * pageSize, filteredProducts.length)} of{" "}
            {filteredProducts.length} products
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => value - 1)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={15} />
              Previous
            </button>

            <span className="px-2 text-xs text-slate-600">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>

      <p className="mt-3 text-xs text-slate-400">
        Product catalogue connected to MongoDB. Stock movements are managed through Inventory.
      </p>

      {/* Add/Edit modal. The same form serves both operations. */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setModalOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <h2 id="product-modal-title" className="text-lg font-bold text-slate-950">
                  {editingProduct ? "Edit product" : "Add product"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {editingProduct
                    ? "Update product details and pricing."
                    : "Add a product to the database catalogue."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                aria-label="Close product form"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6">
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Product name *
                  <input
                    required
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="e.g. 4MP Dome Camera"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  SKU *
                  <input
                    required
                    value={form.sku}
                    onChange={(event) => updateForm("sku", event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm uppercase outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="CAM-001"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Category *
                  <input
                    required
                    list="product-categories"
                    value={form.category}
                    onChange={(event) => updateForm("category", event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="e.g. CCTV Cameras"
                  />
                  <datalist id="product-categories">
                    {categories.map((item) => <option key={item} value={item} />)}
                  </datalist>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Brand
                  <input
                    value={form.brand}
                    onChange={(event) => updateForm("brand", event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="Brand name"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Cost price (UGX) *
                  <input
                    required
                    min="0"
                    type="number"
                    step="1"
                    value={form.costPrice}
                    onChange={(event) => updateForm("costPrice", event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Selling price (UGX) *
                  <input
                    required
                    min="0"
                    type="number"
                    step="1"
                    value={form.sellingPrice}
                    onChange={(event) => updateForm("sellingPrice", event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                {!editingProduct ? (
                  <label className="text-sm font-medium text-slate-700">
                    Opening stock *
                    <input
                      required
                      min="0"
                      type="number"
                      step="1"
                      value={form.quantity}
                      onChange={(event) => updateForm("quantity", event.target.value)}
                      className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>
                ) : (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-1">
                    <p className="text-xs text-slate-500">Current stock</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {editingProduct.stock} units
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Change stock from the Inventory page to keep an adjustment history.
                    </p>
                  </div>
                )}

                <label className="text-sm font-medium text-slate-700">
                  Reorder level *
                  <input
                    required
                    min="0"
                    type="number"
                    step="1"
                    value={form.reorderLevel}
                    onChange={(event) => updateForm("reorderLevel", event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                {formError && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
                    {formError}
                  </p>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-wait disabled:opacity-60"
                >
                  {saving && <RefreshCw size={15} className="animate-spin" />}
                  {saving ? "Saving…" : editingProduct ? "Save changes" : "Create product"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
