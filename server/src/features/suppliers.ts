/**
 * Suppliers and stock receiving (goods received notes).
 *
 * Receiving stock adds the quantities to products, writes a "Stock received"
 * entry to each product's stock history and, optionally, updates the
 * product's cost price, all in one transaction so a failure leaves nothing
 * half-done.
 */
import { Router, type Request, type Response } from "express";
import { ObjectId, type Document } from "mongodb";
import { client, connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import {
  cleanText,
  currentUserName,
  handleFailure,
  isMoney,
  isWholeNumber,
  nextDocumentNumber,
  parseDate,
  searchRegex,
  sendError,
  serialize,
  toObjectId,
} from "./common.js";

function parseSupplier(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  const name = cleanText(input.name, 200);
  if (!name) return "Enter the supplier name.";
  return {
    name,
    contactPerson: cleanText(input.contactPerson, 120),
    phone: cleanText(input.phone, 60),
    email: cleanText(input.email, 200),
    address: cleanText(input.address, 300),
    notes: cleanText(input.notes, 2000),
  };
}

const router = Router();
router.use(requireAuth);

// ---------------- Suppliers ----------------

// GET /api/suppliers?search=
router.get("/suppliers", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const search = searchRegex(req.query.search);
    const filter = search ? { $or: [{ name: search }, { phone: search }, { contactPerson: search }] } : {};
    const suppliers = await db.collection("suppliers").find(filter).sort({ name: 1 }).toArray();

    // Total bought from each supplier, for the list.
    const totals = await db
      .collection("stock_receipts")
      .aggregate([{ $group: { _id: "$supplierId", total: { $sum: "$total" }, receipts: { $sum: 1 }, last: { $max: "$receivedDate" } } }])
      .toArray();
    const totalsById = new Map(totals.map((row) => [String(row._id), row]));
    res.json({
      success: true,
      suppliers: suppliers.map((supplier) => {
        const row = totalsById.get(String(supplier._id));
        return { ...serialize(supplier), totalPurchased: row?.total ?? 0, receiptCount: row?.receipts ?? 0, lastReceived: row?.last ?? null };
      }),
    });
  } catch (error) {
    handleFailure(res, "Could not load suppliers", error);
  }
});

