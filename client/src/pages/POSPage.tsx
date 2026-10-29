import { recordLocalSaleWithPayload } from "../db/offlineService";
import type { LocalSale } from "../db/database";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Minus,
  Package,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { cacheProducts, getCachedProducts } from "../db/offlineService";

// Product records are loaded from MongoDB through the backend API.
type Product = {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  sellingPrice: number;
  quantity: number;
  active?: boolean;
};

type CartItem = {
  product: Product;
  quantity: number;
  discount: number;
};

type SavedSaleItem = {
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  discountAmount: number;
  lineTotal: number;
};

type SavedSale = {
  id: string;
  receiptNumber: string;
  customer: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerType?: string;
  items: SavedSaleItem[];
  subtotal: number;
  lineDiscountTotal: number;
  overallDiscount: number;
  taxEnabled: boolean;
  taxLabel?: string;
  taxRate: number;
  tax: number;
  grandTotal: number;
  paymentMethod: string;
  amountPaid: number;
  balance: number;
  change: number;
  paymentStatus: "paid" | "partial" | "unpaid";
  createdAt: string;
};

type BusinessSettings = {
  taxEnabled: boolean;
  taxLabel: string;
  taxRate: number;
};

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

const money = (amount: number) =>
  `UGX ${Math.round(amount).toLocaleString("en-UG")}`;

function getProductId(product: Product): string {
  return product.id;
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All products");
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer information is captured here and sent with the saved sale.
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerType, setCustomerType] = useState<
    "Customer" | "Company account"
  >("Customer");

  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [amountPaid, setAmountPaid] = useState("0");
  const [overallDiscount, setOverallDiscount] = useState("0");
 const [businessSettings, setBusinessSettings] =
  useState<BusinessSettings>({
    taxEnabled: false,
    taxLabel: "Tax",
    taxRate: 0,
  });

const taxEnabled = businessSettings.taxEnabled;
const taxLabel = businessSettings.taxLabel;
const taxRate = taxEnabled ? businessSettings.taxRate : 0;
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [savedSale, setSavedSale] = useState<SavedSale | null>(null);

  // Load the live catalogue and keep a local copy for offline checkout.
  async function loadProducts() {
    setLoadingProducts(true);

    try {
      const response = await apiFetch("/api/products");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load products.");
      }

      const loaded: Product[] = (data.products || []).map(
        (item: Record<string, unknown>) => ({
          id: String(item.id ?? item._id),
          name: String(item.name ?? ""),
          sku: String(item.sku ?? ""),
          brand: String(item.brand ?? ""),
          category: String(item.category ?? "Other"),
          sellingPrice: Number(item.sellingPrice ?? 0),
          quantity: Number(item.quantity ?? item.stockQuantity ?? 0),
          active: item.active !== false,
        }),
      );

      setProducts(loaded.filter((product) => product.active !== false));

      await cacheProducts(
        loaded.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          sellingPrice: product.sellingPrice,
          stockQuantity: product.quantity,
          updatedAt: new Date().toISOString(),
        })),
      );

      setMessage("");
      setMessageIsError(false);
    } catch (error) {
      try {
        const cached = await getCachedProducts();

        if (cached.length > 0) {
          setProducts(
            cached.map((product) => ({
              id: product.id,
              name: product.name,
              sku: product.sku,
              brand: "",
              category: product.category || "Other",
              sellingPrice: product.sellingPrice,
              quantity: product.stockQuantity,
              active: true,
            })),
          );
          setMessage("Offline mode: showing cached products. Stock and final totals require server validation.");
          setMessageIsError(false);
        } else {
          setProducts([]);
          setMessage("No cached products are available. Reconnect to load the catalogue before starting offline sales.");
          setMessageIsError(true);
        }
      } catch {
        setProducts([]);
        setMessage("Could not load products from the server or local cache.");
        setMessageIsError(true);
      }
    } finally {
      setLoadingProducts(false);
    }
  }
  useEffect(() => {
  void loadProducts();

  let cancelled = false;

  async function loadBusinessSettings() {
    try {
      const response = await apiFetch("/api/settings");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Could not load business settings.");
      }

      const settings = result.settings ?? result;

      if (!cancelled) {
        setBusinessSettings({
          taxEnabled: settings.taxEnabled === true,
          taxLabel:
            typeof settings.taxLabel === "string" &&
            settings.taxLabel.trim()
              ? settings.taxLabel.trim()
              : "Tax",
          taxRate: Math.min(
            100,
            Math.max(0, Number(settings.taxRate) || 0),
          ),
        });
      }
    } catch (error) {
      if (!cancelled) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load business tax settings.",
        );
        setMessageIsError(true);
      }
    }
  }

  void loadBusinessSettings();

  return () => {
    cancelled = true;
  };
}, []);

  const categories = useMemo(
    () => [
      "All products",
      ...Array.from(new Set(products.map((product) => product.category))).sort(),
    ],
    [products],
  );

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.brand.toLowerCase().includes(term);

      const matchesCategory =
        category === "All products" || product.category === category;

      return matchesSearch && matchesCategory;
    });
  }, [products, search, category]);

  const subtotal = cart.reduce(
    (sum, item) => sum + item.product.sellingPrice * item.quantity,
    0,
  );

  const lineDiscountTotal = cart.reduce(
    (sum, item) =>
      sum +
      Math.round(
        item.product.sellingPrice * item.quantity * (item.discount / 100),
      ),
    0,
  );

  const discount = Math.min(
    Math.max(0, Number(overallDiscount) || 0),
    Math.max(0, subtotal - lineDiscountTotal),
  );

  const taxableAmount = Math.max(
    0,
    subtotal - lineDiscountTotal - discount,
  );

  const tax = taxEnabled
  ? Math.round((taxableAmount * taxRate) / 100)
  : 0;

