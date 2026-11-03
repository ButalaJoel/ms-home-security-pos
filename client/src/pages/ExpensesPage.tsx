/**
 * Expenses, end-of-day cash-up and the profit summary.
 */
import { useCallback, useEffect, useState } from "react";
import { Calculator, Pencil, Plus, Trash2 } from "lucide-react";
import { apiJson } from "../lib/http";
import { dateInputValue, formatDate, formatDateTime, formatUGX, todayKey } from "../lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "../lib/types";
import {
  EmptyState,
  Modal,
  Notice,
  PageHeader,
  StatCard,
  Tabs,
  cardClass,
  dangerButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../components/ui";

type Expense = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paidTo: string;
  reference: string;
  notes: string;
  recordedByName: string;
};

type Totals = Record<PaymentMethod, number>;
type DaySummary = {
  date: string;
  salesCount: number;
  salesTotal: number;
  salesReceived: Totals;
  balancePayments: Totals;
  expenses: Totals;
  expected: Totals;
};
type Cashup = DaySummary & {
  id: string;
  openingFloat: number;
  counted: Totals;
  difference: Totals;
  totalDifference: number;
  notes: string;
  closedByName: string;
  updatedAt: string;
};
type Profit = {
  from: string;
  to: string;
  salesCount: number;
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  expensesByCategory: Record<string, number>;
  estimatedLines: number;
};

const emptyExpense = (): Omit<Expense, "id" | "recordedByName" | "amount"> & { id: string; amount: string } => ({
  id: "",
  date: todayKey(),
  category: "Transport",
  description: "",
  amount: "",
  paymentMethod: "Cash",
  paidTo: "",
  reference: "",
  notes: "",
});

const monthStart = () => `${todayKey().slice(0, 8)}01`;

