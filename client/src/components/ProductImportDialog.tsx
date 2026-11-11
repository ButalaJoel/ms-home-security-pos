/**
 * Bulk-add products by pasting rows copied from Excel or Google Sheets.
 * Columns: Name | Category | Selling price | Cost price | Brand | SKU
 * (only the first three are required). Stock always starts at 0.
 * Optional website columns after SKU:
 * Model | Type | Series | Description | Selling points ("a | b") | Specs ("Label: value | Label: value")
 * "Update existing products" fills website details of products that already
 * exist (matched by SKU, else by name) without touching prices or stock.
 */
import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { Modal, Notice, inputClass, labelClass, primaryButton, secondaryButton } from "./ui";
import { ApiError, apiJson } from "../lib/http";
import { formatUGX } from "../lib/format";

type Row = {
  name: string; category: string; sellingPrice: number; costPrice: number; brand: string; sku: string;
  model: string; subcategory: string; series: string; description: string; features: string; specs: string;
};

function toNumber(text: string): number {
  const value = Number(String(text ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : NaN;
}

function parse(text: string, updateExisting: boolean): { rows: Row[]; problems: string[] } {
  const rows: Row[] = [];
  const problems: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  lines.forEach((line, index) => {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((cell) => cell.replace(/^"|"$/g, "").trim());
    // Skip a header row.
    if (index === 0 && /name/i.test(cells[0] ?? "") && /price|category/i.test(cells.join(" "))) return;
    const [name = "", category = "", selling = "", cost = "", brand = "", sku = "", model = "", subcategory = "", series = "", description = "", features = "", specs = ""] = cells;
    const sellingPrice = toNumber(selling);
    const costPrice = cost ? toNumber(cost) : 0;
    if (!name) return void problems.push(`Line ${index + 1}: no product name.`);
    // In update mode the price columns may be left empty: existing prices are never changed.
    if (!Number.isFinite(sellingPrice) && !(updateExisting && !selling)) return void problems.push(`Line ${index + 1} (${name}): selling price "${selling}" is not a number.`);
    if (!Number.isFinite(costPrice)) return void problems.push(`Line ${index + 1} (${name}): cost price "${cost}" is not a number.`);
    rows.push({ name, category: category || "General", sellingPrice: Number.isFinite(sellingPrice) ? sellingPrice : 0, costPrice, brand, sku, model, subcategory, series, description, features, specs });
  });
  return { rows, problems };
}

export default function ProductImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const { rows, problems } = useMemo(() => parse(text, updateExisting), [text, updateExisting]);

  async function submit() {
    setBusy(true);
    setError("");
    setServerErrors([]);
    try {
      const payload = await apiJson<{ message: string }>("/api/products/import", { method: "POST", json: { products: rows, updateExisting } });
      onImported(payload.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      // The server lists the rows it rejected.
      if (err instanceof ApiError && Array.isArray(err.data.errors)) setServerErrors(err.data.errors as string[]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title="Import products"
      description="Copy rows from Excel and paste them below. Every product starts with zero stock."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryButton} disabled={busy || rows.length === 0 || problems.length > 0} onClick={() => void submit()}>
            <Upload size={16} /> {busy ? "Importing…" : `${updateExisting ? "Import / update" : "Import"} ${rows.length} product(s)`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Notice tone="info">
          Column order: <b>Name · Category · Selling price · Cost price · Brand · SKU</b>. Only the first three are needed. A missing SKU is created automatically (e.g. CAM-0001). Products whose name already exists are skipped.
          <br />
          Website columns (optional, after SKU): <b>Model · Type · Series · Description · Selling points · Specs</b>. Separate selling points with <b>|</b>, and write specs as <b>Resolution: 4 MP | Lens: 2.8 mm</b>.
        </Notice>
        <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
          <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="mt-0.5 h-4 w-4 accent-sky-500" />
          <span><b>Update existing products.</b> Rows that match a product already in the POS (by SKU, otherwise by name) only fill in its website details. Prices, stock and other till details are not changed.</span>
        </label>
        {error && <Notice tone="error">{error}{serverErrors.length > 0 && <ul className="mt-1 list-disc pl-5">{serverErrors.slice(0, 15).map((line) => <li key={line}>{line}</li>)}</ul>}</Notice>}
        <label className={labelClass}>
          Paste here
          <textarea className={`${inputClass} min-h-40 font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Hikvision 2MP Dome Camera\tCameras\t120000\t85000\tHikvision\nDahua 8CH XVR\tRecorders\t450000\t320000\tDahua"} />
        </label>
        {problems.length > 0 && (
          <Notice tone="error">
            Fix these lines first:
            <ul className="mt-1 list-disc pl-5">{problems.slice(0, 15).map((line) => <li key={line}>{line}</li>)}</ul>
          </Notice>
        )}
        {rows.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Selling</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2">Brand</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Model</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Specs</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => (
                  <tr key={`${row.name}-${index}`}>
                    <td className="px-3 py-1.5">{row.name}</td>
                    <td className="px-3 py-1.5">{row.category}</td>
                    <td className="px-3 py-1.5 text-right">{formatUGX(row.sellingPrice)}</td>
                    <td className="px-3 py-1.5 text-right">{formatUGX(row.costPrice)}</td>
                    <td className="px-3 py-1.5">{row.brand}</td>
                    <td className="px-3 py-1.5 text-slate-500">{row.sku || "auto"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{row.model}</td>
                    <td className="px-3 py-1.5">{row.subcategory}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{row.specs ? row.specs.split("|").filter((x) => x.includes(":")).length : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
