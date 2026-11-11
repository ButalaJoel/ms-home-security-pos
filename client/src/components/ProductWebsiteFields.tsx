/**
 * "Website details" part of the product form: everything the public website
 * shows beyond the till fields. Kept separate from ProductsPage so the till
 * form stays simple. Extra photos can be added once the product is saved.
 */
import { useState } from "react";
import { ChevronDown, Globe, ImagePlus, Plus, Star, Trash2, Wand2 } from "lucide-react";
import { apiFetch } from "../lib/api";
import { specLabelsFor, typesFor } from "../data/productTypes";

export type SpecRow = { label: string; value: string };

export type WebsiteForm = {
  showOnWebsite: boolean;
  featured: boolean;
  model: string;
  subcategory: string;
  series: string;
  description: string;
  /** One selling point per line. */
  features: string;
  specs: SpecRow[];
};

export const emptyWebsiteForm: WebsiteForm = {
  showOnWebsite: true,
  featured: false,
  model: "",
  subcategory: "",
  series: "",
  description: "",
  features: "",
  specs: [],
};

/** Builds the form state from a product as the API returns it. */
export function websiteFormFrom(item: Record<string, unknown>): WebsiteForm {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    showOnWebsite: item.showOnWebsite !== false,
    featured: item.featured === true,
    model: text(item.model),
    subcategory: text(item.subcategory),
    series: text(item.series),
    description: text(item.description),
    features: Array.isArray(item.features) ? item.features.filter((v) => typeof v === "string").join("\n") : "",
    specs: Array.isArray(item.specs)
      ? item.specs.map((row) => ({ label: text((row as SpecRow)?.label), value: text((row as SpecRow)?.value) }))
      : [],
  };
}

/** The JSON the API expects for these fields. */
export function websitePayload(form: WebsiteForm) {
  return {
    showOnWebsite: form.showOnWebsite,
    featured: form.featured,
    model: form.model.trim(),
    subcategory: form.subcategory.trim(),
    series: form.series.trim(),
    description: form.description.trim(),
    features: form.features.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    // Rows with only a name (from "Use standard specs") are left out until a value is typed.
    specs: form.specs.map((row) => ({ label: row.label.trim(), value: row.value.trim() })).filter((row) => row.label && row.value),
  };
}

const input =
  "mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

type Props = {
  value: WebsiteForm;
  onChange: (next: WebsiteForm) => void;
  category: string;
  /** Saved product id; extra photos need it. */
  productId?: string;
  gallery: string[];
  onGalleryChange: (urls: string[]) => void;
};

