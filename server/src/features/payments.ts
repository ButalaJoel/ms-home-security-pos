/**
 * Customer payments against sales (part-payments / settling balances).
 *
 * Every sale keeps a "payments" list. The first payment taken at the till is
 * the sale's original amountPaid; later payments are added here and update
 * amountPaid, balance and paymentStatus together, so the dashboard's
 * "Outstanding balances" stays accurate.
 */
import { Router, type Request, type Response } from "express";
import { ObjectId, type Document } from "mongodb";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import {
  PAYMENT_METHODS,
  cleanText,
  currentUserName,
  handleFailure,
  isMoney,
  nextDocumentNumber,
  parseDate,
  sendError,
  toObjectId,
  type PaymentMethod,
} from "./common.js";

type PaymentEntry = {
  id: string;
  receiptNumber: string;
  amount: number;
  method: PaymentMethod;
  note: string;
  receivedAt: Date;
  recordedByName: string;
};

function paymentsOf(sale: Document): PaymentEntry[] {
  return Array.isArray(sale.payments) ? (sale.payments as PaymentEntry[]) : [];
}

/** Amount paid at the till when the sale was made (before later payments). */
export function initialPaymentOf(sale: Document): number {
  const later = paymentsOf(sale).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return Math.max(0, Number(sale.amountPaid || 0) - later);
}

const router = Router();

// POST /api/sales/:id/payments  { amount, method, note?, date? }
router.post("/api/sales/:id/payments", requireAuth, async (req: Request, res: Response) => {
  try {
    const saleId = toObjectId(req.params.id);
    if (!saleId) return sendError(res, 400, "Invalid sale ID.");
    const amount = req.body?.amount;
    if (!isMoney(amount) || amount <= 0) return sendError(res, 400, "Enter a payment amount greater than zero.");
    const method = cleanText(req.body?.method, 30) as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) return sendError(res, 400, "Choose Cash, Mobile Money, Bank transfer or Card.");
    const receivedAt = req.body?.date ? parseDate(req.body.date) : new Date();
    if (!receivedAt) return sendError(res, 400, "Invalid payment date.");
    if (receivedAt.getTime() > Date.now() + 5 * 60 * 1000) return sendError(res, 400, "The payment date cannot be in the future.");

    const db = await connectToDatabase();
    const sales = db.collection("sales");
    const sale = await sales.findOne({ _id: saleId });
    if (!sale) return sendError(res, 404, "Sale not found.");

    const grandTotal = Number(sale.grandTotal || 0);
    const previousPaid = Number(sale.amountPaid || 0);
    const balance = Math.max(0, grandTotal - previousPaid);
    if (balance <= 0) return sendError(res, 409, "This sale is already fully paid.");
    if (amount > balance) return sendError(res, 400, `The balance is only UGX ${balance.toLocaleString("en-UG")}.`);

    const settings = await db.collection<Document & { _id: string }>("settings").findOne({ _id: "business" });
    const prefix = typeof settings?.receiptPrefix === "string" && settings.receiptPrefix.trim() ? settings.receiptPrefix.trim() : "REC";
    const user = await currentUserName(db, req);
    const payment: PaymentEntry = {
      id: new ObjectId().toHexString(),
      receiptNumber: await nextDocumentNumber(db, prefix),
      amount,
      method,
      note: cleanText(req.body?.note, 300),
      receivedAt,
      recordedByName: user.name,
    };

    const newPaid = previousPaid + amount;
    const newBalance = Math.max(0, grandTotal - newPaid);
    // Only applies if nobody else recorded a payment in the meantime.
    const updated = await sales.findOneAndUpdate(
      { _id: saleId, amountPaid: sale.amountPaid },
      {
        $push: { payments: payment },
        $set: {
          amountPaid: newPaid,
          balance: newBalance,
          paymentStatus: newBalance === 0 ? "paid" : "partial",
          updatedAt: new Date(),
        },
      } as Document,
      { returnDocument: "after" },
    );
    if (!updated) return sendError(res, 409, "Another payment was just recorded on this sale. Refresh and try again.");

    res.status(201).json({
      success: true,
      message: `Payment ${payment.receiptNumber} recorded. ${newBalance === 0 ? "The sale is now fully paid." : `Balance: UGX ${newBalance.toLocaleString("en-UG")}.`}`,
      payment,
      sale: { ...updated, id: String(updated._id), _id: String(updated._id) },
    });
  } catch (error) {
    handleFailure(res, "Could not record the payment", error);
  }
});

// GET /api/balances  — customers who still owe money, largest first.
router.get("/api/balances", requireAuth, async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const sales = await db
      .collection("sales")
      .find({ balance: { $gt: 0 } })
      .project({ receiptNumber: 1, customerName: 1, customer: 1, customerPhone: 1, grandTotal: 1, amountPaid: 1, balance: 1, createdAt: 1 })
      .sort({ createdAt: 1 })
      .toArray();

    const byCustomer = new Map<string, { customer: string; phone: string; balance: number; sales: Document[] }>();
    for (const sale of sales) {
      const customer = String(sale.customerName || sale.customer || "Walk-in customer");
      const key = customer.toLowerCase();
      const entry = byCustomer.get(key) ?? { customer, phone: String(sale.customerPhone || ""), balance: 0, sales: [] };
      entry.balance += Number(sale.balance || 0);
      entry.sales.push({ ...sale, id: String(sale._id), _id: String(sale._id) });
      byCustomer.set(key, entry);
    }
    const customers = Array.from(byCustomer.values()).sort((a, b) => b.balance - a.balance);
    res.json({
      success: true,
      totalOutstanding: customers.reduce((sum, entry) => sum + entry.balance, 0),
      customers,
    });
  } catch (error) {
    handleFailure(res, "Could not load balances", error);
  }
});

export default router;
