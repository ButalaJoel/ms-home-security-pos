/**
 * Orders placed on the public website.
 *
 * Payment A: the customer sends an order without paying. Staff call to confirm
 * the items, price and delivery, the customer pays by Mobile Money or on
 * delivery, and staff move the order along: received → confirmed → paid →
 * delivered (or cancelled).
 *
 * Public (no login):
 *   POST /api/public/orders               place an order
 *   GET  /api/public/orders/track         status for an order number + phone
 * Staff (login):
 *   GET   /api/website-orders             list, filter by status, search
 *   GET   /api/website-orders/summary     how many new orders (for the badge)
 *   PATCH /api/website-orders/:id         change status, add a staff note
 *
 * Prices are never sent to the website. Each order keeps the POS selling price
 * at the time of ordering, for staff only.
 */
import { Router, type Request, type Response } from "express";
import { layeredLimit } from "../rateLimits.js";
import type { Document } from "mongodb";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import {
  cleanText,
  currentUserName,
  escapeRegex,
  handleFailure,
  nextDocumentNumber,
  sendError,
  serialize,
  toObjectId,
} from "./common.js";

export const ORDER_STATUSES = ["received", "confirmed", "paid", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const MAX_ITEMS = 30;
const MAX_QUANTITY = 999;

/** Ugandan mobile numbers: 07XX XXX XXX, 2567XX XXX XXX or +2567XX XXX XXX (also 03XX landlines). */
export function normalisePhone(value: unknown): string {
  const digits = cleanText(value, 40).replace(/\D/g, "");
  if (/^0[37]\d{8}$/.test(digits)) return "256" + digits.slice(1);
  if (/^256[37]\d{8}$/.test(digits)) return digits;
  return "";
}

/** "256772123456" → "+256 772 123 456" */
function formatPhone(normalised: string): string {
  return `+${normalised.slice(0, 3)} ${normalised.slice(3, 6)} ${normalised.slice(6, 9)} ${normalised.slice(9)}`;
}

// A real customer places one or two orders; this stops scripts filling the inbox.
const placeLimiter = layeredLimit({
  windowMs: 10 * 60 * 1000,
  perVisitor: 5,
  perConnection: 60,
  message: "Too many orders from this connection. Please wait a few minutes or WhatsApp us.",
});

const trackLimiter = layeredLimit({
  windowMs: 10 * 60 * 1000,
  perVisitor: 30,
  perConnection: 600,
  message: "Too many tries. Please wait a few minutes and try again.",
});

const router = Router();

// ---------------- Public ----------------

// POST /api/public/orders
// { customer: { name, phone, email?, location }, delivery: "delivery" | "pickup", notes?, items: [{ productId, quantity }], website? }
router.post("/api/public/orders", placeLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Spam trap: the website hides this field, so only bots fill it. Pretend it worked.
    if (cleanText(body.website, 200)) return res.json({ success: true, reference: "WEB-0000-0000" });

    const customer = (body.customer ?? {}) as Record<string, unknown>;
    const name = cleanText(customer.name, 120);
    const phone = normalisePhone(customer.phone);
    const email = cleanText(customer.email, 200);
    const location = cleanText(customer.location, 200);
    const delivery = body.delivery === "pickup" ? "pickup" : "delivery";
    const notes = cleanText(body.notes, 1000);

    if (name.length < 2) return sendError(res, 400, "Enter your name.");
    if (!phone) return sendError(res, 400, "Enter a Ugandan phone number, like 0772 123 456.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res, 400, "Check your email address, or leave it empty.");
    if (delivery === "delivery" && location.length < 2) return sendError(res, 400, "Tell us where to deliver (town or area).");

    if (!Array.isArray(body.items) || body.items.length === 0) return sendError(res, 400, "Your cart is empty.");
    if (body.items.length > MAX_ITEMS) return sendError(res, 400, `Send at most ${MAX_ITEMS} different items per order.`);

    // Merge repeated products and check quantities.
    const wanted = new Map<string, number>();
    for (const raw of body.items) {
      const row = (raw ?? {}) as Record<string, unknown>;
      const id = toObjectId(row.productId);
      const quantity = Number(row.quantity);
      if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        return sendError(res, 400, "One of the items in your cart is not valid. Please refresh the page and try again.");
      }
      wanted.set(String(id), Math.min(MAX_QUANTITY, (wanted.get(String(id)) ?? 0) + quantity));
    }

    const db = await connectToDatabase();
    const ids = [...wanted.keys()].map((id) => toObjectId(id)!);
    const products = await db
      .collection("products")
      .find(
        { _id: { $in: ids }, active: { $ne: false }, showOnWebsite: { $ne: false } },
        { projection: { name: 1, sku: 1, model: 1, sellingPrice: 1 } },
      )
      .toArray();
    if (products.length !== ids.length) {
      return sendError(res, 400, "Some items in your cart are no longer available. Please refresh the page and check your cart.");
    }

    const items = products.map((product) => {
      const quantity = wanted.get(String(product._id)) ?? 1;
      const unitPrice = Number(product.sellingPrice ?? 0);
      return {
        productId: String(product._id),
        name: String(product.name ?? ""),
        sku: String(product.sku ?? ""),
        model: typeof product.model === "string" ? product.model : "",
        quantity,
        unitPrice, // staff only; the website never sees it
      };
    });
    const estimatedTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    const now = new Date();
    const number = await nextDocumentNumber(db, "WEB");
    await db.collection("website_orders").insertOne({
      number,
      status: "received" satisfies OrderStatus,
      customer: { name, phone, email, location },
      delivery,
      notes,
      items,
      estimatedTotal,
      history: [{ status: "received", at: now, by: "Website" }],
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ success: true, reference: number });
  } catch (error) {
    handleFailure(res, "Could not send your order", error);
  }
});

