/**
 * Records a part-payment (or final payment) against a sale's balance.
 */
import { useState } from "react";
import { Wallet } from "lucide-react";
import { Modal, Notice, inputClass, labelClass, primaryButton, secondaryButton } from "./ui";
import { apiJson } from "../lib/http";
import { formatUGX, todayKey } from "../lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "../lib/types";

type Props = {
  saleId: string;
  reference: string;
  customer: string;
  balance: number;
  onClose: () => void;
  onRecorded: (message: string, sale: Record<string, unknown>) => void;
};

export default function RecordPaymentDialog({ saleId, reference, customer, balance, onClose, onRecorded }: Props) {
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than zero.");
    if (value > balance) return setError(`The balance is only ${formatUGX(balance)}.`);
    setBusy(true);
    setError("");
    try {
      // Today's payments keep the current time; back-dated ones use the chosen day.
      const payload = await apiJson<{ message: string; sale: Record<string, unknown> }>(`/api/sales/${saleId}/payments`, {
        method: "POST",
        json: { amount: value, method, note, ...(date !== todayKey() ? { date } : {}) },
      });
      onRecorded(payload.message, payload.sale);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Record payment"
      description={`${reference} · ${customer} · balance ${formatUGX(balance)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryButton} disabled={busy} onClick={() => void submit()}>
            <Wallet size={16} /> {busy ? "Saving…" : "Record payment"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Amount received (UGX)
            <input className={inputClass} type="number" min={1} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className={labelClass}>
            Method
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className={labelClass}>
            Date received
            <input className={inputClass} type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className={labelClass}>
            Note / transaction ID
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. MoMo ID 12345678" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => setAmount(String(balance))}>Full balance</button>
          <button type="button" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => setAmount(String(Math.round(balance / 2)))}>Half</button>
        </div>
      </div>
    </Modal>
  );
}
