/**
 * Saved quotations.
 *
 * - Numbers come from an atomic counter (QUO-2026-0001, 0002, ...).
 * - Totals are always recalculated on the server.
 * - Draft / Sent quotations past their validity date become "Expired".
 * - Converting to a sale: the app creates the sale through POST /api/sales
 *   (so stock is checked and deducted the normal way) using the request ID
 *   "quote-<quotationId>", then calls PATCH /:id/converted to link them.
 *   Retrying the conversion can never create a second sale.
 */
import { Router, type Request, type Response } from "express";
import type { Db, Document } from "mongodb";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import {
  cleanText,
  currentUserName,
  handleFailure,
  isMoney,
  isWholeNumber,
  nextDocumentNumber,
  searchRegex,
  sendError,
  serialize,
  toObjectId,
} from "./common.js";

export const QUOTATION_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired", "Converted"] as const;
type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
const MANUAL_STATUSES: QuotationStatus[] = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

type QuoteLine = {
  productId: string | null;
  description: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type ParsedQuote = {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  items: QuoteLine[];
  subtotal: number;
  discount: number;
  taxEnabled: boolean;
  taxLabel: string;
  taxRate: number;
  tax: number;
  grandTotal: number;
  validDays: number;
  notes: string;
  terms: string;
};

async function quotePrefix(db: Db): Promise<string> {
  const settings = await db.collection<Document & { _id: string }>("settings").findOne({ _id: "business" });
  const prefix = typeof settings?.quotePrefix === "string" ? settings.quotePrefix.trim() : "";
  return prefix || "QUO";
}

/** Validates the editor payload and recalculates every total. */
async function parseQuote(db: Db, body: unknown): Promise<ParsedQuote | string> {
  if (!body || typeof body !== "object") return "A quotation is required.";
  const input = body as Record<string, unknown>;

  const customerName = cleanText(input.customerName, 200);
  if (!customerName) return "Enter the customer or business name.";

  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length === 0 || rawItems.length > 200) return "Add between 1 and 200 items.";

  const items: QuoteLine[] = [];
  const seenProducts = new Set<string>();
  for (const raw of rawItems) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const description = cleanText(item.description, 300);
    if (!description) return "Every item needs a description.";
    if (!isWholeNumber(item.quantity, 1)) return `Quantity for "${description}" must be a whole number of at least 1.`;
    if (!isMoney(item.unitPrice)) return `Price for "${description}" must be zero or more.`;

    let productId: string | null = null;
    let sku = "";
    const objectId = toObjectId(item.productId);
    if (objectId) {
      const product = await db.collection("products").findOne({ _id: objectId }, { projection: { sku: 1 } });
      if (product) {
        productId = String(objectId);
        sku = typeof product.sku === "string" ? product.sku : "";
        // A sale cannot hold the same product twice at different prices.
        if (seenProducts.has(productId)) return `"${description}" appears twice. Combine it into one line.`;
        seenProducts.add(productId);
      }
    }

    const lineTotal = item.quantity * item.unitPrice;
    if (!Number.isSafeInteger(Math.round(lineTotal))) return "A line total is too large.";
    items.push({ productId, description, sku, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal });
  }

  const subtotal = items.reduce((sum, line) => sum + line.lineTotal, 0);
  const discountInput = input.discount ?? 0;
  if (!isMoney(discountInput)) return "Discount must be zero or more.";
  const discount = Math.min(discountInput, subtotal);

  const taxEnabled = input.taxEnabled === true;
  const taxRateInput = Number(input.taxRate ?? 0);
  if (taxEnabled && (!Number.isFinite(taxRateInput) || taxRateInput < 0 || taxRateInput > 100)) {
    return "Tax rate must be between 0 and 100.";
  }
  const taxRate = taxEnabled ? taxRateInput : 0;
  const tax = Math.round(((subtotal - discount) * taxRate) / 100);
  const grandTotal = subtotal - discount + tax;

  const validDaysInput = Number(input.validDays ?? 30);
  const validDays = Number.isInteger(validDaysInput) && validDaysInput >= 1 && validDaysInput <= 365 ? validDaysInput : 30;

  const customerObjectId = toObjectId(input.customerId);

  return {
    customerId: customerObjectId ? String(customerObjectId) : null,
    customerName,
    customerPhone: cleanText(input.customerPhone, 60),
    customerEmail: cleanText(input.customerEmail, 200),
    customerAddress: cleanText(input.customerAddress, 300),
    items,
    subtotal,
    discount,
    taxEnabled,
    taxLabel: cleanText(input.taxLabel, 40) || "Tax",
    taxRate,
    tax,
    grandTotal,
    validDays,
    notes: cleanText(input.notes, 3000),
    terms: cleanText(input.terms, 6000),
  };
}