// GET /api/public/orders/track?reference=WEB-2026-0001&phone=0772123456
router.get("/api/public/orders/track", trackLimiter, async (req: Request, res: Response) => {
  try {
    const reference = cleanText(req.query.reference, 30).toUpperCase();
    const phone = normalisePhone(req.query.phone);
    if (!/^WEB-\d{4}-\d{4,}$/.test(reference) || !phone) {
      return sendError(res, 400, "Enter your order number and the phone number you used.");
    }

    const db = await connectToDatabase();
    const order = await db.collection("website_orders").findOne(
      { number: reference, "customer.phone": phone },
      { projection: { number: 1, status: 1, delivery: 1, items: 1, history: 1, createdAt: 1 } },
    );
    // Same message whether the number or the phone is wrong, so nobody can guess orders.
    if (!order) return sendError(res, 404, "We couldn't find an order with that number and phone. Check both, or WhatsApp us.");

    res.set("Cache-Control", "no-store");
    res.json({
      success: true,
      order: {
        reference: order.number,
        status: order.status,
        delivery: order.delivery,
        createdAt: order.createdAt,
        items: (order.items as Document[]).map((item) => ({ name: item.name, quantity: item.quantity })),
        history: (order.history as Document[]).map((step) => ({ status: step.status, at: step.at })),
      },
    });
  } catch (error) {
    handleFailure(res, "Could not look up your order", error);
  }
});

// ---------------- Staff ----------------

// GET /api/website-orders?status=received&search=
router.get("/api/website-orders", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const filter: Document = {};
    const status = cleanText(req.query.status, 20);
    if ((ORDER_STATUSES as readonly string[]).includes(status)) filter.status = status;
    const search = cleanText(req.query.search, 100);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      const digits = search.replace(/\D/g, "");
      filter.$or = [
        { number: pattern },
        { "customer.name": pattern },
        { "items.name": pattern },
        ...(digits.length >= 4 ? [{ "customer.phone": new RegExp(escapeRegex(digits.replace(/^0/, ""))) }] : []),
      ];
    }
    const orders = await db.collection("website_orders").find(filter).sort({ createdAt: -1 }).limit(200).toArray();
    res.json({
      success: true,
      orders: orders.map((order) => ({ ...serialize(order), customer: { ...order.customer, phoneDisplay: formatPhone(String(order.customer?.phone ?? "")) } })),
    });
  } catch (error) {
    handleFailure(res, "Could not load website orders", error);
  }
});

// GET /api/website-orders/summary
router.get("/api/website-orders/summary", requireAuth, async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const received = await db.collection("website_orders").countDocuments({ status: "received" });
    res.json({ success: true, received });
  } catch (error) {
    handleFailure(res, "Could not count website orders", error);
  }
});

// PATCH /api/website-orders/:id  { status?, note? }
router.patch("/api/website-orders/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid order.");
    const status = cleanText(req.body?.status, 20);
    const note = cleanText(req.body?.note, 1000);
    if (status && !(ORDER_STATUSES as readonly string[]).includes(status)) return sendError(res, 400, "Unknown status.");
    if (!status && !note) return sendError(res, 400, "Nothing to change.");

    const db = await connectToDatabase();
    const order = await db.collection("website_orders").findOne({ _id: id }, { projection: { status: 1 } });
    if (!order) return sendError(res, 404, "Order not found.");

    const user = await currentUserName(db, req);
    const now = new Date();
    const changesStatus = status && status !== order.status;
    const update: Document = { $set: { updatedAt: now } };
    if (changesStatus) update.$set.status = status;
    if (changesStatus || note) {
      update.$push = { history: { status: changesStatus ? status : order.status, at: now, by: user.name, ...(note ? { note } : {}) } };
    }

    const updated = await db.collection("website_orders").findOneAndUpdate({ _id: id }, update, { returnDocument: "after" });
    res.json({ success: true, message: changesStatus ? "Order updated." : "Note added.", order: updated ? serialize(updated) : null });
  } catch (error) {
    handleFailure(res, "Could not update the order", error);
  }
});

export default router;