export default function ExpensesPage() {
  const [tab, setTab] = useState<"expenses" | "cashup" | "profit">("expenses");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Expenses
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayKey());
  const [category, setCategory] = useState("");
  const [form, setForm] = useState<ReturnType<typeof emptyExpense> | null>(null);

  // Cash-up
  const [cashDate, setCashDate] = useState(todayKey());
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [savedCashup, setSavedCashup] = useState<Cashup | null>(null);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [counted, setCounted] = useState<Record<PaymentMethod, string>>({ Cash: "", "Mobile Money": "", "Bank transfer": "", Card: "" });
  const [cashNotes, setCashNotes] = useState("");
  const [history, setHistory] = useState<Cashup[]>([]);

  // Profit
  const [profitFrom, setProfitFrom] = useState(monthStart());
  const [profitTo, setProfitTo] = useState(todayKey());
  const [profit, setProfit] = useState<Profit | null>(null);

  const loadExpenses = useCallback(async () => {
    try {
      const query = new URLSearchParams({ from, to });
      if (category) query.set("category", category);
      const payload = await apiJson<{ expenses: Expense[]; categories: string[]; total: number }>(`/api/expenses?${query}`);
      setExpenses(payload.expenses);
      setCategories(payload.categories);
      setExpenseTotal(payload.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load expenses.");
    }
  }, [from, to, category]);

  const loadCashup = useCallback(async () => {
    try {
      const payload = await apiJson<{ summary: DaySummary; saved: Cashup | null }>(`/api/cashups/expected?date=${cashDate}`);
      setSummary(payload.summary);
      setSavedCashup(payload.saved);
      if (payload.saved) {
        setOpeningFloat(String(payload.saved.openingFloat));
        setCounted({
          Cash: String(payload.saved.counted.Cash),
          "Mobile Money": String(payload.saved.counted["Mobile Money"]),
          "Bank transfer": String(payload.saved.counted["Bank transfer"]),
          Card: String(payload.saved.counted.Card),
        });
        setCashNotes(payload.saved.notes);
      } else {
        setCounted({ Cash: "", "Mobile Money": "", "Bank transfer": "", Card: "" });
        setCashNotes("");
      }
      const list = await apiJson<{ cashups: Cashup[] }>("/api/cashups");
      setHistory(list.cashups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the cash-up.");
    }
  }, [cashDate]);

  const loadProfit = useCallback(async () => {
    try {
      const payload = await apiJson<Profit>(`/api/reports/profit?from=${profitFrom}&to=${profitTo}`);
      setProfit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not work out profit.");
    }
  }, [profitFrom, profitTo]);

  useEffect(() => {
    if (tab === "expenses") void loadExpenses();
  }, [tab, loadExpenses]);
  useEffect(() => {
    if (tab === "cashup") void loadCashup();
  }, [tab, loadCashup]);
  useEffect(() => {
    if (tab === "profit") void loadProfit();
  }, [tab, loadProfit]);

  async function saveExpense() {
    if (!form) return;
    setError("");
    try {
      const { id, ...rest } = form;
      const body = { ...rest, amount: Number(form.amount) };
      const payload = id
        ? await apiJson<{ message: string }>(`/api/expenses/${id}`, { method: "PUT", json: body })
        : await apiJson<{ message: string }>("/api/expenses", { method: "POST", json: body });
      setNotice(payload.message);
      setForm(null);
      void loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the expense.");
    }
  }

  async function deleteExpense() {
    if (!form?.id || !window.confirm("Delete this expense?")) return;
    try {
      await apiJson(`/api/expenses/${form.id}`, { method: "DELETE" });
      setForm(null);
      setNotice("Expense deleted.");
      void loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the expense.");
    }
  }

  async function saveCashup() {
    setError("");
    try {
      const body = {
        date: cashDate,
        openingFloat: Number(openingFloat) || 0,
        counted: Object.fromEntries(PAYMENT_METHODS.map((method) => [method, Number(counted[method]) || 0])),
        notes: cashNotes,
      };
      const payload = await apiJson<{ message: string }>("/api/cashups", { method: "POST", json: body });
      setNotice(payload.message);
      void loadCashup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the cash-up.");
    }
  }

  const floatValue = Number(openingFloat) || 0;
  const expectedFor = (method: PaymentMethod) => (summary ? summary.expected[method] + (method === "Cash" ? floatValue : 0) : 0);
  const differenceFor = (method: PaymentMethod) => (counted[method] === "" ? null : (Number(counted[method]) || 0) - expectedFor(method));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Money"
        title="Expenses & cash-up"
        description="Record running costs, close each day by counting cash and Mobile Money, and see real profit."
        actions={tab === "expenses" ? <button type="button" className={primaryButton} onClick={() => setForm(emptyExpense())}><Plus size={17} /> Record expense</button> : undefined}
      />
      {error && !form && <Notice tone="error" onClose={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice("")}>{notice}</Notice>}

      <Tabs tabs={[{ id: "expenses", label: "Expenses" }, { id: "cashup", label: "End-of-day cash-up" }, { id: "profit", label: "Profit" }]} value={tab} onChange={setTab} />

      {tab === "expenses" && (
        <>
          <div className={`${cardClass} grid gap-3 p-3 sm:grid-cols-4`}>
            <label className={labelClass}>From<input className={inputClass} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className={labelClass}>To<input className={inputClass} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label className={labelClass}>
              Category
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <StatCard label="Total" value={formatUGX(expenseTotal)} />
          </div>
          <div className={`${cardClass} overflow-hidden`}>
            {expenses.length === 0 ? (
              <EmptyState title="No expenses in this period" description="Record transport, airtime, fuel and other costs as they happen." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {expenses.map((expense) => (
                  <li key={expense.id}>
                    <button
                      type="button"
                      onClick={() => setForm({ ...expense, date: dateInputValue(expense.date), amount: String(expense.amount) })}
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-900">{expense.description}</span>
                        <span className="text-xs text-slate-500">{formatDate(expense.date)} · {expense.category} · {expense.paymentMethod}{expense.paidTo ? ` · to ${expense.paidTo}` : ""} · by {expense.recordedByName}</span>
                      </span>
                      <span className="flex items-center gap-2 font-semibold text-slate-900">{formatUGX(expense.amount)} <Pencil size={14} className="text-slate-400" /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {tab === "cashup" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
          <section className={`${cardClass} space-y-4 p-5`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className={labelClass}>Day<input className={inputClass} type="date" max={todayKey()} value={cashDate} onChange={(e) => setCashDate(e.target.value)} /></label>
              <label className={labelClass}>Opening cash float (UGX)<input className={inputClass} type="number" min={0} value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} /></label>
            </div>
            {savedCashup && <Notice tone="info">This day was closed by {savedCashup.closedByName} on {formatDateTime(savedCashup.updatedAt)}. Saving again replaces it.</Notice>}
            {summary && (
              <p className="text-sm text-slate-600">{summary.salesCount} sale(s) worth {formatUGX(summary.salesTotal)} on {formatDate(`${summary.date}T12:00:00+03:00`)}.</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="py-2">Method</th><th className="py-2 pl-3 text-right">Sales</th><th className="py-2 pl-3 text-right">Balance payments</th><th className="py-2 pl-3 text-right">Expenses</th><th className="py-2 pl-3 text-right">Expected</th><th className="py-2 pl-3 text-right">Counted</th><th className="py-2 pl-3 text-right">Difference</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PAYMENT_METHODS.map((method) => {
                    const difference = differenceFor(method);
                    return (
                      <tr key={method}>
                        <td className="py-2 font-medium">{method}{method === "Cash" && floatValue > 0 ? <span className="block text-xs text-slate-500">incl. float</span> : null}</td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right">{formatUGX(summary?.salesReceived[method])}</td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right">{formatUGX(summary?.balancePayments[method])}</td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right text-red-600">− {formatUGX(summary?.expenses[method])}</td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right font-semibold">{formatUGX(expectedFor(method))}</td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right">
                          <input aria-label={`Counted ${method}`} className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-right" type="number" min={0} value={counted[method]} onChange={(e) => setCounted({ ...counted, [method]: e.target.value })} />
                        </td>
                        <td className={`whitespace-nowrap py-2 pl-3 text-right font-semibold ${difference === null ? "text-slate-400" : difference === 0 ? "text-emerald-600" : difference < 0 ? "text-red-600" : "text-amber-600"}`}>
                          {difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatUGX(difference)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Negative difference = money short. Positive = more than expected. Check Mobile Money against the merchant statement.</p>
            <label className={labelClass}>Notes (explain any difference)<textarea className={`${inputClass} min-h-16`} value={cashNotes} onChange={(e) => setCashNotes(e.target.value)} /></label>
            <div className="flex justify-end">
              <button type="button" className={primaryButton} onClick={() => void saveCashup()}><Calculator size={16} /> Close the day</button>
            </div>
          </section>
          <aside className={`${cardClass} overflow-hidden`}>
            <h3 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">Previous cash-ups</h3>
            {history.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" onClick={() => setCashDate(entry.date)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                      <span>{formatDate(`${entry.date}T12:00:00+03:00`)}<span className="block text-xs text-slate-500">by {entry.closedByName}</span></span>
                      <b className={entry.totalDifference === 0 ? "text-emerald-600" : entry.totalDifference < 0 ? "text-red-600" : "text-amber-600"}>{entry.totalDifference > 0 ? "+" : ""}{formatUGX(entry.totalDifference)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      {tab === "profit" && (
        <div className="space-y-4">
          <div className={`${cardClass} flex flex-wrap items-end gap-3 p-3`}>
            <label className={labelClass}>From<input className={inputClass} type="date" value={profitFrom} onChange={(e) => setProfitFrom(e.target.value)} /></label>
            <label className={labelClass}>To<input className={inputClass} type="date" value={profitTo} onChange={(e) => setProfitTo(e.target.value)} /></label>
          </div>
          {profit && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard label="Sales (excl. tax)" value={formatUGX(profit.revenue)} hint={`${profit.salesCount} sale(s)`} />
                <StatCard label="Cost of goods" value={formatUGX(profit.costOfGoods)} />
                <StatCard label="Gross profit" value={formatUGX(profit.grossProfit)} tone={profit.grossProfit >= 0 ? "good" : "bad"} />
                <StatCard label="Expenses" value={formatUGX(profit.totalExpenses)} />
                <StatCard label="Net profit" value={formatUGX(profit.netProfit)} tone={profit.netProfit >= 0 ? "good" : "bad"} />
              </div>
              {profit.estimatedLines > 0 && (
                <Notice tone="info">{profit.estimatedLines} older sale line(s) had no recorded cost, so today's cost price was used for them. New sales record their cost automatically.</Notice>
              )}
              <div className={`${cardClass} p-4`}>
                <h3 className="font-semibold text-slate-900">Expenses by category</h3>
                {Object.keys(profit.expensesByCategory).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No expenses in this period.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {Object.entries(profit.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([name, amount]) => (
                      <li key={name} className="text-sm">
                        <div className="flex justify-between"><span>{name}</span><b>{formatUGX(amount)}</b></div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${Math.max(2, (amount / profit.totalExpenses) * 100)}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-slate-500">Profit uses each product's cost price. Keep cost prices accurate by receiving stock through Suppliers & stock in.</p>
            </>
          )}
        </div>
      )}

      {form && (
        <Modal
          title={form.id ? "Edit expense" : "Record expense"}
          onClose={() => setForm(null)}
          footer={
            <>
              {form.id && <button type="button" className={dangerButton} onClick={() => void deleteExpense()}><Trash2 size={16} /> Delete</button>}
              <button type="button" className={secondaryButton} onClick={() => setForm(null)}>Cancel</button>
              <button type="button" className={primaryButton} onClick={() => void saveExpense()}>Save expense</button>
            </>
          }
        >
          <div className="space-y-4">
            {error && <Notice tone="error">{error}</Notice>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${labelClass} sm:col-span-2`}>What was it for? *<input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Boda to Ntinda installation site" /></label>
              <label className={labelClass}>Amount (UGX) *<input className={inputClass} type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
              <label className={labelClass}>
                Category
                <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {(categories.length ? categories : [form.category]).map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Paid with
                <select className={inputClass} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}>
                  {PAYMENT_METHODS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label className={labelClass}>Date<input className={inputClass} type="date" max={todayKey()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
              <label className={labelClass}>Paid to<input className={inputClass} value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} /></label>
              <label className={labelClass}>Receipt / transaction no.<input className={inputClass} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
