/**
 * Expenses, end-of-day cash-up and the profit summary.
 *
 * Cash-up: for a given day the system works out what each payment method
 * should hold (money taken at the till + later part-payments − expenses paid
 * that way), staff enter what they actually counted, and the difference is
 * saved.
 */
import { Router, type Request, type Response } from "express";
import type { Document } from "mongodb";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import { initialPaymentOf } from "./payments.js";
import {
  PAYMENT_METHODS,
  cleanText,
  currentUserName,
  handleFailure,
  isMoney,
  kampalaDayKey,
  kampalaDayRange,
  parseDate,
  searchRegex,
  sendError,
  serialize,
  toObjectId,
  type PaymentMethod,
} from "./common.js";

export const EXPENSE_CATEGORIES = [
  "Transport", "Airtime & data", "Fuel", "Meals", "Rent", "Utilities", "Salaries & wages",
  "Installation materials", "Repairs & maintenance", "Office supplies", "Marketing", "Bank & MoMo charges", "Other",
];

function parseExpense(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  const description = cleanText(input.description, 300);
  if (!description) return "Describe the expense.";
  const category = cleanText(input.category, 60);
  if (!EXPENSE_CATEGORIES.includes(category)) return "Choose an expense category.";
  if (!isMoney(input.amount) || input.amount <= 0) return "Enter an amount greater than zero.";
  const paymentMethod = cleanText(input.paymentMethod, 30) as PaymentMethod;
  if (!PAYMENT_METHODS.includes(paymentMethod)) return "Choose how it was paid.";
  const date = input.date ? parseDate(input.date) : new Date();
  if (!date) return "Invalid date.";
  return {
    description,
    category,
    amount: input.amount,
    paymentMethod,
    date,
    paidTo: cleanText(input.paidTo, 200),
    reference: cleanText(input.reference, 80),
    notes: cleanText(input.notes, 1000),
  };
}

function emptyTotals(): Record<PaymentMethod, number> {
  return { Cash: 0, "Mobile Money": 0, "Bank transfer": 0, Card: 0 };
}

/** What each payment method should hold for one Kampala day. */
async function expectedForDay(dayKey: string) {
  const range = kampalaDayRange(dayKey);
  if (!range) return null;
  const db = await connectToDatabase();
  const salesReceived = emptyTotals();
  const balancePayments = emptyTotals();
  const expenses = emptyTotals();

  const daySales = await db.collection("sales").find({ createdAt: { $gte: range.start, $lt: range.end } }).toArray();
  for (const sale of daySales) {
    const method = sale.paymentMethod as PaymentMethod;
    if (method in salesReceived) salesReceived[method] += initialPaymentOf(sale);
  }

  const withPayments = await db
    .collection("sales")
    .find({ "payments.receivedAt": { $gte: range.start, $lt: range.end } }, { projection: { payments: 1 } })
    .toArray();
  for (const sale of withPayments) {
    for (const payment of (sale.payments ?? []) as Document[]) {
      const at = new Date(payment.receivedAt);
      if (at >= range.start && at < range.end && payment.method in balancePayments) {
        balancePayments[payment.method as PaymentMethod] += Number(payment.amount || 0);
      }
    }
  }

  const dayExpenses = await db.collection("expenses").find({ date: { $gte: range.start, $lt: range.end } }).toArray();
  for (const expense of dayExpenses) {
    const method = expense.paymentMethod as PaymentMethod;
    if (method in expenses) expenses[method] += Number(expense.amount || 0);
  }

  const expected = emptyTotals();
  for (const method of PAYMENT_METHODS) {
    expected[method] = salesReceived[method] + balancePayments[method] - expenses[method];
  }
  return {
    date: dayKey,
    salesCount: daySales.length,
    salesTotal: daySales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0),
    salesReceived,
    balancePayments,
    expenses,
    expected,
  };
}

const router = Router();
router.use(requireAuth);

// ---------------- Expenses ----------------