const grandTotal = taxableAmount + tax;

  const paidInput = Math.max(0, Number(amountPaid) || 0);
  const paid = Math.min(paidInput, grandTotal);
  const balance = Math.max(0, grandTotal - paid);
  const change = Math.max(0, paidInput - grandTotal);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addToCart(product: Product) {
    setMessage("");
    setMessageIsError(false);

    if (product.quantity < 1) {
      setMessage(`${product.name} is out of stock.`);
      setMessageIsError(true);
      return;
    }

    const existing = cart.find(
      (item) => getProductId(item.product) === getProductId(product),
    );

    if ((existing?.quantity ?? 0) >= product.quantity) {
      setMessage(`Only ${product.quantity} units are available for ${product.name}.`);
      setMessageIsError(true);
      return;
    }

    setCart((current) => {
      const found = current.find(
        (item) => getProductId(item.product) === getProductId(product),
      );

      if (found) {
        return current.map((item) =>
          getProductId(item.product) === getProductId(product)
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [...current, { product, quantity: 1, discount: 0 }];
    });
  }

  function updateQuantity(productId: string, amount: number) {
    setCart((current) =>
      current
        .map((item) =>
          getProductId(item.product) === productId
            ? {
                ...item,
                quantity: Math.min(
                  item.product.quantity,
                  item.quantity + amount,
                ),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function updateLineDiscount(productId: string, value: string) {
    const percentage = Math.min(100, Math.max(0, Number(value) || 0));

    setCart((current) =>
      current.map((item) =>
        getProductId(item.product) === productId
          ? { ...item, discount: percentage }
          : item,
      ),
    );
  }

  function clearSale() {
    setCart([]);
    setAmountPaid("0");
    setOverallDiscount("0");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setCustomerAddress("");
    setCustomerType("Customer");
    setMessage("");
    setMessageIsError(false);
  }

  function completeSale() {
    setMessage("");
    setMessageIsError(false);

    if (cart.length === 0) {
      setMessage("Add at least one product before completing a sale.");
      setMessageIsError(true);
      return;
    }

    if (!Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0) {
      setMessage("Enter a valid payment amount.");
      setMessageIsError(true);
      return;
    }

    if (
      customerEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())
    ) {
      setMessage("Enter a valid email address or leave it blank.");
      setMessageIsError(true);
      return;
    }

    setShowConfirmation(true);
  }

  // Submit the sale. The server must validate stock and calculate trusted totals.
  // Save online when possible; queue locally when the server is unreachable.
  async function confirmSale() {
    if (submitting) return;

    setSubmitting(true);
    setMessage("");
    setMessageIsError(false);

    const clientSaleId = crypto.randomUUID();

    const requestPayload = {
      clientSaleId,
      customer: customerName.trim() || "Walk-in customer",
      customerName: customerName.trim() || "Walk-in customer",
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      customerAddress: customerAddress.trim(),
      customerType,
      paymentMethod,
      amountPaid: paidInput,
      overallDiscount: discount,
      taxEnabled,
      items: cart.map((item) => ({
        productId: getProductId(item.product),
        quantity: item.quantity,
        discount: item.discount,
      })),
    };

    let serverResponded = false;

    try {
      const response = await apiFetch(`${API_BASE_URL}/api/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      serverResponded = true;

      const data = await response.json();

      if (!response.ok || !data.success || !data.sale) {
        throw new Error(data.message || "The sale could not be saved.");
      }

      setSavedSale(data.sale as SavedSale);
      setShowConfirmation(false);
      setMessage(`Sale saved successfully. Receipt ${data.sale.receiptNumber}.`);
      setMessageIsError(false);
      setCart([]);
      setAmountPaid("0");
      setOverallDiscount("0");
      await loadProducts();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The sale could not be saved.";

      if (!serverResponded) {

    try {
          const localSale: LocalSale = {
            id: clientSaleId,
            receiptNumber: `PENDING-${clientSaleId.slice(0, 8)}`,
            items: cart.map((item) => ({
              productId: getProductId(item.product),
              productName: item.product.name,
              quantity: item.quantity,
              unitPrice: item.product.sellingPrice,
              lineTotal: Math.round(
                item.product.sellingPrice *
                  item.quantity *
                  (1 - item.discount / 100)
              ),
            })),
            subtotal: taxableAmount,
            taxAmount: tax,
            total: grandTotal,
            paymentMethod,
            createdAt: new Date().toISOString(),
            syncStatus: "pending",
          };

          await recordLocalSaleWithPayload(localSale, requestPayload);

          setShowConfirmation(false);
          setMessage(
            `Sale saved offline. Reference: ${localSale.receiptNumber}. It will sync when the connection returns. Stock and final totals still require server validation.`
          );
          setMessageIsError(false);
          setCart([]);
          setAmountPaid("0");
          setOverallDiscount("0");
        } catch (localError) {
          setMessage(
            localError instanceof Error
              ? `Local save failed: ${localError.message}`
              : "Local save failed. Keep this checkout open and try again."
          );
          setMessageIsError(true);
        }
      } else {
        setMessage(message);
        setMessageIsError(true);
      }
    } finally {
      setSubmitting(false);
    }
  }
  function printReceipt() {
    window.print();
  }

  return (
    <div className="min-h-full bg-slate-50 text-slate-900">
      <div className="flex min-h-[calc(100vh-80px)] flex-col xl:flex-row print:hidden">
        {/* Live product catalogue */}
        <section className="min-w-0 flex-1 border-b border-slate-200 p-4 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">New sale</h1>
              <p className="mt-1 text-sm text-slate-500">
                Select products to add to the order.
              </p>
            </div>

            <span className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">
              Tax {taxEnabled ? "enabled · 18%" : "disabled"}
            </span>
          </div>

          <label className="flex h-11 items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100">
            <Search size={18} className="shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, SKU or scan barcode"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </label>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-medium transition ${
                  category === item
                    ? "border-sky-200 bg-sky-100 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-sky-300"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          {message && (
            <div
              role="status"
              className={`my-3 rounded-lg border px-3 py-2 text-sm ${
                messageIsError
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {message}
            </div>
          )}

          {loadingProducts ? (
            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Loading products from inventory…
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const quantityInCart =
                  cart.find(
                    (item) => getProductId(item.product) === getProductId(product),
                  )?.quantity ?? 0;

                const unavailable = product.quantity < 1;

                return (
                  <article
                    key={product.id}
                    className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-sky-200 hover:shadow-sm"
                  >
                    <div className="flex h-24 items-center justify-center bg-slate-100 sm:h-28">
                      <Package
                        size={30}
                        strokeWidth={1.7}
                        className="text-slate-400"
                      />
                    </div>

                    <div className="flex flex-1 flex-col p-3">
                      <h2 className="line-clamp-2 min-h-10 text-xs font-semibold leading-5 text-slate-800 sm:text-sm">
                        {product.name}
                      </h2>

                      <p className="mt-1 text-[11px] leading-4 text-slate-500">
                        {product.sku} · {product.quantity} available
                      </p>

                      <p className="mt-3 text-sm font-bold text-slate-900">
                        {money(product.sellingPrice)}
                      </p>

                      <button
                        onClick={() => addToCart(product)}
                        disabled={
                          unavailable || quantityInCart >= product.quantity
                        }
                        className="mt-3 flex items-center justify-end gap-1 text-xs font-semibold text-sky-600 hover:text-sky-800 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        <Plus size={15} />
                        {unavailable
                          ? "Out of stock"
                          : quantityInCart >= product.quantity
                            ? "Stock limit reached"
                            : "Add to cart"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!loadingProducts && filteredProducts.length === 0 && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Package className="mx-auto mb-2 text-slate-400" size={28} />
              <p className="font-semibold">No products found</p>
              <p className="mt-1 text-sm text-slate-500">
                Try another search term or category.
              </p>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">
            Catalogue and stock quantities are loaded from the database.
          </p>
        </section>

        {/* Cart and checkout */}
        <aside className="flex w-full min-w-0 flex-col bg-white xl:w-[440px] xl:shrink-0 2xl:w-[500px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6">
            <h2 className="text-base font-bold">Current sale ({cartCount})</h2>
            <button
              onClick={clearSale}
              disabled={cart.length === 0 || submitting}
              className="text-xs font-semibold text-sky-600 hover:text-sky-800 disabled:text-slate-300"
            >
              Clear
            </button>
          </div>

          <div className="space-y-5 p-4 sm:p-6">
            {/* Customer details: original checkout styling is retained. */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-800">
                  Customer details
                </h3>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Optional for walk-in sales. Details are saved with the receipt.
                </p>
              </div>

              <div className="space-y-3">
                <label
                  htmlFor="pos-customer-name"
                  className="block text-xs font-medium text-slate-600"
                >
                  Customer / company name
                  <input
                    id="pos-customer-name"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Walk-in customer"
                    autoComplete="name"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-sky-500"
                  />
                </label>

                <label
                  htmlFor="pos-customer-type"
                  className="block text-xs font-medium text-slate-600"
                >
                  Customer type
                  <select
                    id="pos-customer-type"
                    value={customerType}
                    onChange={(event) =>
                      setCustomerType(
                        event.target.value as "Customer" | "Company account",
                      )
                    }
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-sky-500"
                  >
                    <option value="Customer">Customer</option>
                    <option value="Company account">Company account</option>
                  </select>
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label
                    htmlFor="pos-customer-phone"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Phone number
                    <input
                      id="pos-customer-phone"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="+256…"
                      autoComplete="tel"
                      className="mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-sky-500"
                    />
                  </label>

                  <label
                    htmlFor="pos-customer-email"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Email
                    <input
                      id="pos-customer-email"
                      type="email"
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                      placeholder="name@example.com"
                      autoComplete="email"
                      className="mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-sky-500"
                    />
                  </label>
                </div>

                <label
                  htmlFor="pos-customer-address"
                  className="block text-xs font-medium text-slate-600"
                >
                  Address
                  <textarea
                    id="pos-customer-address"
                    value={customerAddress}
                    onChange={(event) => setCustomerAddress(event.target.value)}
                    placeholder="Customer or company address"
                    rows={2}
                    autoComplete="street-address"
                    className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-sky-500"
                  />
                </label>
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                <ShoppingCart
                  className="mx-auto mb-3 text-slate-400"
                  size={30}
                />
                <p className="text-sm font-semibold text-slate-700">
                  Your sale is empty
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Choose a product from the catalogue to get started.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {cart.map((item) => (
                  <div key={item.product.id} className="py-4 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold leading-5 text-slate-800">
                          {item.product.name}
                        </h3>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {money(item.product.sellingPrice)} each
                        </p>
                      </div>

                      <button
                        onClick={() =>
                          setCart((current) =>
                            current.filter(
                              (entry) => entry.product.id !== item.product.id,
                            ),
                          )
                        }
                        className="shrink-0 text-[11px] text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex h-8 items-center overflow-hidden rounded-md border border-slate-200">
                        <button
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="h-full px-2.5 text-slate-600 hover:bg-slate-100"
                          aria-label={`Decrease ${item.product.name} quantity`}
                        >
                          <Minus size={13} />
                        </button>

                        <span className="min-w-8 text-center text-xs font-semibold">
                          {item.quantity}
                        </span>

                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          disabled={item.quantity >= item.product.quantity}
                          className="h-full px-2.5 text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
                          aria-label={`Increase ${item.product.name} quantity`}
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <label className="flex items-center gap-1.5 text-[11px] text-sky-600">
                        Line discount
                        <select
                          aria-label={`Discount for ${item.product.name}`}
                          value={item.discount}
                          onChange={(event) =>
                            updateLineDiscount(
                              item.product.id,
                              event.target.value,
                            )
                          }
                          className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700"
                        >
                          {[0, 5, 10, 15, 20, 25, 50, 100].map((value) => (
                            <option key={value} value={value}>
                              {value}%
                            </option>
                          ))}
                        </select>
                      </label>

                      <strong className="ml-auto text-sm">
                        {money(
                          item.product.sellingPrice *
                            item.quantity *
                            (1 - item.discount / 100),
                        )}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t border-dashed border-slate-300 pt-4 text-xs">
              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">
                  {money(subtotal)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 text-slate-600">
                <label htmlFor="pos-overall-discount">
                  Overall discount (UGX)
                </label>
                <input
                  id="pos-overall-discount"
                  type="number"
                  min="0"
                  max={Math.max(0, subtotal - lineDiscountTotal)}
                  value={overallDiscount}
                  onChange={(event) => setOverallDiscount(event.target.value)}
                  className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-right text-xs outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Line discounts</span>
                <span className="font-medium text-red-500">
                  − {money(lineDiscountTotal)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 text-slate-600">
                <label
                  htmlFor="pos-tax"
                  className="flex items-center gap-2"
                >
                  {taxLabel}
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px]">
                    {taxEnabled ? `${taxLabel} · ${taxRate}%` : "Disabled"}
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">
                    {money(tax)}
                  </span>
                  
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-dashed border-slate-300 pt-4">
                <span className="text-sm font-semibold">Grand total</span>
                <strong className="text-xl font-bold tracking-tight">
                  {money(grandTotal)}
                </strong>
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  Payment method
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-sky-500"
                  >
                    <option>Cash</option>
                    <option>Mobile Money</option>
                    <option>Bank transfer</option>
                    <option>Card</option>
                  </select>
                </label>

                <label className="block text-xs font-medium text-slate-600">
                  Amount paid (UGX)
                  <input
                    type="number"
                    min="0"
                    value={amountPaid}
                    onChange={(event) => setAmountPaid(event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-800 outline-none focus:border-sky-500"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3">
                <span className="text-sm font-medium text-slate-700">
                  {balance === 0 && grandTotal > 0
                    ? "Change due"
                    : "Outstanding balance"}
                </span>
                <strong
                  className={`text-sm ${
                    balance > 0 ? "text-slate-900" : "text-emerald-600"
                  }`}
                >
                  {money(balance === 0 ? change : balance)}
                </strong>
              </div>

              {paymentMethod === "Mobile Money" && (
                <p className="flex items-start gap-2 text-[11px] leading-5 text-amber-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  Mobile money must be confirmed manually. No payment
                  integration is connected.
                </p>
              )}

              {balance > 0 && paid > 0 && (
                <p className="text-[11px] text-amber-700">
                  This payment is partial. The remaining amount will be saved
                  as outstanding.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => {
                    clearSale();
                    setMessage("");
                  }}
                  disabled={submitting}
                  className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Trash2 size={16} /> Cancel sale
                </button>

                <button
                  onClick={completeSale}
                  disabled={
                    cart.length === 0 || submitting || loadingProducts
                  }
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-sky-500 px-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Check size={17} /> Complete sale
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Confirmation dialog */}
      {showConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="pos-confirm-title" className="text-lg font-bold">
                  Complete this sale?
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  The server will save the sale and deduct inventory.
                </p>
              </div>

              <button
                onClick={() => setShowConfirmation(false)}
                aria-label="Close confirmation"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Customer</span>
                <span className="text-right font-medium">
                  {customerName.trim() || "Walk-in customer"}
                </span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Items</span>
                <span className="font-medium">{cartCount}</span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Payment method</span>
                <span className="font-medium">{paymentMethod}</span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Amount paid</span>
                <span className="font-medium">{money(paid)}</span>
              </div>

              <div className="flex justify-between gap-3 border-t border-slate-200 pt-3">
                <span className="font-semibold">Grand total</span>
                <strong>{money(grandTotal)}</strong>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-amber-700">
              Once saved, this sale will be permanent. Check the items and
              quantities before confirming.
            </p>

            {messageIsError && message && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {message}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmation(false)}
                disabled={submitting}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Go back
              </button>

              <button
                onClick={() => void confirmSale()}
                disabled={submitting}
                className="rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? "Saving sale…" : "Confirm sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt generated from the saved API response */}
      {savedSale && (
        <section
          id="pos-receipt"
          className="mx-auto my-6 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:my-0 print:max-w-none print:border-0 print:p-0 print:shadow-none"
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                MS Home Security
              </p>
              <h2 className="mt-1 text-2xl font-bold">Sales receipt</h2>
              <p className="mt-1 text-sm text-slate-500">
                Receipt: {savedSale.receiptNumber}
              </p>
              <p className="text-sm text-slate-500">
                Date: {new Date(savedSale.createdAt).toLocaleString("en-UG")}
              </p>
            </div>

            <div className="flex gap-2 print:hidden">
              <button
                onClick={printReceipt}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Printer size={16} /> Print receipt
              </button>

              <button
                onClick={() => setSavedSale(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
            <div>
              <p className="text-slate-500">Customer</p>
              <p className="font-semibold">
                {savedSale.customerName ||
                  savedSale.customer ||
                  "Walk-in customer"}
              </p>
              {savedSale.customerType && (
                <p className="mt-1 text-xs text-slate-500">
                  {savedSale.customerType}
                </p>
              )}
            </div>

            <div>
              <p className="text-slate-500">Payment method</p>
              <p className="font-semibold">{savedSale.paymentMethod}</p>
            </div>

            {savedSale.customerPhone && (
              <div>
                <p className="text-slate-500">Phone</p>
                <p>{savedSale.customerPhone}</p>
              </div>
            )}

            {savedSale.customerEmail && (
              <div>
                <p className="text-slate-500">Email</p>
                <p className="break-words">{savedSale.customerEmail}</p>
              </div>
            )}

            {savedSale.customerAddress && (
              <div className="col-span-2">
                <p className="text-slate-500">Address</p>
                <p>{savedSale.customerAddress}</p>
              </div>
            )}

            <div>
              <p className="text-slate-500">Payment status</p>
              <p className="font-semibold capitalize">
                {savedSale.paymentStatus}
              </p>
            </div>

            <div>
              <p className="text-slate-500">Amount paid</p>
              <p className="font-semibold">{money(savedSale.amountPaid)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-xs text-slate-500">
                  <th className="py-2 pr-3">Item</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Unit price</th>
                  <th className="py-2 pl-2 text-right">Line total</th>
                </tr>
              </thead>

              <tbody>
                {savedSale.items.map((item, index) => (
                  <tr
                    key={`${item.sku}-${index}`}
                    className="border-b border-slate-100"
                  >
                    <td className="py-3 pr-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.sku}
                        {item.discountPercent
                          ? ` · ${item.discountPercent}% discount`
                          : ""}
                      </p>
                    </td>

                    <td className="px-2 py-3 text-right">{item.quantity}</td>
                    <td className="px-2 py-3 text-right">
                      {money(item.unitPrice)}
                    </td>
                    <td className="py-3 pl-2 text-right font-medium">
                      {money(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto mt-5 w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span>{money(savedSale.subtotal)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Line discounts</span>
              <span>− {money(savedSale.lineDiscountTotal)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Overall discount</span>
              <span>− {money(savedSale.overallDiscount)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">
                {savedSale.taxLabel || "Tax"}{" "}
{savedSale.taxEnabled
  ? `(${savedSale.taxRate}%)`
  : "(disabled)"}
              </span>
              <span>{money(savedSale.tax)}</span>
            </div>

            <div className="flex justify-between border-t border-slate-300 pt-3 text-base font-bold">
              <span>Grand total</span>
              <span>{money(savedSale.grandTotal)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Amount paid</span>
              <span>{money(savedSale.amountPaid)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Balance</span>
              <span>{money(savedSale.balance)}</span>
            </div>

            {savedSale.change > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Change</span>
                <span>{money(savedSale.change)}</span>
              </div>
            )}
          </div>

          <p className="mt-8 border-t border-dashed border-slate-300 pt-4 text-center text-xs text-slate-500">
            Thank you for shopping with MS Home Security.
          </p>
        </section>
      )}

      {/* Print only the receipt */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #pos-receipt, #pos-receipt * { visibility: visible !important; }
          #pos-receipt { position: absolute; inset: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}