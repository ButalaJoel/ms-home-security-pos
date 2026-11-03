/**
 * Customer balances: everyone who still owes money, with one-tap
 * "Record payment" and a WhatsApp reminder.
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, MessageCircle, RefreshCw, Wallet } from "lucide-react";
import { apiJson } from "../lib/http";
import { formatDate, formatUGX, whatsappNumber } from "../lib/format";
import { whatsappLink } from "../lib/share";
import { settingText } from "../lib/documents";
import { useSettings } from "../lib/useSettings";
import RecordPaymentDialog from "../components/RecordPaymentDialog";
import { EmptyState, Notice, PageHeader, StatCard, cardClass, secondaryButton } from "../components/ui";

type OwingSale = { id: string; receiptNumber: string; grandTotal: number; amountPaid: number; balance: number; createdAt: string };
type OwingCustomer = { customer: string; phone: string; balance: number; sales: OwingSale[] };

export default function BalancesPage() {
  const settings = useSettings();
  const [customers, setCustomers] = useState<OwingCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ sale: OwingSale; customer: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiJson<{ customers: OwingCustomer[]; totalOutstanding: number }>("/api/balances");
      setCustomers(payload.customers);
      setTotal(payload.totalOutstanding);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load balances.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function reminder(entry: OwingCustomer): string {
    const business = settingText(settings, "businessName", "MS Home Security Solutions");
    const lines = entry.sales.map((sale) => `• ${sale.receiptNumber} (${formatDate(sale.createdAt)}): ${formatUGX(sale.balance)}`).join("\n");
    return `Hello ${entry.customer},\n\nThis is a friendly reminder from ${business}. Your outstanding balance is ${formatUGX(entry.balance)}:\n${lines}\n\nThank you.`;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Payments"
        title="Customer balances"
        description="Customers with unpaid or part-paid sales. Record payments as they come in."
        actions={
          <button type="button" className={secondaryButton} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice("")}>{notice}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Total outstanding" value={formatUGX(total)} tone={total > 0 ? "bad" : "good"} />
        <StatCard label="Customers owing" value={String(customers.length)} />
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        {loading && customers.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : customers.length === 0 ? (
          <EmptyState title="Nobody owes money" description="All sales are fully paid." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {customers.map((entry) => {
              const key = entry.customer.toLowerCase();
              const expanded = open === key;
              return (
                <li key={key}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button type="button" onClick={() => setOpen(expanded ? null : key)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      {expanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{entry.customer}</span>
                        <span className="text-xs text-slate-500">{entry.sales.length} sale(s){entry.phone ? ` · ${entry.phone}` : ""}</span>
                      </span>
                    </button>
                    <span className="font-bold text-red-600">{formatUGX(entry.balance)}</span>
                    {whatsappNumber(entry.phone) && (
                      <a href={whatsappLink(entry.phone, reminder(entry))} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                        <MessageCircle size={14} /> Remind
                      </a>
                    )}
                  </div>
                  {expanded && (
                    <ul className="border-t border-slate-100 bg-slate-50/60">
                      {entry.sales.map((sale) => (
                        <li key={sale.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
                          <span>
                            <span className="font-medium text-slate-800">{sale.receiptNumber}</span>
                            <span className="ml-2 text-xs text-slate-500">{formatDate(sale.createdAt)} · total {formatUGX(sale.grandTotal)} · paid {formatUGX(sale.amountPaid)}</span>
                          </span>
                          <span className="flex items-center gap-3">
                            <b className="text-red-600">{formatUGX(sale.balance)}</b>
                            <button type="button" onClick={() => setPaying({ sale, customer: entry.customer })} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600">
                              <Wallet size={14} /> Record payment
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {paying && (
        <RecordPaymentDialog
          saleId={paying.sale.id}
          reference={paying.sale.receiptNumber}
          customer={paying.customer}
          balance={paying.sale.balance}
          onClose={() => setPaying(null)}
          onRecorded={(message) => {
            setPaying(null);
            setNotice(message);
            void load();
          }}
        />
      )}
    </div>
  );
}