function validUntil(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Marks overdue Draft/Sent quotations as Expired. */
async function expireOverdue(db: Db): Promise<void> {
  await db.collection("quotations").updateMany(
    { status: { $in: ["Draft", "Sent"] }, validUntil: { $lt: new Date() } },
    { $set: { status: "Expired", updatedAt: new Date() } },
  );
}

const router = Router();
router.use(requireAuth);

// GET /api/quotations?search=&status=&limit=
router.get("/", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    await expireOverdue(db);

    const filter: Record<string, unknown> = {};
    const status = cleanText(req.query.status, 20);
    if (QUOTATION_STATUSES.includes(status as QuotationStatus)) filter.status = status;
    const search = searchRegex(req.query.search);
    if (search) filter.$or = [{ number: search }, { customerName: search }, { customerPhone: search }];
    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);

    const quotations = await db
      .collection("quotations")
      .find(filter, { projection: { terms: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    res.json({ success: true, quotations: quotations.map(serialize) });
  } catch (error) {
    handleFailure(res, "Could not load quotations", error);
  }
});

// GET /api/quotations/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid quotation ID.");
    const db = await connectToDatabase();
    await expireOverdue(db);
    const quotation = await db.collection("quotations").findOne({ _id: id });
    if (!quotation) return sendError(res, 404, "Quotation not found.");
    res.json({ success: true, quotation: serialize(quotation) });
  } catch (error) {
    handleFailure(res, "Could not load the quotation", error);
  }
});

// POST /api/quotations  — save a new quotation and reserve its number.
router.post("/", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const parsed = await parseQuote(db, req.body);
    if (typeof parsed === "string") return sendError(res, 400, parsed);

    const now = new Date();
    const user = await currentUserName(db, req);
    const requestedStatus = cleanText(req.body?.status, 20) as QuotationStatus;
    const status: QuotationStatus = requestedStatus === "Sent" ? "Sent" : "Draft";
    const number = await nextDocumentNumber(db, await quotePrefix(db));

    const document = {
      number,
      status,
      ...parsed,
      validUntil: validUntil(now, parsed.validDays),
      saleId: null as string | null,
      saleReference: "",
      createdById: user.id,
      createdByName: user.name,
      updatedByName: user.name,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("quotations").insertOne(document);
    res.status(201).json({
      success: true,
      message: `Quotation ${number} saved.`,
      quotation: serialize({ _id: result.insertedId, ...document }),
    });
  } catch (error) {
    handleFailure(res, "Could not save the quotation", error);
  }
});

// PUT /api/quotations/:id  — edit a saved quotation (not once converted).
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid quotation ID.");
    const db = await connectToDatabase();
    const existing = await db.collection("quotations").findOne({ _id: id });
    if (!existing) return sendError(res, 404, "Quotation not found.");
    if (existing.status === "Converted") {
      return sendError(res, 409, "This quotation has already become a sale. Duplicate it to make changes.");
    }

    const parsed = await parseQuote(db, req.body);
    if (typeof parsed === "string") return sendError(res, 400, parsed);
    const user = await currentUserName(db, req);
    const createdAt = existing.createdAt instanceof Date ? existing.createdAt : new Date();
    const newValidUntil = validUntil(createdAt, parsed.validDays);
    // Editing an expired quotation that is valid again brings it back to Draft.
    const status =
      existing.status === "Expired" && newValidUntil > new Date() ? "Draft" : existing.status;

    const updated = await db.collection("quotations").findOneAndUpdate(
      { _id: id, status: { $ne: "Converted" } },
      { $set: { ...parsed, status, validUntil: newValidUntil, updatedByName: user.name, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) return sendError(res, 409, "This quotation changed while you were editing it. Reload and try again.");
    res.json({ success: true, message: `Quotation ${updated.number} updated.`, quotation: serialize(updated) });
  } catch (error) {
    handleFailure(res, "Could not update the quotation", error);
  }
});