// GET /api/expenses?from=&to=&category=&search=
router.get("/expenses", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const filter: Record<string, unknown> = {};
    const from = kampalaDayRange(cleanText(req.query.from, 10));
    const to = kampalaDayRange(cleanText(req.query.to, 10));
    if (from || to) filter.date = { ...(from ? { $gte: from.start } : {}), ...(to ? { $lt: to.end } : {}) };
    const category = cleanText(req.query.category, 60);
    if (category) filter.category = category;
    const search = searchRegex(req.query.search);
    if (search) filter.$or = [{ description: search }, { paidTo: search }, { reference: search }];

    const expenses = await db.collection("expenses").find(filter).sort({ date: -1, createdAt: -1 }).limit(1000).toArray();
    res.json({
      success: true,
      categories: EXPENSE_CATEGORIES,
      total: expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
      expenses: expenses.map(serialize),
    });
  } catch (error) {
    handleFailure(res, "Could not load expenses", error);
  }
});

// POST /api/expenses
router.post("/expenses", async (req: Request, res: Response) => {
  try {
    const parsed = parseExpense(req.body);
    if (typeof parsed === "string") return sendError(res, 400, parsed);
    const db = await connectToDatabase();
    const user = await currentUserName(db, req);
    const now = new Date();
    const document = { ...parsed, recordedByName: user.name, createdAt: now, updatedAt: now };
    const result = await db.collection("expenses").insertOne(document);
    res.status(201).json({ success: true, message: "Expense recorded.", expense: serialize({ _id: result.insertedId, ...document }) });
  } catch (error) {
    handleFailure(res, "Could not record the expense", error);
  }
});

// PUT /api/expenses/:id
router.put("/expenses/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid expense ID.");
    const parsed = parseExpense(req.body);
    if (typeof parsed === "string") return sendError(res, 400, parsed);
    const db = await connectToDatabase();
    const user = await currentUserName(db, req);
    const updated = await db.collection("expenses").findOneAndUpdate(
      { _id: id },
      { $set: { ...parsed, updatedByName: user.name, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) return sendError(res, 404, "Expense not found.");
    res.json({ success: true, message: "Expense updated.", expense: serialize(updated) });
  } catch (error) {
    handleFailure(res, "Could not update the expense", error);
  }
});

// DELETE /api/expenses/:id
router.delete("/expenses/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid expense ID.");
    const db = await connectToDatabase();
    const result = await db.collection("expenses").deleteOne({ _id: id });
    if (result.deletedCount !== 1) return sendError(res, 404, "Expense not found.");
    res.json({ success: true, message: "Expense deleted." });
  } catch (error) {
    handleFailure(res, "Could not delete the expense", error);
  }
});

// ---------------- Cash-up ----------------

// GET /api/cashups/expected?date=YYYY-MM-DD  (defaults to today)
router.get("/cashups/expected", async (req: Request, res: Response) => {
  try {
    const dayKey = cleanText(req.query.date, 10) || kampalaDayKey();
    const summary = await expectedForDay(dayKey);
    if (!summary) return sendError(res, 400, "Use a date like 2026-11-03.");
    const db = await connectToDatabase();
    const saved = await db.collection("cashups").findOne({ date: dayKey });
    res.json({ success: true, summary, saved: saved ? serialize(saved) : null });
  } catch (error) {
    handleFailure(res, "Could not work out the expected totals", error);
  }
});

// GET /api/cashups  — history of closed days
router.get("/cashups", async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const cashups = await db.collection("cashups").find({}).sort({ date: -1 }).limit(120).toArray();
    res.json({ success: true, cashups: cashups.map(serialize) });
  } catch (error) {
    handleFailure(res, "Could not load cash-ups", error);
  }
});

