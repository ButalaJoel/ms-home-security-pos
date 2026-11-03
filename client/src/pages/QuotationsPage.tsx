/**
 * Quotations: create, save, reopen, edit, duplicate, print, send by
 * WhatsApp/email, track status and convert an accepted quotation into a sale.
 *
 * Numbers (QUO-2026-0001 …) are assigned by the server when a quotation is
 * first saved and never repeat.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  FileText,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { apiJson } from "../lib/http";
import { formatDate, formatUGX } from "../lib/format";
import { quotationHtml, settingText } from "../lib/documents";
import { printHtml } from "../lib/share";
import { useSettings } from "../lib/useSettings";
import { PAYMENT_METHODS, type Customer, type PaymentMethod, type Product } from "../lib/types";
import ShareDialog from "../components/ShareDialog";
import {
  EmptyState,
  Modal,
  Notice,
  PageHeader,
  StatusBadge,
  cardClass,
  dangerButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../components/ui";

const STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired", "Converted"] as const;
type Status = (typeof STATUSES)[number];

type QuoteItem = {
  key: number;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
};

type Quotation = {
  id: string;
  number: string;
  status: Status;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  items: { productId: string | null; description: string; sku?: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  taxEnabled: boolean;
  taxLabel: string;
  taxRate: number;
  tax: number;
  grandTotal: number;
  validDays: number;
  validUntil: string;
  notes: string;
  terms?: string;
  saleId: string | null;
  saleReference: string;
  createdByName?: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
};

type Draft = {
  id: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  items: QuoteItem[];
  discount: string;
  taxEnabled: boolean;
  validDays: string;
  notes: string;
  terms: string;
};

let itemKey = 1;
const blankItem = (): QuoteItem => ({ key: itemKey++, productId: null, description: "", quantity: 1, unitPrice: 0 });

function draftFrom(quote: Quotation | null, settings: Record<string, unknown>): Draft {
  if (!quote) {
    return {
      id: null,
      customerId: null,
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      customerAddress: "",
      items: [blankItem()],
      discount: "0",
      taxEnabled: false,
      validDays: settingText(settings, "quotationValidityDays", "30"),
      notes: "",
      terms: settingText(settings, "termsAndConditions"),
    };
  }
  return {
    id: quote.id,
    customerId: quote.customerId,
    customerName: quote.customerName,
    customerPhone: quote.customerPhone ?? "",
    customerEmail: quote.customerEmail ?? "",
    customerAddress: quote.customerAddress ?? "",
    items: quote.items.map((item) => ({ key: itemKey++, productId: item.productId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
    discount: String(quote.discount ?? 0),
    taxEnabled: quote.taxEnabled,
    validDays: String(quote.validDays ?? 30),
    notes: quote.notes ?? "",
    terms: quote.terms ?? "",
  };
}

function configuredTaxRate(settings: Record<string, unknown>): number {
  const rate = Number(settings.taxRate);
  return Number.isFinite(rate) && rate > 0 ? rate : 18;
}

export default function QuotationsPage() {
  const settings = useSettings();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [view, setView] = useState<"list" | "edit" | "view">("list");
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | Status>("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [current, setCurrent] = useState<Quotation | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(null, {}));
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Quotation | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  const taxRate = configuredTaxRate(settings);
  const taxLabel = settingText(settings, "taxLabel", "Tax");

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (statusFilter) query.set("status", statusFilter);
      const payload = await apiJson<{ quotations: Quotation[] }>(`/api/quotations?${query}`);
      setQuotes(payload.quotations);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quotations.");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQuotes(), 250);
    return () => window.clearTimeout(timer);
  }, [loadQuotes]);

  // Products and customers for the editor.
  useEffect(() => {
    apiJson<{ products: Product[] }>("/api/products")
      .then((payload) => setProducts(payload.products))
      .catch(() => undefined);
    apiJson<{ customers: Customer[] }>("/api/customers?limit=1000")
      .then((payload) => setCustomers(payload.customers))
      .catch(() => undefined);
  }, []);

  const openQuote = useCallback(async (id: string, mode: "view" | "edit" = "view") => {
    try {
      const payload = await apiJson<{ quotation: Quotation }>(`/api/quotations/${id}`);
      setCurrent(payload.quotation);
      if (mode === "edit") setDraft(draftFrom(payload.quotation, settings));
      setView(mode);
      setError("");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the quotation.");
    }
  }, [settings]);

  // Deep links: /quotations?new=1 or /quotations?open=<id>
  useEffect(() => {
    if (params.get("new")) {
      setCurrent(null);
      setDraft(draftFrom(null, settings));
      setView("edit");
      setParams({}, { replace: true });
    } else if (params.get("open")) {
      void openQuote(params.get("open")!);
      setParams({}, { replace: true });
    }
  }, [params, setParams, settings, openQuote]);

  function startNew() {
    setCurrent(null);
    setDraft(draftFrom(null, settings));
    setSuccess("");
    setError("");
    setView("edit");
  }

  // ---------------- Editor calculations ----------------
  const validItems = draft.items.filter((item) => item.description.trim() && item.quantity > 0);
  const subtotal = validItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, Number(draft.discount) || 0));
  const tax = draft.taxEnabled ? Math.round(((subtotal - discountAmount) * taxRate) / 100) : 0;
  const grandTotal = subtotal - discountAmount + tax;

  const productMatches = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter((product) => `${product.name} ${product.sku} ${product.category} ${product.brand ?? ""}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [productSearch, products]);

  const customerMatches = useMemo(() => {
    const term = draft.customerName.trim().toLowerCase();
    if (!term || !customerSearchOpen) return [];
    return customers.filter((customer) => `${customer.name} ${customer.phone ?? ""}`.toLowerCase().includes(term)).slice(0, 6);
  }, [customers, draft.customerName, customerSearchOpen]);

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((currentDraft) => ({ ...currentDraft, [key]: value }));
  }

  function updateItem(key: number, changes: Partial<QuoteItem>) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      items: currentDraft.items.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    }));
  }

  function addProduct(product: Product) {
    setDraft((currentDraft) => {
      const existing = currentDraft.items.find((item) => item.productId === product.id);
      if (existing) {
        return { ...currentDraft, items: currentDraft.items.map((item) => (item.key === existing.key ? { ...item, quantity: item.quantity + 1 } : item)) };
      }
      const items = currentDraft.items.filter((item) => item.description.trim() || item.productId);
      return {
        ...currentDraft,
        items: [...items, { key: itemKey++, productId: product.id, description: product.name, quantity: 1, unitPrice: product.sellingPrice }],
      };
    });
    setProductSearch("");
  }

  function pickCustomer(customer: Customer) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone ?? currentDraft.customerPhone,
      customerEmail: customer.email ?? currentDraft.customerEmail,
      customerAddress: customer.address ?? currentDraft.customerAddress,
    }));
    setCustomerSearchOpen(false);
  }

  async function save(markSent = false) {
    if (!draft.customerName.trim()) return setError("Enter the customer or business name.");
    if (validItems.length === 0) return setError("Add at least one item with a description.");
    setSaving(true);
    setError("");
    try {
      const body = {
        customerId: draft.customerId,
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        customerEmail: draft.customerEmail,
        customerAddress: draft.customerAddress,
        items: validItems.map((item) => ({ productId: item.productId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
        discount: discountAmount,
        taxEnabled: draft.taxEnabled,
        taxRate,
        taxLabel,
        validDays: Number(draft.validDays) || 30,
        notes: draft.notes,
        terms: draft.terms,
        status: markSent ? "Sent" : undefined,
      };
      const payload = draft.id
        ? await apiJson<{ quotation: Quotation; message: string }>(`/api/quotations/${draft.id}`, { method: "PUT", json: body })
        : await apiJson<{ quotation: Quotation; message: string }>("/api/quotations", { method: "POST", json: body });
      setCurrent(payload.quotation);
      setSuccess(payload.message);
      setView("view");
      if (markSent) setSharing(true);
      void loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the quotation.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(quote: Quotation, status: Status) {
    try {
      const payload = await apiJson<{ quotation: Quotation }>(`/api/quotations/${quote.id}/status`, { method: "PATCH", json: { status } });
      setCurrent((existing) => (existing?.id === quote.id ? { ...existing, ...payload.quotation } : existing));
      setSuccess(`${quote.number} marked as ${status}.`);
      void loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the status.");
    }
  }

  async function duplicate(quote: Quotation) {
    try {
      const payload = await apiJson<{ quotation: Quotation; message: string }>(`/api/quotations/${quote.id}/duplicate`, { method: "POST" });
      setSuccess(payload.message);
      await openQuote(payload.quotation.id, "edit");
      void loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate the quotation.");
    }
  }

  async function remove(quote: Quotation) {
    try {
      await apiJson(`/api/quotations/${quote.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      setSuccess(`${quote.number} deleted.`);
      if (current?.id === quote.id) {
        setCurrent(null);
        setView("list");
      }
      void loadQuotes();
    } catch (err) {
      setConfirmDelete(null);
      setError(err instanceof Error ? err.message : "Could not delete the quotation.");
    }
  }

  const currentHtml = useMemo(
    () => (current ? quotationHtml({ ...current, taxLabel: current.taxLabel || taxLabel }, settings) : ""),
    [current, settings, taxLabel],
  );

  const shareMessage = current
    ? `Hello ${current.customerName},\n\nPlease find attached quotation ${current.number} from ${settingText(settings, "businessName", "MS Home Security Solutions")} for ${formatUGX(current.grandTotal)}, valid until ${formatDate(current.validUntil)}.\n\nThank you.`
    : "";

  // ---------------- Render ----------------
  const notices = (
    <>
      {error && <Notice tone="error" onClose={() => setError("")}>{error}</Notice>}
      {success && <Notice tone="success" onClose={() => setSuccess("")}>{success}</Notice>}
    </>
  );

  if (view === "edit") {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Quotations"
          title={draft.id ? `Edit ${current?.number ?? "quotation"}` : "New quotation"}
          description={draft.id ? "Changes are saved to the same quotation number." : "The quotation number is assigned when you save."}
          actions={
            <button type="button" className={secondaryButton} onClick={() => setView(current ? "view" : "list")}>
              <ArrowLeft size={16} /> Back
            </button>
          }
        />
        {notices}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.8fr)]">
          <div className="space-y-5">
            <section className={`${cardClass} p-5`}>
              <h3 className="font-semibold text-slate-900">Customer</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="relative sm:col-span-2">
                  <label className={labelClass}>
                    Customer or business name *
                    <input
                      className={inputClass}
                      value={draft.customerName}
                      onChange={(e) => {
                        updateDraft("customerName", e.target.value);
                        updateDraft("customerId", null);
                        setCustomerSearchOpen(true);
                      }}
                      onBlur={() => window.setTimeout(() => setCustomerSearchOpen(false), 150)}
                      placeholder="Type a name — saved customers will appear"
                      autoComplete="off"
                    />
                  </label>
                  {customerMatches.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                      {customerMatches.map((customer) => (
                        <button key={customer.id} type="button" onMouseDown={() => pickCustomer(customer)} className="block w-full px-3 py-2 text-left text-sm hover:bg-sky-50">
                          <span className="font-medium text-slate-900">{customer.name}</span>
                          {customer.phone && <span className="ml-2 text-xs text-slate-500">{customer.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <label className={labelClass}>
                  Phone (for WhatsApp)
                  <input className={inputClass} value={draft.customerPhone} onChange={(e) => updateDraft("customerPhone", e.target.value)} inputMode="tel" />
                </label>
                <label className={labelClass}>
                  Email
                  <input className={inputClass} value={draft.customerEmail} onChange={(e) => updateDraft("customerEmail", e.target.value)} inputMode="email" />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Address / site location
                  <input className={inputClass} value={draft.customerAddress} onChange={(e) => updateDraft("customerAddress", e.target.value)} />
                </label>
              </div>
            </section>

            <section className={`${cardClass} p-5`}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-semibold text-slate-900">Items</h3>
                  <p className="text-xs text-slate-500">Search your products, or add a custom line for labour, cabling or services.</p>
                </div>
                <button type="button" className={secondaryButton} onClick={() => updateDraft("items", [...draft.items, blankItem()])}>
                  <Plus size={16} /> Custom line
                </button>
              </div>

              <div className="relative mt-4">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={products.length ? "Search products to add…" : "No products yet — add custom lines"}
                  className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
                {productMatches.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    {productMatches.map((product) => (
                      <button key={product.id} type="button" onClick={() => addProduct(product)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-sky-50">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-100" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{product.name}</span>
                          <span className="text-xs text-slate-500">{product.sku} · In stock: {product.quantity}</span>
                        </span>
                        <span className="text-sm font-semibold text-slate-700">{formatUGX(product.sellingPrice)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {draft.items.map((item) => (
                  <div key={item.key} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <label className={`${labelClass} col-span-12 sm:col-span-6`}>
                      Description {item.productId && <span className="font-normal text-sky-600">· from products</span>}
                      <input className={inputClass} value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} />
                    </label>
                    <label className={`${labelClass} col-span-4 sm:col-span-2`}>
                      Qty
                      <input className={inputClass} type="number" min={1} step={1} value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                    </label>
                    <label className={`${labelClass} col-span-5 sm:col-span-3`}>
                      Unit price (UGX)
                      <input className={inputClass} type="number" min={0} step={500} value={item.unitPrice} onChange={(e) => updateItem(item.key, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} />
                    </label>
                    <div className="col-span-3 flex items-end justify-end sm:col-span-1">
                      <button
                        type="button"
                        aria-label="Remove line"
                        onClick={() => updateDraft("items", draft.items.length > 1 ? draft.items.filter((line) => line.key !== item.key) : [blankItem()])}
                        className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    {(() => {
                      const product = item.productId ? products.find((entry) => entry.id === item.productId) : undefined;
                      return product?.costPrice && item.unitPrice < product.costPrice ? (
                        <p className="col-span-12 text-xs font-semibold text-red-600">Below cost price ({formatUGX(product.costPrice)}). It cannot be sold at this price.</p>
                      ) : null;
                    })()}
                    <p className="col-span-12 text-right text-xs text-slate-500">Line total: <b className="text-slate-800">{formatUGX(item.quantity * item.unitPrice)}</b></p>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${cardClass} p-5`}>
              <h3 className="font-semibold text-slate-900">Notes & terms</h3>
              <div className="mt-4 space-y-4">
                <label className={labelClass}>
                  Notes for the customer
                  <textarea className={`${inputClass} min-h-20`} value={draft.notes} onChange={(e) => updateDraft("notes", e.target.value)} placeholder="e.g. Installation within 3 working days of deposit." />
                </label>
                <label className={labelClass}>
                  Terms and conditions
                  <textarea className={`${inputClass} min-h-40`} value={draft.terms} onChange={(e) => updateDraft("terms", e.target.value)} />
                </label>
              </div>
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <section className={`${cardClass} p-5`}>
              <h3 className="font-semibold text-slate-900">Summary</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><b>{formatUGX(subtotal)}</b></div>
                <label className={labelClass}>
                  Discount (UGX)
                  <input className={inputClass} type="number" min={0} step={1000} value={draft.discount} onChange={(e) => updateDraft("discount", e.target.value)} />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={draft.taxEnabled} onChange={(e) => updateDraft("taxEnabled", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Add {taxLabel} ({taxRate}%)
                </label>
                {draft.taxEnabled && <div className="flex justify-between"><span className="text-slate-500">{taxLabel}</span><b>{formatUGX(tax)}</b></div>}
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base"><span className="font-semibold">Total</span><b className="text-sky-700">{formatUGX(grandTotal)}</b></div>
                <label className={labelClass}>
                  Valid for (days)
                  <input className={inputClass} type="number" min={1} max={365} value={draft.validDays} onChange={(e) => updateDraft("validDays", e.target.value)} />
                </label>
              </div>
              <div className="mt-5 grid gap-2">
                <button type="button" className={primaryButton} disabled={saving} onClick={() => void save(false)}>
                  <Save size={16} /> {saving ? "Saving…" : "Save quotation"}
                </button>
                <button type="button" className={secondaryButton} disabled={saving} onClick={() => void save(true)}>
                  <Send size={16} /> Save & send
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  if (view === "view" && current) {
    const locked = current.status === "Converted";
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Quotations"
          title={current.number}
          description={`${current.customerName} · ${formatUGX(current.grandTotal)} · created ${formatDate(current.createdAt)}${current.createdByName ? ` by ${current.createdByName}` : ""}`}
          actions={
            <button type="button" className={secondaryButton} onClick={() => { setView("list"); setCurrent(null); }}>
              <ArrowLeft size={16} /> All quotations
            </button>
          }
        />
        {notices}

        <div className={`${cardClass} flex flex-wrap items-center gap-2 p-3`}>
          <StatusBadge status={current.status} />
          {!locked && (
            <select
              aria-label="Change status"
              value={current.status}
              onChange={(e) => void changeStatus(current, e.target.value as Status)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
            >
              {STATUSES.filter((status) => status !== "Converted").map((status) => (
                <option key={status} value={status}>Mark as {status}</option>
              ))}
            </select>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {!locked && (
              <button type="button" className={secondaryButton} onClick={() => { setDraft(draftFrom(current, settings)); setView("edit"); }}>
                <Pencil size={16} /> Edit
              </button>
            )}
            <button type="button" className={secondaryButton} onClick={() => printHtml(currentHtml)}>
              <Printer size={16} /> Print / PDF
            </button>
            <button type="button" className={secondaryButton} onClick={() => setSharing(true)}>
              <Send size={16} /> Send
            </button>
            <button type="button" className={secondaryButton} onClick={() => void duplicate(current)}>
              <Copy size={16} /> Duplicate
            </button>
            {!locked && current.status !== "Rejected" && (
              <button type="button" className={primaryButton} onClick={() => setConverting(true)}>
                <ShoppingCart size={16} /> Convert to sale
              </button>
            )}
          </div>
        </div>

        {locked && (
          <Notice tone="info">
            Converted to sale <b>{current.saleReference}</b>. It can no longer be edited. Duplicate it to quote again.{" "}
            <button type="button" className="font-semibold underline" onClick={() => navigate("/documents")}>Open invoices & receipts</button>
          </Notice>
        )}

        <div className={`${cardClass} overflow-hidden`}>
          <iframe title={`Quotation ${current.number}`} srcDoc={currentHtml} className="h-[80vh] w-full bg-white" />
        </div>

        {sharing && (
          <ShareDialog
            title={`quotation ${current.number}`}
            html={currentHtml}
            fileName={`${current.number}.pdf`}
            message={shareMessage}
            emailSubject={`Quotation ${current.number} — ${settingText(settings, "businessName", "MS Home Security Solutions")}`}
            phone={current.customerPhone}
            email={current.customerEmail}
            onClose={() => setSharing(false)}
            onSent={() => {
              if (current.status === "Draft") void changeStatus(current, "Sent");
            }}
          />
        )}

        {converting && (
          <ConvertDialog
            quote={current}
            products={products}
            settings={settings}
            onClose={() => setConverting(false)}
            onDone={(quotation, message) => {
              setConverting(false);
              setCurrent(quotation);
              setSuccess(message);
              void loadQuotes();
              apiJson<{ products: Product[] }>("/api/products").then((payload) => setProducts(payload.products)).catch(() => undefined);
            }}
          />
        )}
      </div>
    );
  }

  // ---------------- List ----------------
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales documents"
        title="Quotations"
        description="Every saved quotation, its status, and what it became."
        actions={
          <button type="button" className={primaryButton} onClick={startNew}>
            <Plus size={17} /> New quotation
          </button>
        }
      />
      {notices}

      <div className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row`}>
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by number, customer or phone" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-sky-400" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | Status)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        {loading && quotes.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">Loading quotations…</p>
        ) : quotes.length === 0 ? (
          <EmptyState
            title={search || statusFilter ? "No quotations match" : "No quotations yet"}
            description={search || statusFilter ? "Try a different search or status." : "Create your first quotation. It will be saved here with its own number."}
            action={!search && !statusFilter ? <button type="button" className={primaryButton} onClick={startNew}><Plus size={16} /> New quotation</button> : undefined}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Number</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Valid until</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quotes.map((quote) => (
                    <tr key={quote.id} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-3">
                        <button type="button" className="font-semibold text-sky-700 hover:underline" onClick={() => void openQuote(quote.id)}>{quote.number}</button>
                        {quote.saleReference && <p className="text-xs text-violet-600">Sale {quote.saleReference}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{quote.customerName}</p>
                        {quote.customerPhone && <p className="text-xs text-slate-500">{quote.customerPhone}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(quote.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(quote.validUntil)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatUGX(quote.grandTotal)}</td>
                      <td className="px-4 py-3"><StatusBadge status={quote.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button type="button" title="Open" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => void openQuote(quote.id)}><FileText size={16} /></button>
                          {quote.status !== "Converted" && <button type="button" title="Edit" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => void openQuote(quote.id, "edit")}><Pencil size={16} /></button>}
                          <button type="button" title="Duplicate" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => void duplicate(quote)}><Copy size={16} /></button>
                          {quote.status !== "Converted" && <button type="button" title="Delete" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setConfirmDelete(quote)}><Trash2 size={16} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden">
              {quotes.map((quote) => (
                <li key={quote.id}>
                  <button type="button" onClick={() => void openQuote(quote.id)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
                    <span className="min-w-0">
                      <span className="block font-semibold text-sky-700">{quote.number}</span>
                      <span className="block truncate text-sm text-slate-800">{quote.customerName}</span>
                      <span className="text-xs text-slate-500">{formatDate(quote.createdAt)} · valid to {formatDate(quote.validUntil)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold">{formatUGX(quote.grandTotal)}</span>
                      <StatusBadge status={quote.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {confirmDelete && (
        <Modal
          title={`Delete ${confirmDelete.number}?`}
          description="This removes the quotation permanently. Its number will not be reused."
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(null)}>Keep it</button>
              <button type="button" className={dangerButton} onClick={() => void remove(confirmDelete)}><Trash2 size={16} /> Delete</button>
            </>
          }
        >
          <p className="text-sm text-slate-600">{confirmDelete.customerName} · {formatUGX(confirmDelete.grandTotal)}</p>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convert an accepted quotation into a POS sale.
// The sale goes through the normal POST /api/sales (stock checked and
// deducted there). The request ID "quote-<id>" makes a retry return the same
// sale instead of creating a second one.
// ---------------------------------------------------------------------------

function ConvertDialog({
  quote,
  products,
  settings,
  onClose,
  onDone,
}: {
  quote: Quotation;
  products: Product[];
  settings: Record<string, unknown>;
  onClose: () => void;
  onDone: (quotation: Quotation, message: string) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [amountPaid, setAmountPaid] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  // Build the sale lines and collect anything worth warning about.
  const plan = useMemo(() => {
    const lines: Record<string, unknown>[] = [];
    const warnings: string[] = [];
    const blockers: string[] = [];
    for (const item of quote.items) {
      const product = item.productId ? byId.get(item.productId) : undefined;
      if (!product) {
        lines.push({ type: "custom", customType: "Other", name: item.description, unitPrice: item.unitPrice, quantity: item.quantity, discount: 0 });
        if (item.productId) warnings.push(`"${item.description}" is no longer in Products, so it will be sold as a custom line (no stock deducted).`);
        continue;
      }
      if (product.quantity < item.quantity) {
        blockers.push(`${product.name}: quotation needs ${item.quantity}, only ${product.quantity} in stock.`);
      }
      if (product.costPrice && item.unitPrice < product.costPrice) {
        blockers.push(`${product.name}: quoted at ${formatUGX(item.unitPrice)}, below its cost price of ${formatUGX(product.costPrice)}. Edit the quotation first.`);
      }
      // The sale keeps the price agreed on the quotation.
      lines.push({ type: "product", productId: product.id, quantity: item.quantity, discount: 0, unitPrice: item.unitPrice });
    }
    return { lines, warnings, blockers };
  }, [quote.items, byId]);

  const settingsTax = settings.taxEnabled === true;
  const taxMismatch = settingsTax !== quote.taxEnabled;

  async function convert() {
    const paid = Number(amountPaid);
    if (!Number.isFinite(paid) || paid < 0) return setError("Enter the amount paid now (0 if nothing yet).");
    setBusy(true);
    setError("");
    try {
      const salePayload = await apiJson<{ sale: { id: string; receiptNumber: string } }>("/api/sales", {
        method: "POST",
        json: {
          clientSaleId: `quote-${quote.id}`,
          customer: quote.customerName,
          customerName: quote.customerName,
          customerPhone: quote.customerPhone,
          customerEmail: quote.customerEmail,
          customerAddress: quote.customerAddress,
          ...(quote.customerId ? { customerId: quote.customerId } : {}),
          items: plan.lines,
          paymentMethod: method,
          amountPaid: paid,
          overallDiscount: quote.discount,
        },
      });
      const linked = await apiJson<{ quotation: Quotation; message: string }>(`/api/quotations/${quote.id}/converted`, {
        method: "PATCH",
        json: { saleId: salePayload.sale.id },
      });
      onDone(linked.quotation, linked.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert the quotation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Convert ${quote.number} to a sale`}
      description={`${quote.customerName} · quotation total ${formatUGX(quote.grandTotal)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryButton} disabled={busy || plan.blockers.length > 0} onClick={() => void convert()}>
            <CheckCircle2 size={16} /> {busy ? "Creating sale…" : "Create sale"}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && <Notice tone="error">{error}</Notice>}
        {plan.blockers.length > 0 && (
          <Notice tone="error">
            <b>Not enough stock.</b> Receive or adjust stock first:
            <ul className="mt-1 list-disc pl-5">{plan.blockers.map((line) => <li key={line}>{line}</li>)}</ul>
          </Notice>
        )}
        {plan.warnings.map((line) => <Notice key={line} tone="info">{line}</Notice>)}
        {taxMismatch && (
          <Notice tone="info">
            The sale's tax follows Settings ({settingsTax ? "tax ON" : "tax OFF"}), which differs from this quotation, so the sale total may differ slightly.
          </Notice>
        )}
        <p className="text-slate-600">Stock for products on this quotation will be deducted, and the sale will appear in Sales History with its invoice and receipt.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Payment method
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className={labelClass}>
            Amount paid now (UGX)
            <input className={inputClass} type="number" min={0} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => setAmountPaid(String(quote.grandTotal))}>Paid in full</button>
          <button type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => setAmountPaid(String(Math.round(quote.grandTotal * 0.7)))}>70% deposit</button>
          <button type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => setAmountPaid("0")}>Nothing yet</button>
        </div>
        <p className="text-xs text-slate-500">Any balance can be collected later from Sales History → Record payment.</p>
      </div>
    </Modal>
  );
}
