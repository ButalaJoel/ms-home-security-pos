/**
 * Serial numbers and warranties.
 *
 * Records which camera / DVR / device serial went to which customer and when
 * its warranty ends, so a warranty claim is a single search.
 * Serial numbers are unique (case-insensitive).
 */
import { Router, type Request, type Response } from "express";
import type { Document } from "mongodb";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import {
  cleanText,
  currentUserName,
  handleFailure,
  isWholeNumber,
  parseDate,
  searchRegex,
  sendError,
  serialize,
  toObjectId,
} from "./common.js";

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

function normaliseSerial(value: unknown): string {
  return cleanText(value, 100).replace(/\s+/g, "").toUpperCase();
}

/** Adds the computed warranty status for the app. */
function withStatus(doc: Document) {
  const ends = doc.warrantyEndsAt ? new Date(doc.warrantyEndsAt) : null;
  const now = Date.now();
  let warrantyStatus = "No warranty";
  if (ends) {
    const daysLeft = Math.ceil((ends.getTime() - now) / (24 * 60 * 60 * 1000));
    warrantyStatus = daysLeft < 0 ? "Expired" : daysLeft <= 30 ? "Expiring soon" : "Active";
  }
  return { ...serialize(doc), warrantyStatus };
}

type SharedFields = {
  productId: string | null;
  productName: string;
  customerName: string;
  customerPhone: string;
  saleReference: string;
  installDate: Date;
  warrantyMonths: number;
  warrantyEndsAt: Date | null;
  notes: string;
};

async function parseShared(body: Record<string, unknown>): Promise<SharedFields | string> {
  const productName = cleanText(body.productName, 200);
  if (!productName) return "Enter the product name or model.";
  const customerName = cleanText(body.customerName, 200);
  if (!customerName) return "Enter the customer name.";
  const installDate = body.installDate ? parseDate(body.installDate) : new Date();
  if (!installDate) return "Invalid sale / installation date.";
  const warrantyMonths = body.warrantyMonths ?? 6;
  if (!isWholeNumber(warrantyMonths) || warrantyMonths > 120) return "Warranty must be between 0 and 120 months.";
  const productObjectId = toObjectId(body.productId);
  return {
    productId: productObjectId ? String(productObjectId) : null,
    productName,
    customerName,
    customerPhone: cleanText(body.customerPhone, 60),
    saleReference: cleanText(body.saleReference, 60),
    installDate,
    warrantyMonths,
    warrantyEndsAt: warrantyMonths > 0 ? addMonths(installDate, warrantyMonths) : null,
    notes: cleanText(body.notes, 2000),
  };
}

const router = Router();
router.use(requireAuth);

// GET /api/serials?search=&status=Active|Expiring soon|Expired
router.get("/", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const filter: Record<string, unknown> = {};
    const search = searchRegex(req.query.search);
    if (search) {
      filter.$or = [
        { serialNumber: search }, { customerName: search }, { customerPhone: search },
        { productName: search }, { saleReference: search },
      ];
    }
    const status = cleanText(req.query.status, 20);
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (status === "Expired") filter.warrantyEndsAt = { $lt: now };
    if (status === "Expiring soon") filter.warrantyEndsAt = { $gte: now, $lte: soon };
    if (status === "Active") filter.warrantyEndsAt = { $gt: soon };

    const serials = await db.collection("serials").find(filter).sort({ installDate: -1 }).limit(1000).toArray();
    res.json({ success: true, serials: serials.map(withStatus) });
  } catch (error) {
    handleFailure(res, "Could not load serial numbers", error);
  }
});

// POST /api/serials  { serialNumbers: string[], productName, customerName, ... }
// Registers one or many serials sharing the same product / customer / dates.
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawSerials = Array.isArray(body.serialNumbers) ? body.serialNumbers : [body.serialNumber];
    const serialNumbers = Array.from(new Set(rawSerials.map(normaliseSerial).filter(Boolean)));
    if (serialNumbers.length === 0) return sendError(res, 400, "Enter at least one serial number.");
    if (serialNumbers.length > 200) return sendError(res, 400, "Register up to 200 serial numbers at a time.");

    const shared = await parseShared(body);
    if (typeof shared === "string") return sendError(res, 400, shared);

    const db = await connectToDatabase();
    const collection = db.collection("serials");
    const existing = await collection
      .find({ serialNumber: { $in: serialNumbers } }, { projection: { serialNumber: 1, customerName: 1 } })
      .toArray();
    if (existing.length > 0) {
      const list = existing.map((item) => `${item.serialNumber} (${item.customerName})`).join(", ");
      return sendError(res, 409, `Already registered: ${list}.`);
    }

    const user = await currentUserName(db, req);
    const now = new Date();
    const documents = serialNumbers.map((serialNumber) => ({
      serialNumber,
      ...shared,
      createdByName: user.name,
      createdAt: now,
      updatedAt: now,
    }));
    const result = await collection.insertMany(documents);
    const saved = documents.map((doc, index) => withStatus({ _id: result.insertedIds[index], ...doc }));
    res.status(201).json({ success: true, message: `${saved.length} serial number(s) registered.`, serials: saved });
  } catch (error) {
    handleFailure(res, "Could not register the serial numbers", error);
  }
});

// PUT /api/serials/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid record ID.");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const serialNumber = normaliseSerial(body.serialNumber);
    if (!serialNumber) return sendError(res, 400, "Enter the serial number.");
    const shared = await parseShared(body);
    if (typeof shared === "string") return sendError(res, 400, shared);

    const db = await connectToDatabase();
    const clash = await db.collection("serials").findOne({ serialNumber, _id: { $ne: id } });
    if (clash) return sendError(res, 409, `Serial ${serialNumber} is already registered to ${clash.customerName}.`);
    const user = await currentUserName(db, req);
    const updated = await db.collection("serials").findOneAndUpdate(
      { _id: id },
      { $set: { serialNumber, ...shared, updatedByName: user.name, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) return sendError(res, 404, "Record not found.");
    res.json({ success: true, message: "Serial number updated.", serial: withStatus(updated) });
  } catch (error) {
    handleFailure(res, "Could not update the serial number", error);
  }
});

// DELETE /api/serials/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid record ID.");
    const db = await connectToDatabase();
    const result = await db.collection("serials").deleteOne({ _id: id });
    if (result.deletedCount !== 1) return sendError(res, 404, "Record not found.");
    res.json({ success: true, message: "Serial number deleted." });
  } catch (error) {
    handleFailure(res, "Could not delete the serial number", error);
  }
});

export default router;