// POST /api/cashups  { date, openingFloat, counted: { Cash, "Mobile Money", ... }, notes }
// Saving the same day again replaces that day's cash-up.
router.post("/cashups", async (req: Request, res: Response) => {
  try {
    const dayKey = cleanText(req.body?.date, 10) || kampalaDayKey();
    const summary = await expectedForDay(dayKey);
    if (!summary) return sendError(res, 400, "Use a date like 2026-11-03.");
    const openingFloat = req.body?.openingFloat ?? 0;
    if (!isMoney(openingFloat)) return sendError(res, 400, "Opening float must be zero or more.");

    const countedInput = (req.body?.counted ?? {}) as Record<string, unknown>;
    const counted = emptyTotals();
    const difference = emptyTotals();
    for (const method of PAYMENT_METHODS) {
      const value = countedInput[method] ?? 0;
      if (!isMoney(value)) return sendError(res, 400, `Counted ${method} must be zero or more.`);
      counted[method] = value;
      const expected = summary.expected[method] + (method === "Cash" ? openingFloat : 0);
      difference[method] = value - expected;
    }

    const db = await connectToDatabase();
    const user = await currentUserName(db, req);
    const now = new Date();
    const document = {
      ...summary,
      date: dayKey,
      openingFloat,
      counted,
      difference,
      totalDifference: PAYMENT_METHODS.reduce((sum, method) => sum + difference[method], 0),
      notes: cleanText(req.body?.notes, 2000),
      closedByName: user.name,
      updatedAt: now,
    };
    const saved = await db.collection("cashups").findOneAndUpdate(
      { date: dayKey },
      { $set: document, $setOnInsert: { createdAt: now } },
      { upsert: true, returnDocument: "after" },
    );
    res.status(201).json({ success: true, message: `Cash-up for ${dayKey} saved.`, cashup: saved ? serialize(saved) : null });
  } catch (error) {
    handleFailure(res, "Could not save the cash-up", error);
  }
});

// ---------------- Profit summary ----------------

// GET /api/reports/profit?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/reports/profit", async (req: Request, res: Response) => {
  try {
    const today = kampalaDayKey();
    const fromKey = cleanText(req.query.from, 10) || `${today.slice(0, 8)}01`;
    const toKey = cleanText(req.query.to, 10) || today;
    const from = kampalaDayRange(fromKey);
    const to = kampalaDayRange(toKey);
    if (!from || !to || from.start > to.start) return sendError(res, 400, "Choose a valid date range.");

    const db = await connectToDatabase();
    const sales = await db.collection("sales").find({ createdAt: { $gte: from.start, $lt: to.end } }).toArray();
    const products = await db.collection("products").find({}, { projection: { costPrice: 1 } }).toArray();
    const currentCost = new Map(products.map((product) => [String(product._id), Number(product.costPrice || 0)]));

    let revenue = 0;
    let costOfGoods = 0;
    let estimatedLines = 0;
    for (const sale of sales) {
      revenue += Number(sale.grandTotal || 0) - Number(sale.tax || 0);
      for (const line of (sale.items ?? []) as Document[]) {
        if (line.type === "custom") continue;
        const unitCost = typeof line.unitCost === "number" ? line.unitCost : currentCost.get(String(line.productId));
        if (typeof line.unitCost !== "number") estimatedLines += 1;
        costOfGoods += Number(unitCost || 0) * Number(line.quantity || 0);
      }
    }

    const expenses = await db.collection("expenses").find({ date: { $gte: from.start, $lt: to.end } }).toArray();
    const expensesByCategory: Record<string, number> = {};
    for (const expense of expenses) {
      expensesByCategory[expense.category] = (expensesByCategory[expense.category] ?? 0) + Number(expense.amount || 0);
    }
    const totalExpenses = Object.values(expensesByCategory).reduce((sum, value) => sum + value, 0);
    const grossProfit = revenue - costOfGoods;

    res.json({
      success: true,
      from: fromKey,
      to: toKey,
      salesCount: sales.length,
      revenue,
      costOfGoods,
      grossProfit,
      totalExpenses,
      netProfit: grossProfit - totalExpenses,
      expensesByCategory,
      estimatedLines,
    });
  } catch (error) {
    handleFailure(res, "Could not work out profit", error);
  }
});

export default router;
