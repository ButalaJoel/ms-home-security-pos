/**
 * Serial numbers & warranties: record which device serial went to which
 * customer, and check a warranty claim in seconds.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { apiJson } from "../lib/http";
import { dateInputValue, formatDate, todayKey } from "../lib/format";
import { settingText } from "../lib/documents";
import { useSettings } from "../lib/useSettings";
import type { Product } from "../lib/types";
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

type Serial = {
  id: string;
  serialNumber: string;
  productId: string | null;
  productName: string;
  customerName: string;
  customerPhone: string;
  saleReference: string;
  installDate: string;
  warrantyMonths: number;
  warrantyEndsAt: string | null;
  warrantyStatus: string;
  notes: string;
  createdByName?: string;
};

type Form = {
  id: string | null;
  serials: string;
  productId: string;
  productName: string;
  customerName: string;
  customerPhone: string;
  saleReference: string;
  installDate: string;
  warrantyMonths: string;
  notes: string;
};

function defaultMonths(settings: Record<string, unknown>): string {
  const text = settingText(settings, "warrantyDuration", "6 months").toLowerCase();
  const number = Number(text.match(/\d+/)?.[0] ?? 6);
  return String(text.includes("year") ? number * 12 : number);
}

export default function WarrantiesPage() {
  const settings = useSettings();
  const [serials, setSerials] = useState<Serial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (status) query.set("status", status);
      const payload = await apiJson<{ serials: Serial[] }>(`/api/serials?${query}`);
      setSerials(payload.serials);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load serial numbers.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    apiJson<{ products: Product[] }>("/api/products").then((payload) => setProducts(payload.products)).catch(() => undefined);
  }, []);

  const serialCount = useMemo(
    () => (form ? form.serials.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean).length : 0),
    [form],
  );

  function newForm(): Form {
    return { id: null, serials: "", productId: "", productName: "", customerName: "", customerPhone: "", saleReference: "", installDate: todayKey(), warrantyMonths: defaultMonths(settings), notes: "" };
  }

  function edit(serial: Serial) {
    setForm({
      id: serial.id,
      serials: serial.serialNumber,
      productId: serial.productId ?? "",
      productName: serial.productName,
      customerName: serial.customerName,
      customerPhone: serial.customerPhone,
      saleReference: serial.saleReference,
      installDate: dateInputValue(serial.installDate),
      warrantyMonths: String(serial.warrantyMonths),
      notes: serial.notes,
    });
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    const list = form.serials.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
    const shared = {
      productId: form.productId || null,
      productName: form.productName,
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      saleReference: form.saleReference,
      installDate: form.installDate,
      warrantyMonths: Number(form.warrantyMonths),
      notes: form.notes,
    };
    try {
      const payload = form.id
        ? await apiJson<{ message: string }>(`/api/serials/${form.id}`, { method: "PUT", json: { ...shared, serialNumber: list[0] ?? "" } })
        : await apiJson<{ message: string }>("/api/serials", { method: "POST", json: { ...shared, serialNumbers: list } });
      setNotice(payload.message);
      setForm(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    if (!window.confirm(`Delete serial ${form.serials}?`)) return;
    try {
      await apiJson(`/api/serials/${form.id}`, { method: "DELETE" });
      setForm(null);
      setNotice("Serial number deleted.");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="After-sales"
        title="Serial numbers & warranties"
        description="Search a serial number to see who bought it and whether it is still under warranty."
        actions={<button type="button" className={primaryButton} onClick={() => setForm(newForm())}><Plus size={17} /> Register serials</button>}
      />
      {error && !form && <Notice tone="error" onClose={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice("")}>{notice}</Notice>}

      <div className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row`}>
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Serial number, customer, phone or product" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-sky-400" autoFocus />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" aria-label="Warranty status">
          <option value="">All warranties</option>
          <option>Active</option>
          <option>Expiring soon</option>
          <option>Expired</option>
        </select>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        {loading && serials.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : serials.length === 0 ? (
          <EmptyState
            title={search ? "No match" : "No serial numbers yet"}
            description={search ? "That serial is not registered. Check for typos (O vs 0, I vs 1)." : "Register serial numbers when you sell or install cameras, DVRs and other devices."}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {serials.map((serial) => (
              <li key={serial.id}>
                <button type="button" onClick={() => edit(serial)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <ShieldCheck size={20} className={serial.warrantyStatus === "Expired" ? "text-slate-300" : "text-emerald-500"} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm font-semibold text-slate-900">{serial.serialNumber}</span>
                    <span className="block truncate text-sm text-slate-600">{serial.productName} · {serial.customerName}{serial.customerPhone ? ` (${serial.customerPhone})` : ""}</span>
                    <span className="text-xs text-slate-500">Sold {formatDate(serial.installDate)} · warranty to {serial.warrantyEndsAt ? formatDate(serial.warrantyEndsAt) : "—"}{serial.saleReference ? ` · ${serial.saleReference}` : ""}</span>
                  </span>
                  <StatusBadge status={serial.warrantyStatus} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {form && (
        <Modal
          title={form.id ? "Edit serial number" : "Register serial numbers"}
          description={form.id ? undefined : "Add several serials at once if they share the same product and customer."}
          onClose={() => setForm(null)}
          footer={
            <>
              {form.id && <button type="button" className={dangerButton} onClick={() => void remove()}><Trash2 size={16} /> Delete</button>}
              <button type="button" className={secondaryButton} onClick={() => setForm(null)}>Cancel</button>
              <button type="button" className={primaryButton} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : form.id ? "Save" : `Register ${serialCount || ""}`}</button>
            </>
          }
        >
          <div className="space-y-4">
            {error && <Notice tone="error">{error}</Notice>}
            <label className={labelClass}>
              {form.id ? "Serial number" : "Serial number(s) — one per line"}
              {form.id ? (
                <input className={`${inputClass} font-mono`} value={form.serials} onChange={(e) => set("serials", e.target.value)} />
              ) : (
                <textarea className={`${inputClass} min-h-24 font-mono`} value={form.serials} onChange={(e) => set("serials", e.target.value)} placeholder={"DS2CE16D0T-001\nDS2CE16D0T-002"} />
              )}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${labelClass} sm:col-span-2`}>
                Product
                <select
                  className={inputClass}
                  value={form.productId}
                  onChange={(e) => {
                    const product = products.find((item) => item.id === e.target.value);
                    set("productId", e.target.value);
                    if (product) set("productName", product.name);
                  }}
                >
                  <option value="">— Type a name below, or pick a product —</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <label className={`${labelClass} sm:col-span-2`}>Product name / model *<input className={inputClass} value={form.productName} onChange={(e) => set("productName", e.target.value)} /></label>
              <label className={labelClass}>Customer *<input className={inputClass} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} /></label>
              <label className={labelClass}>Customer phone<input className={inputClass} value={form.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} inputMode="tel" /></label>
              <label className={labelClass}>Sold / installed on<input className={inputClass} type="date" value={form.installDate} onChange={(e) => set("installDate", e.target.value)} /></label>
              <label className={labelClass}>Warranty (months)<input className={inputClass} type="number" min={0} max={120} value={form.warrantyMonths} onChange={(e) => set("warrantyMonths", e.target.value)} /></label>
              <label className={labelClass}>Sale / receipt no.<input className={inputClass} value={form.saleReference} onChange={(e) => set("saleReference", e.target.value)} placeholder="MS-…" /></label>
              <label className={labelClass}>Notes<input className={inputClass} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