// POST /api/suppliers
router.post("/suppliers", async (req: Request, res: Response) => {
  try {
    const parsed = parseSupplier(req.body);
    if (typeof parsed === "string") return sendError(res, 400, parsed);
    const db = await connectToDatabase();
    const clash = await db.collection("suppliers").findOne({ name: new RegExp(`^${parsed.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (clash) return sendError(res, 409, `A supplier called "${clash.name}" already exists.`);
    const now = new Date();
    const document = { ...parsed, createdAt: now, updatedAt: now };
    const result = await db.collection("suppliers").insertOne(document);
    res.status(201).json({ success: true, message: "Supplier added.", supplier: serialize({ _id: result.insertedId, ...document }) });
  } catch (error) {
    handleFailure(res, "Could not add the supplier", error);
  }
});

// PUT /api/suppliers/:id
router.put("/suppliers/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid supplier ID.");
    const parsed = parseSupplier(req.body);
    if (typeof parsed === "string") return sendError(res, 400, parsed);
    const db = await connectToDatabase();
    const updated = await db.collection("suppliers").findOneAndUpdate(
      { _id: id },
      { $set: { ...parsed, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) return sendError(res, 404, "Supplier not found.");
    await db.collection("stock_receipts").updateMany({ supplierId: String(id) }, { $set: { supplierName: parsed.name } });
    res.json({ success: true, message: "Supplier updated.", supplier: serialize(updated) });
  } catch (error) {
    handleFailure(res, "Could not update the supplier", error);
  }
});

// DELETE /api/suppliers/:id  — only if no stock has been received from them.
router.delete("/suppliers/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid supplier ID.");
    const db = await connectToDatabase();
    const used = await db.collection("stock_receipts").countDocuments({ supplierId: String(id) });
    if (used > 0) return sendError(res, 409, "This supplier has stock receipts and cannot be deleted.");
    const result = await db.collection("suppliers").deleteOne({ _id: id });
    if (result.deletedCount !== 1) return sendError(res, 404, "Supplier not found.");
    res.json({ success: true, message: "Supplier deleted." });
  } catch (error) {
    handleFailure(res, "Could not delete the supplier", error);
  }
});

// ---------------- Stock receipts ----------------

// GET /api/stock-receipts?supplierId=&search=
router.get("/stock-receipts", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const filter: Record<string, unknown> = {};
    const supplierId = cleanText(req.query.supplierId, 40);
    if (supplierId) filter.supplierId = supplierId;
    const search = searchRegex(req.query.search);
    if (search) filter.$or = [{ number: search }, { supplierName: search }, { supplierInvoice: search }, { "items.name": search }];
    const receipts = await db.collection("stock_receipts").find(filter).sort({ receivedDate: -1, createdAt: -1 }).limit(500).toArray();
    res.json({ success: true, receipts: receipts.map(serialize) });
  } catch (error) {
    handleFailure(res, "Could not load stock receipts", error);
  }
});

// POST /api/stock-receipts
// { supplierId, supplierInvoice?, receivedDate?, notes?, updateCostPrices?: boolean,
//   items: [{ productId, quantity, unitCost }] }
router.post("/stock-receipts", async (req: Request, res: Response) => {
  const session = client.startSession();
  try {
    const supplierId = toObjectId(req.body?.supplierId);
    if (!supplierId) return sendError(res, 400, "Choose a supplier.");
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length === 0 || rawItems.length > 200) return sendError(res, 400, "Add between 1 and 200 products.");
    const receivedDate = req.body?.receivedDate ? parseDate(req.body.receivedDate) : new Date();
    if (!receivedDate) return sendError(res, 400, "Invalid received date.");
    const updateCostPrices = req.body?.updateCostPrices !== false;

    const lines = new Map<string, { quantity: number; unitCost: number }>();
    for (const raw of rawItems) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const productId = toObjectId(item.productId);
      if (!productId) return sendError(res, 400, "One of the lines has no product selected.");
      if (!isWholeNumber(item.quantity, 1)) return sendError(res, 400, "Quantities must be whole numbers of at least 1.");
      if (!isMoney(item.unitCost)) return sendError(res, 400, "Unit costs must be zero or more.");
      const key = String(productId);
      if (lines.has(key)) return sendError(res, 400, "The same product is listed twice. Combine it into one line.");
      lines.set(key, { quantity: item.quantity, unitCost: item.unitCost });
    }

    const db = await connectToDatabase();
    const supplier = await db.collection("suppliers").findOne({ _id: supplierId });
    if (!supplier) return sendError(res, 404, "Supplier not found.");
    const user = await currentUserName(db, req);
    const number = await nextDocumentNumber(db, "GRN");
    const now = new Date();
    let saved: Document | null = null;

    await session.withTransaction(async () => {
      const products = db.collection("products");
      const items: Document[] = [];
      for (const [id, line] of lines) {
        const productId = new ObjectId(id);
        const product = await products.findOne({ _id: productId }, { session });
        if (!product) throw new Error(`PRODUCT_NOT_FOUND:${id}`);
        const previousQuantity = Number(product.quantity || 0);
        const newQuantity = previousQuantity + line.quantity;

        await products.updateOne(
          { _id: productId },
          {
            $inc: { quantity: line.quantity },
            $set: { updatedAt: now, ...(updateCostPrices ? { costPrice: line.unitCost } : {}) },
          },
          { session },
        );
        await db.collection("stock_adjustments").insertOne(
          {
            productId,
            productName: product.name,
            sku: product.sku ?? "",
            type: "Stock received",
            quantity: line.quantity,
            previousQuantity,
            newQuantity,
            change: line.quantity,
            reason: `Received from ${supplier.name}`,
            reference: number,
            createdAt: now,
          },
          { session },
        );
        items.push({
          productId: id,
          name: product.name,
          sku: product.sku ?? "",
          quantity: line.quantity,
          unitCost: line.unitCost,
          lineTotal: line.quantity * line.unitCost,
        });
      }

      const document = {
        number,
        supplierId: String(supplierId),
        supplierName: supplier.name,
        supplierInvoice: cleanText(req.body?.supplierInvoice, 80),
        receivedDate,
        items,
        total: items.reduce((sum, item) => sum + Number(item.lineTotal), 0),
        updatedCostPrices: updateCostPrices,
        notes: cleanText(req.body?.notes, 2000),
        createdByName: user.name,
        createdAt: now,
      };
      const result = await db.collection("stock_receipts").insertOne(document, { session });
      saved = { _id: result.insertedId, ...document };
    });

    res.status(201).json({ success: true, message: `Stock received (${number}). Product quantities updated.`, receipt: saved ? serialize(saved) : null });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PRODUCT_NOT_FOUND")) {
      return sendError(res, 404, "One of the products no longer exists. Refresh and try again.");
    }
    handleFailure(res, "Could not record the stock receipt", error);
  } finally {
    await session.endSession();
  }
});

export default router;
