/**
 * Installation jobs: site, technician, date, status and customer sign-off.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, MapPin, Plus, Printer, Search, Trash2, Wrench } from "lucide-react";
import { apiJson } from "../lib/http";
import { dateInputValue, escapeHtml, formatDate, formatDateTime } from "../lib/format";
import { printHtml } from "../lib/share";
import { settingText } from "../lib/documents";
import { useSettings } from "../lib/useSettings";
import SignaturePad from "../components/SignaturePad";
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

const STATUSES = ["Scheduled", "In progress", "Completed", "Cancelled"] as const;
type Status = (typeof STATUSES)[number];

type Job = {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string;
  siteAddress: string;
  description: string;
  technician: string;
  scheduledDate: string | null;
  status: Status;
  quotationNumber: string;
  saleReference: string;
  notes: string;
  signedOffBy: string;
  signOffNotes: string;
  signature?: string;
  completedAt: string | null;
  createdByName?: string;
  updatedByName?: string;
  createdAt: string;
};

type Form = Omit<Job, "id" | "number" | "completedAt" | "createdAt" | "scheduledDate"> & { id: string | null; scheduledDate: string };

const emptyForm = (): Form => ({
  id: null,
  customerName: "",
  customerPhone: "",
  siteAddress: "",
  description: "",
  technician: "",
  scheduledDate: "",
  status: "Scheduled",
  quotationNumber: "",
  saleReference: "",
  notes: "",
  signedOffBy: "",
  signOffNotes: "",
  signature: "",
});

export default function JobsPage() {
  const settings = useSettings();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [technicians, setTechnicians] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (status) query.set("status", status);
      const payload = await apiJson<{ jobs: Job[]; technicians: string[] }>(`/api/jobs?${query}`);
      setJobs(payload.jobs);
      setTechnicians(payload.technicians);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openJob(id: string) {
    try {
      const payload = await apiJson<{ job: Job }>(`/api/jobs/${id}`);
      const job = payload.job;
      setForm({ ...job, id: job.id, scheduledDate: dateInputValue(job.scheduledDate), signature: job.signature ?? "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the job.");
    }
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const { id, ...body } = form;
      const payload = id
        ? await apiJson<{ message: string }>(`/api/jobs/${id}`, { method: "PUT", json: body })
        : await apiJson<{ message: string }>("/api/jobs", { method: "POST", json: body });
      setNotice(payload.message);
      setForm(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the job.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    try {
      await apiJson(`/api/jobs/${form.id}`, { method: "DELETE" });
      setConfirmDelete(false);
      setForm(null);
      setNotice("Job deleted.");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the job.");
    }
  }

  function printJobCard(job: Form, number: string) {
    const business = settingText(settings, "businessName", "MS Home Security Solutions");
    const row = (label: string, value: string) => (value ? `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value).replace(/\n/g, "<br>")}</td></tr>` : "");
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(number)}</title><style>
      @page{size:A4;margin:14mm}body{font:12px/1.5 Arial,sans-serif;color:#172033}h1{margin:0;font-size:22px}
      header{display:flex;justify-content:space-between;border-bottom:3px solid #0ea5e9;padding-bottom:10px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse}th{width:30%;text-align:left;color:#475569;font-weight:600}th,td{padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
      .sig{margin-top:24px}.sig img{max-width:280px;border-bottom:1px solid #172033}</style></head><body>
      <header><div><h1>INSTALLATION JOB CARD</h1><p>${escapeHtml(business)}</p></div><div style="text-align:right"><b>${escapeHtml(number)}</b><p>Status: ${escapeHtml(job.status)}</p></div></header>
      <table>${row("Customer", job.customerName)}${row("Phone", job.customerPhone)}${row("Site", job.siteAddress)}${row("Scheduled", job.scheduledDate ? formatDate(job.scheduledDate) : "")}
      ${row("Technician", job.technician)}${row("Work to be done", job.description)}${row("Quotation", job.quotationNumber)}${row("Sale / invoice", job.saleReference)}${row("Notes", job.notes)}
      ${row("Signed off by", job.signedOffBy)}${row("Customer comments", job.signOffNotes)}</table>
      <div class="sig"><p><b>Customer signature</b></p>${job.signature ? `<img src="${job.signature}" alt="Signature">` : "<p>______________________________</p>"}</div>
      </body></html>`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Installation jobs"
        description="Schedule installs, assign technicians and capture the customer's sign-off."
        actions={
          <button type="button" className={primaryButton} onClick={() => setForm(emptyForm())}>
            <Plus size={17} /> New job
          </button>
        }
      />
      {error && !form && <Notice tone="error" onClose={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice("")}>{notice}</Notice>}

      <div className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row`}>
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, site, technician or job number" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-sky-400" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as "" | Status)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>

      {loading && jobs.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <div className={cardClass}>
          <EmptyState title="No jobs yet" description="Create a job card for each installation so the team knows where to go and when." action={<button type="button" className={primaryButton} onClick={() => setForm(emptyForm())}><Plus size={16} /> New job</button>} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => {
            const overdue = job.scheduledDate && new Date(job.scheduledDate) < today && (job.status === "Scheduled" || job.status === "In progress");
            return (
              <button key={job.id} type="button" onClick={() => void openJob(job.id)} className={`${cardClass} p-4 text-left transition hover:border-sky-300 hover:shadow-sm`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-sky-700">{job.number}</p>
                    <p className="truncate font-semibold text-slate-900">{job.customerName}</p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{job.description}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p className="flex items-center gap-1.5"><MapPin size={13} /> {job.siteAddress}</p>
                  <p className={`flex items-center gap-1.5 ${overdue ? "font-semibold text-red-600" : ""}`}>
                    <CalendarDays size={13} /> {job.scheduledDate ? formatDate(job.scheduledDate) : "Not scheduled"}{overdue ? " · overdue" : ""}
                  </p>
                  {job.technician && <p className="flex items-center gap-1.5"><Wrench size={13} /> {job.technician}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {form && (
        <Modal
          wide
          title={form.id ? `Job ${jobs.find((job) => job.id === form.id)?.number ?? ""}` : "New installation job"}
          onClose={() => setForm(null)}
          footer={
            <>
              {form.id && <button type="button" className={dangerButton} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete</button>}
              {form.id && <button type="button" className={secondaryButton} onClick={() => printJobCard(form, jobs.find((job) => job.id === form.id)?.number ?? "Job card")}><Printer size={16} /> Print job card</button>}
              <button type="button" className={secondaryButton} onClick={() => setForm(null)}>Cancel</button>
              <button type="button" className={primaryButton} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save job"}</button>
            </>
          }
        >
          <div className="space-y-5">
            {error && <Notice tone="error">{error}</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Customer *<input className={inputClass} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} /></label>
              <label className={labelClass}>Customer phone<input className={inputClass} value={form.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} inputMode="tel" /></label>
              <label className={`${labelClass} sm:col-span-2`}>Site address / location *<input className={inputClass} value={form.siteAddress} onChange={(e) => set("siteAddress", e.target.value)} placeholder="e.g. Plot 12, Ntinda — blue gate opposite the church" /></label>
              <label className={`${labelClass} sm:col-span-2`}>Work to be done *<textarea className={`${inputClass} min-h-24`} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Install 4 cameras + 8-channel DVR, run cabling, set up phone viewing" /></label>
              <label className={labelClass}>
                Technician
                <input className={inputClass} list="technician-list" value={form.technician} onChange={(e) => set("technician", e.target.value)} />
                <datalist id="technician-list">{technicians.map((name) => <option key={name} value={name} />)}</datalist>
              </label>
              <label className={labelClass}>Scheduled date<input className={inputClass} type="date" value={form.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} /></label>
              <label className={labelClass}>
                Status
                <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value as Status)}>
                  {STATUSES.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>Quotation no.<input className={inputClass} value={form.quotationNumber} onChange={(e) => set("quotationNumber", e.target.value)} placeholder="QUO-…" /></label>
                <label className={labelClass}>Sale / receipt no.<input className={inputClass} value={form.saleReference} onChange={(e) => set("saleReference", e.target.value)} placeholder="MS-…" /></label>
              </div>
              <label className={`${labelClass} sm:col-span-2`}>Internal notes<textarea className={`${inputClass} min-h-16`} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-900">Customer sign-off</h4>
              <p className="text-xs text-slate-500">Fill in when the work is handed over.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Signed off by (name)<input className={inputClass} value={form.signedOffBy} onChange={(e) => set("signedOffBy", e.target.value)} /></label>
                <label className={labelClass}>Customer comments<input className={inputClass} value={form.signOffNotes} onChange={(e) => set("signOffNotes", e.target.value)} /></label>
                <div className="sm:col-span-2"><SignaturePad value={form.signature ?? ""} onChange={(value) => set("signature", value)} /></div>
              </div>
            </div>
            {form.id && (
              <p className="text-xs text-slate-500">
                {(() => {
                  const job = jobs.find((entry) => entry.id === form.id);
                  return job ? `Created ${formatDateTime(job.createdAt)}${job.createdByName ? ` by ${job.createdByName}` : ""}${job.completedAt ? ` · completed ${formatDateTime(job.completedAt)}` : ""}` : "";
                })()}
              </p>
            )}
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete this job?"
          description="The job card and its sign-off are removed permanently."
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button type="button" className={dangerButton} onClick={() => void remove()}><Trash2 size={16} /> Delete</button>
            </>
          }
        >
          <p className="text-sm text-slate-600">{form?.customerName}</p>
        </Modal>
      )}
    </div>
  );
}
