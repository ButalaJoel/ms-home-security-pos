/**
 * Suppliers and stock receiving.
 * Receiving stock adds quantities, records the cost price and writes the
 * movement into each product's stock history.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PackagePlus, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";
import { apiJson } from "../lib/http";
import { formatDate, formatUGX, todayKey } from "../lib/format";
import type { Product } from "../lib/types";
import {
  EmptyState,
  Modal,
  Notice,
  PageHeader,
  Tabs,
  cardClass,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../components/ui";

type Supplier = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  totalPurchased: number;
  receiptCount: number;
  lastReceived: string | null;
};

type Receipt = {
  id: string;
  number: string;
  supplierName: string;
  supplierInvoice: string;
  receivedDate: string;
  items: { productId: string; name: string; sku: string; quantity: number; unitCost: number; lineTotal: number }[];
  total: number;
  notes: string;
  createdByName: string;
};

type Line = { key: number; productId: string; quantity: string; unitCost: string };
let lineKey = 1;

const emptySupplier = { id: "", name: "", contactPerson: "", phone: "", email: "", address: "", notes: "" };

export default function SuppliersPage() {
  const [tab, setTab] = useState<"receive" | "suppliers" | "history">("receive");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [supplierForm, setSupplierForm] = useState<typeof emptySupplier | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [openReceipt, setOpenReceipt] = useState<Receipt | null>(null);

  // Receive-stock form
  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoice, setSupplierInvoice] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayKey());
  const [notes, setNotes] = useState("");
  const [updateCosts, setUpdateCosts] = useState(true);
  const [lines, setLines] = useState<Line[]>([{ key: lineKey++, productId: "", quantity: "1", unitCost: "" }]);
  const [productFilter, setProductFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSuppliers = useCallback(async () => {
    try {
      const payload = await apiJson<{ suppliers: Supplier[] }>("/api/suppliers");
      setSuppliers(payload.suppliers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load suppliers.");
    }
  }, []);

  const loadReceipts = useCallback(async () => {
    try {
      const query = historySearch.trim() ? `?search=${encodeURIComponent(historySearch.trim())}` : "";
      const payload = await apiJson<{ receipts: Receipt[] }>(`/api/stock-receipts${query}`);
      setReceipts(payload.receipts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load stock receipts.");
    }
  }, [historySearch]);

  const loadProducts = useCallback(() => {
    apiJson<{ products: Product[] }>("/api/products").then((payload) => setProducts(payload.products)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadSuppliers();
    loadProducts();
  }, [loadSuppliers, loadProducts]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReceipts(), 250);
    return () => window.clearTimeout(timer);
  }, [loadReceipts]);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const visibleProducts = useMemo(() => {
    const term = productFilter.trim().toLowerCase();
    return term ? products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(term)) : products;
  }, [products, productFilter]);

  const receiptTotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0);

  function updateLine(key: number, changes: Partial<Line>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...changes };
        // Pre-fill the last known cost price when a product is chosen.
        if (changes.productId && !line.unitCost) {
          const product = productsById.get(changes.productId);
          if (product) next.unitCost = String(product.costPrice || "");
        }
        return next;
      }),
    );
  }

  async function receive() {
    setError("");
    if (!supplierId) return setError("Choose the supplier.");
    const filled = lines.filter((line) => line.productId);
    if (filled.length === 0) return setError("Add at least one product.");
    for (const line of filled) {
      if (!(Number(line.quantity) >= 1) || !Number.isInteger(Number(line.quantity))) return setError("Quantities must be whole numbers of at least 1.");
      if (line.unitCost === "" || Number(line.unitCost) < 0) return setError("Enter the unit cost for every product (0 if free).");
    }
    setSaving(true);
    try {
      const payload = await apiJson<{ message: string }>("/api/stock-receipts", {
        method: "POST",
        json: {
          supplierId,
          supplierInvoice,
          receivedDate,
          notes,
          updateCostPrices: updateCosts,
          items: filled.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitCost: Number(line.unitCost) })),
        },
      });
      setNotice(payload.message);
      setLines([{ key: lineKey++, productId: "", quantity: "1", unitCost: "" }]);
      setSupplierInvoice("");
      setNotes("");
      loadProducts();
      void loadSuppliers();
      void loadReceipts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not receive the stock.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSupplier() {
    if (!supplierForm) return;
    try {
      const { id, ...body } = supplierForm;
      const payload = id
        ? await apiJson<{ message: string; supplier: Supplier }>(`/api/suppliers/${id}`, { method: "PUT", json: body })
        : await apiJson<{ message: string; supplier: Supplier }>("/api/suppliers", { method: "POST", json: body });
      setNotice(payload.message);
      setSupplierForm(null);
      if (!id) setSupplierId(payload.supplier.id);
      void loadSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the supplier.");
    }
  }

  async function deleteSupplier(supplier: Supplier) {
    if (!window.confirm(`Delete supplier ${supplier.name}?`)) return;
    try {
      await apiJson(`/api/suppliers/${supplier.id}`, { method: "DELETE" });
      setNotice("Supplier deleted.");
      void loadSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the supplier.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Purchasing"
        title="Suppliers & stock in"
        description="Record stock arriving from suppliers with its cost, so profit figures are real."
        actions={<button type="button" className={secondaryButton} onClick={() => setSupplierForm({ ...emptySupplier })}><Plus size={16} /> Add supplier</button>}
      />
      {error && <Notice tone="error" onClose={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice("")}>{notice}</Notice>}

      <Tabs
        tabs={[
          { id: "receive", label: "Receive stock" },
          { id: "suppliers", label: `Suppliers (${suppliers.length})` },
          { id: "history", label: "Receiving history" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "receive" && (
        <section className={`${cardClass} space-y-5 p-5`}>
          {suppliers.length === 0 ? (
            <EmptyState title="Add a supplier first" description="Stock is always received from a supplier." action={<button type="button" className={primaryButton} onClick={() => setSupplierForm({ ...emptySupplier })}><Plus size={16} /> Add supplier</button>} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className={labelClass}>
                  Supplier *
                  <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">Choose…</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </label>
                <label className={labelClass}>Supplier's invoice / delivery no.<input className={inputClass} value={supplierInvoice} onChange={(e) => setSupplierInvoice(e.target.value)} /></label>
                <label className={labelClass}>Date received<input className={inputClass} type="date" max={todayKey()} value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} /></label>
              </div>

              <div>
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                  <h3 className="font-semibold text-slate-900">Products received</h3>
                  <div className="relative sm:w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={productFilter} onChange={(e) => setProductFilter(e.target.value)} placeholder="Filter product list" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-400" />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {lines.map((line) => {
                    const product = productsById.get(line.productId);
                    return (
                      <div key={line.key} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <label className={`${labelClass} col-span-12 sm:col-span-6`}>
                          Product
                          <select className={inputClass} value={line.productId} onChange={(e) => updateLine(line.key, { productId: e.target.value })}>
                            <option value="">Choose a product…</option>
                            {visibleProducts.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.sku}) — in stock {option.quantity}</option>)}
                            {product && !visibleProducts.includes(product) && <option value={product.id}>{product.name}</option>}
                          </select>
                        </label>
                        <label className={`${labelClass} col-span-4 sm:col-span-2`}>Qty<input className={inputClass} type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} /></label>
                        <label className={`${labelClass} col-span-6 sm:col-span-3`}>Unit cost (UGX)<input className={inputClass} type="number" min={0} value={line.unitCost} onChange={(e) => updateLine(line.key, { unitCost: e.target.value })} /></label>
                        <div className="col-span-2 flex items-end justify-end sm:col-span-1">
                          <button type="button" aria-label="Remove line" onClick={() => setLines((current) => (current.length > 1 ? current.filter((item) => item.key !== line.key) : current))} className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={17} /></button>
                        </div>
                        {product && <p className="col-span-12 text-xs text-slate-500">Stock {product.quantity} → <b>{product.quantity + (Number(line.quantity) || 0)}</b> · selling price {formatUGX(product.sellingPrice)}</p>}
                      </div>
                    );
                  })}
                </div>
                <button type="button" className={`${secondaryButton} mt-3`} onClick={() => setLines((current) => [...current, { key: lineKey++, productId: "", quantity: "1", unitCost: "" }])}>
                  <Plus size={16} /> Add another product
                </button>
              </div>

              <label className={labelClass}>Notes<input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={updateCosts} onChange={(e) => setUpdateCosts(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Update each product's cost price to this unit cost
              </label>
              <div className="flex flex-col items-start justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                <p className="text-sm text-slate-600">Total cost: <b className="text-slate-900">{formatUGX(receiptTotal)}</b></p>
                <button type="button" className={primaryButton} disabled={saving} onClick={() => void receive()}>
                  <PackagePlus size={17} /> {saving ? "Saving…" : "Receive stock"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "suppliers" && (
        <div className={`${cardClass} overflow-hidden`}>
          {suppliers.length === 0 ? (
            <EmptyState title="No suppliers yet" action={<button type="button" className={primaryButton} onClick={() => setSupplierForm({ ...emptySupplier })}><Plus size={16} /> Add supplier</button>} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {suppliers.map((supplier) => (
                <li key={supplier.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Truck size={20} className="text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{supplier.name}</span>
                    <span className="block text-xs text-slate-500">{[supplier.contactPerson, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "No contact details"}</span>
                  </span>
                  <span className="text-right text-xs text-slate-500">
                    <b className="block text-sm text-slate-800">{formatUGX(supplier.totalPurchased)}</b>
                    {supplier.receiptCount} delivery(ies){supplier.lastReceived ? ` · last ${formatDate(supplier.lastReceived)}` : ""}
                  </span>
                  <button type="button" title="Edit" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setSupplierForm({ id: supplier.id, name: supplier.name, contactPerson: supplier.contactPerson, phone: supplier.phone, email: supplier.email, address: supplier.address, notes: supplier.notes })}><Pencil size={16} /></button>
                  {supplier.receiptCount === 0 && <button type="button" title="Delete" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => void deleteSupplier(supplier)}><Trash2 size={16} /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Search GRN number, supplier, invoice or product" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-sky-400" />
          </div>
          <div className={`${cardClass} overflow-hidden`}>
            {receipts.length === 0 ? (
              <EmptyState title="No stock received yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {receipts.map((receipt) => (
                  <li key={receipt.id}>
                    <button type="button" onClick={() => setOpenReceipt(receipt)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50">
                      <span>
                        <span className="font-semibold text-sky-700">{receipt.number}</span>
                        <span className="ml-2 text-sm text-slate-700">{receipt.supplierName}</span>
                        <span className="block text-xs text-slate-500">{formatDate(receipt.receivedDate)} · {receipt.items.length} product(s){receipt.supplierInvoice ? ` · inv ${receipt.supplierInvoice}` : ""} · by {receipt.createdByName}</span>
                      </span>
                      <b>{formatUGX(receipt.total)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {supplierForm && (
        <Modal
          title={supplierForm.id ? "Edit supplier" : "Add supplier"}
          onClose={() => setSupplierForm(null)}
          footer={
            <>
              <button type="button" className={secondaryButton} onClick={() => setSupplierForm(null)}>Cancel</button>
              <button type="button" className={primaryButton} onClick={() => void saveSupplier()}>Save supplier</button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>Supplier name *<input className={inputClass} value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></label>
            <label className={labelClass}>Contact person<input className={inputClass} value={supplierForm.contactPerson} onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} /></label>
            <label className={labelClass}>Phone<input className={inputClass} value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} inputMode="tel" /></label>
            <label className={labelClass}>Email<input className={inputClass} value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} inputMode="email" /></label>
            <label className={labelClass}>Address<input className={inputClass} value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></label>
            <label className={`${labelClass} sm:col-span-2`}>Notes<textarea className={`${inputClass} min-h-16`} value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></label>
          </div>
        </Modal>
      )}

      {openReceipt && (
        <Modal title={openReceipt.number} description={`${openReceipt.supplierName} · ${formatDate(openReceipt.receivedDate)}`} onClose={() => setOpenReceipt(null)} footer={<button type="button" className={secondaryButton} onClick={() => setOpenReceipt(null)}>Close</button>}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Product</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit cost</th><th className="py-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {openReceipt.items.map((item) => (
                <tr key={item.productId}><td className="py-2">{item.name}<span className="block text-xs text-slate-500">{item.sku}</span></td><td className="py-2 text-right">{item.quantity}</td><td className="py-2 text-right">{formatUGX(item.unitCost)}</td><td className="py-2 text-right font-semibold">{formatUGX(item.lineTotal)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-right font-bold">{formatUGX(openReceipt.total)}</p>
          {openReceipt.notes && <p className="mt-2 text-sm text-slate-600">{openReceipt.notes}</p>}
          <p className="mt-2 text-xs text-slate-500">Recorded by {openReceipt.createdByName}{openReceipt.supplierInvoice ? ` · supplier invoice ${openReceipt.supplierInvoice}` : ""}</p>
        </Modal>
      )}
    </div>
  );
}
