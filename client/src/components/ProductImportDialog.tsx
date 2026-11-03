/**
 * Bulk-add products by pasting rows copied from Excel or Google Sheets.
 * Columns: Name | Category | Selling price | Cost price | Brand | SKU
 * (only the first three are required). Stock always starts at 0.
 */
import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { Modal, Notice, inputClass, labelClass, primaryButton, secondaryButton } from "./ui";
import { ApiError, apiJson } from "../lib/http";
import { formatUGX } from "../lib/format";

type Row = { name: string; category: string; sellingPrice: number; costPrice: number; brand: string; sku: string };

function toNumber(text: string): number {
  const value = Number(String(text ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : NaN;
}

function parse(text: string): { rows: Row[]; problems: string[] } {
  const rows: Row[] = [];
  const problems: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  lines.forEach((line, index) => {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((cell) => cell.replace(/^"|"$/g, "").trim());
    // Skip a header row.
    if (index === 0 && /name/i.test(cells[0] ?? "") && /price|category/i.test(cells.join(" "))) return;
    const [name = "", category = "", selling = "", cost = "", brand = "", sku = ""] = cells;
    const sellingPrice = toNumber(selling);
    const costPrice = cost ? toNumber(cost) : 0;
    if (!name) return void problems.push(`Line ${index + 1}: no product name.`);
    if (!Number.isFinite(sellingPrice)) return void problems.push(`Line ${index + 1} (${name}): selling price "${selling}" is not a number.`);
    if (!Number.isFinite(costPrice)) return void problems.push(`Line ${index + 1} (${name}): cost price "${cost}" is not a number.`);
    rows.push({ name, category: category || "General", sellingPrice, costPrice, brand, sku });
  });
  return { rows, problems };
}

export default function ProductImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const { rows, problems } = useMemo(() => parse(text), [text]);

  async function submit() {
    setBusy(true);
    setError("");
    setServerErrors([]);
    try {
      const payload = await apiJson<{ message: string }>("/api/products/import", { method: "POST", json: { products: rows } });
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
            <Upload size={16} /> {busy ? "Importing…" : `Import ${rows.length} product(s)`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Notice tone="info">
          Column order: <b>Name · Category · Selling price · Cost price · Brand · SKU</b>. Only the first three are needed. A missing SKU is created automatically (e.g. CAM-0001). Products whose name already exists are skipped.
        </Notice>
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
                <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Selling</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2">Brand</th><th className="px-3 py-2">SKU</th></tr>
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