export default function ProductWebsiteFields({ value, onChange, category, productId, gallery, onGalleryChange }: Props) {
  const [open, setOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const set = <K extends keyof WebsiteForm>(key: K, next: WebsiteForm[K]) => onChange({ ...value, [key]: next });
  const types = typesFor(category);
  const standard = specLabelsFor(category, value.subcategory);
  const filled = value.specs.filter((row) => row.value.trim()).length;

  function useStandardSpecs() {
    // Keep values already typed; add any standard names that are missing.
    const have = new Set(value.specs.map((row) => row.label.trim().toLowerCase()));
    set("specs", [...value.specs, ...standard.filter((label) => !have.has(label.toLowerCase())).map((label) => ({ label, value: "" }))]);
  }

  async function addPhoto(file: File) {
    if (!productId) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const data = new FormData();
      data.append("photo", file);
      const response = await apiFetch(`/api/products/${productId}/gallery`, { method: "POST", body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || "Upload failed.");
      onGalleryChange(Array.isArray(result.product?.gallery) ? result.product.gallery.map((p: { url: string }) => p.url) : gallery);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto(url: string) {
    if (!productId) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const response = await apiFetch(`/api/products/${productId}/gallery`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || "Could not remove the photo.");
      onGalleryChange(gallery.filter((item) => item !== url));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not remove the photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          <Globe size={18} className="text-sky-500" />
          <span>
            <span className="block text-sm font-semibold text-slate-900">Website details</span>
            <span className="block text-xs text-slate-500">
              {value.showOnWebsite ? "Shown on the website" : "Hidden from the website"}
              {value.model ? ` · ${value.model}` : ""}
              {filled ? ` · ${filled} specs` : ""}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
          <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={value.showOnWebsite} onChange={(e) => set("showOnWebsite", e.target.checked)} className="h-4 w-4 accent-sky-500" />
            Show on the website
          </label>
          <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={value.featured} onChange={(e) => set("featured", e.target.checked)} className="h-4 w-4 accent-sky-500" />
            <Star size={15} className="text-amber-500" /> Featured on the home page
          </label>

          <label className="text-sm font-medium text-slate-700">
            Model number
            <input value={value.model} onChange={(e) => set("model", e.target.value)} className={`${input} font-mono`} placeholder="e.g. DS-2CD2143G2-IU" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Series
            <input value={value.series} onChange={(e) => set("series", e.target.value)} className={input} placeholder="e.g. Pro Series" />
          </label>

          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Type
            <input list="product-types" value={value.subcategory} onChange={(e) => set("subcategory", e.target.value)} className={input} placeholder={types.length ? "Choose or type a type" : "e.g. Network cameras"} />
            <datalist id="product-types">{types.map((type) => <option key={type.name} value={type.name} />)}</datalist>
            <span className="mt-1 block text-xs font-normal text-slate-500">Used for the website's "Type" filter, e.g. Network cameras, NVRs, Handheld detectors.</span>
          </label>

          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Description
            <textarea value={value.description} onChange={(e) => set("description", e.target.value)} rows={3} className={`${input} h-auto py-2`} placeholder="Two or three sentences on what it is and where it's used." />
          </label>

          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Selling points <span className="font-normal text-slate-500">(one per line)</span>
            <textarea value={value.features} onChange={(e) => set("features", e.target.value)} rows={3} className={`${input} h-auto py-2`} placeholder={"Clear colour picture at night\nDetects people and vehicles\nView on your phone"} />
          </label>

          <div className="sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Specifications</p>
              <div className="flex gap-2">
                {standard.length > 0 && (
                  <button type="button" onClick={useStandardSpecs} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100">
                    <Wand2 size={14} /> Use standard specs
                  </button>
                )}
                <button type="button" onClick={() => set("specs", [...value.specs, { label: "", value: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Plus size={14} /> Add row
                </button>
              </div>
            </div>
            {value.specs.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">{standard.length ? 'Press "Use standard specs" to fill in the names for this type.' : "Choose a type above, or add rows yourself."}</p>
            ) : (
              <div className="mt-2 space-y-2">
                {value.specs.map((row, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] gap-2">
                    <input
                      aria-label="Specification name"
                      value={row.label}
                      onChange={(e) => set("specs", value.specs.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)))}
                      className="h-10 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm outline-none focus:border-sky-500"
                      placeholder="Name"
                    />
                    <input
                      aria-label={`${row.label || "Specification"} value`}
                      value={row.value}
                      onChange={(e) => set("specs", value.specs.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)))}
                      className="h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-sky-500"
                      placeholder="Value"
                    />
                    <button type="button" aria-label="Remove row" onClick={() => set("specs", value.specs.filter((_, i) => i !== index))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-slate-500">Rows left without a value are not saved.</p>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-slate-700">Extra photos <span className="font-normal text-slate-500">(website gallery, up to 8)</span></p>
            {!productId ? (
              <p className="mt-1.5 text-xs text-slate-500">Create the product first, then open it again to add extra photos.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {gallery.map((url) => (
                  <div key={url} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button type="button" disabled={photoBusy} onClick={() => void removePhoto(url)} aria-label="Remove photo" className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-600 shadow">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {gallery.length < 8 && (
                  <label className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50 ${photoBusy ? "opacity-50" : ""}`}>
                    <ImagePlus size={20} />
                    {photoBusy ? "Saving…" : "Add"}
                    <input type="file" accept="image/*" className="sr-only" disabled={photoBusy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void addPhoto(file); }} />
                  </label>
                )}
              </div>
            )}
            {photoError && <p className="mt-1.5 text-xs text-red-600">{photoError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