// PATCH /api/quotations/:id/status  { status }
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid quotation ID.");
    const status = cleanText(req.body?.status, 20) as QuotationStatus;
    if (!MANUAL_STATUSES.includes(status)) return sendError(res, 400, "Choose Draft, Sent, Accepted, Rejected or Expired.");

    const db = await connectToDatabase();
    const user = await currentUserName(db, req);
    const updated = await db.collection("quotations").findOneAndUpdate(
      { _id: id, status: { $ne: "Converted" } },
      { $set: { status, updatedByName: user.name, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) return sendError(res, 409, "Quotation not found, or it has already become a sale.");
    res.json({ success: true, quotation: serialize(updated) });
  } catch (error) {
    handleFailure(res, "Could not change the status", error);
  }
});

// POST /api/quotations/:id/duplicate  — copy into a new Draft with a new number.
router.post("/:id/duplicate", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid quotation ID.");
    const db = await connectToDatabase();
    const source = await db.collection("quotations").findOne({ _id: id });
    if (!source) return sendError(res, 404, "Quotation not found.");

    const now = new Date();
    const user = await currentUserName(db, req);
    const number = await nextDocumentNumber(db, await quotePrefix(db));
    const { _id, number: _oldNumber, saleId: _sale, saleReference: _ref, ...rest } = source;
    const copy = {
      ...rest,
      number,
      status: "Draft",
      validUntil: validUntil(now, Number(source.validDays) || 30),
      saleId: null,
      saleReference: "",
      duplicatedFrom: source.number,
      createdById: user.id,
      createdByName: user.name,
      updatedByName: user.name,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("quotations").insertOne(copy);
    res.status(201).json({
      success: true,
      message: `Copied ${source.number} to ${number}.`,
      quotation: serialize({ _id: result.insertedId, ...copy }),
    });
  } catch (error) {
    handleFailure(res, "Could not duplicate the quotation", error);
  }
});

// PATCH /api/quotations/:id/converted  { saleId }
// Links the sale created from this quotation. The sale must carry the
// request ID "quote-<id>", which proves it was made from this quotation.
router.patch("/:id/converted", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    const saleId = toObjectId(req.body?.saleId);
    if (!id || !saleId) return sendError(res, 400, "Invalid quotation or sale ID.");

    const db = await connectToDatabase();
    const sale = await db.collection("sales").findOne({ _id: saleId });
    if (!sale || sale.clientSaleId !== `quote-${String(id)}`) {
      return sendError(res, 400, "That sale was not created from this quotation.");
    }
    const user = await currentUserName(db, req);
    const updated = await db.collection("quotations").findOneAndUpdate(
      { _id: id },
      {
        $set: {
          status: "Converted",
          saleId: String(saleId),
          saleReference: String(sale.receiptNumber ?? ""),
          convertedAt: new Date(),
          updatedByName: user.name,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
    if (!updated) return sendError(res, 404, "Quotation not found.");
    res.json({ success: true, message: `Quotation ${updated.number} converted to sale ${sale.receiptNumber}.`, quotation: serialize(updated) });
  } catch (error) {
    handleFailure(res, "Could not link the sale", error);
  }
});

// DELETE /api/quotations/:id  — not allowed once converted.
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid quotation ID.");
    const db = await connectToDatabase();
    const result = await db.collection("quotations").deleteOne({ _id: id, status: { $ne: "Converted" } });
    if (result.deletedCount !== 1) return sendError(res, 409, "Quotation not found, or it has already become a sale.");
    res.json({ success: true, message: "Quotation deleted." });
  } catch (error) {
    handleFailure(res, "Could not delete the quotation", error);
  }
});

export default router;
