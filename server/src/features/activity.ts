/**
 * Activity log: who created, changed or deleted what, and when.
 *
 * A single middleware watches every successful POST / PUT / PATCH / DELETE
 * request and writes one entry to the "activity_log" collection, so existing
 * endpoints (products, stock, sales, settings, users) are covered without
 * changing them. Request bodies are summarised, never stored in full, and
 * password fields are never recorded.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { ObjectId, type Db } from "mongodb";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import { cleanText, handleFailure, searchRegex, serialize } from "./common.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Ordered most specific first. The first match describes the request.
const DESCRIPTIONS: { pattern: RegExp; method?: string; area: string; action: string }[] = [
  { pattern: /^\/api\/auth\/login$/, area: "Account", action: "Signed in" },
  { pattern: /^\/api\/auth\/logout$/, area: "Account", action: "Signed out" },
  { pattern: /^\/api\/auth\//, area: "Account", action: "Changed account" },
  { pattern: /^\/api\/users/, method: "POST", area: "Users", action: "Created user" },
  { pattern: /^\/api\/users/, area: "Users", action: "Changed user" },
  { pattern: /^\/api\/settings\/logo$/, area: "Settings", action: "Uploaded logo" },
  { pattern: /^\/api\/settings/, area: "Settings", action: "Changed settings" },
  { pattern: /^\/api\/products\/[^/]+\/adjustments$/, area: "Inventory", action: "Adjusted stock" },
  { pattern: /^\/api\/products\/[^/]+\/photo$/, method: "DELETE", area: "Products", action: "Removed product photo" },
  { pattern: /^\/api\/products\/[^/]+\/photo$/, area: "Products", action: "Uploaded product photo" },
  { pattern: /^\/api\/products$/, method: "POST", area: "Products", action: "Created product" },
  { pattern: /^\/api\/products\//, area: "Products", action: "Edited product" },
  { pattern: /^\/api\/sales\/[^/]+\/payments$/, area: "Payments", action: "Recorded payment" },
  { pattern: /^\/api\/sales$/, method: "POST", area: "Sales", action: "Completed sale" },
  { pattern: /^\/api\/customers$/, method: "POST", area: "Customers", action: "Added customer" },
  { pattern: /^\/api\/customers\//, area: "Customers", action: "Edited customer" },
  { pattern: /^\/api\/quotations\/[^/]+\/converted$/, area: "Quotations", action: "Converted quotation to sale" },
  { pattern: /^\/api\/quotations\/[^/]+\/duplicate$/, area: "Quotations", action: "Duplicated quotation" },
  { pattern: /^\/api\/quotations\/[^/]+\/status$/, area: "Quotations", action: "Changed quotation status" },
  { pattern: /^\/api\/quotations$/, method: "POST", area: "Quotations", action: "Created quotation" },
  { pattern: /^\/api\/quotations\//, method: "DELETE", area: "Quotations", action: "Deleted quotation" },
  { pattern: /^\/api\/quotations\//, area: "Quotations", action: "Edited quotation" },
  { pattern: /^\/api\/jobs$/, method: "POST", area: "Installation jobs", action: "Created job" },
  { pattern: /^\/api\/jobs\//, method: "DELETE", area: "Installation jobs", action: "Deleted job" },
  { pattern: /^\/api\/jobs\//, area: "Installation jobs", action: "Updated job" },
  { pattern: /^\/api\/serials$/, method: "POST", area: "Warranties", action: "Registered serial numbers" },
  { pattern: /^\/api\/serials\//, method: "DELETE", area: "Warranties", action: "Deleted serial number" },
  { pattern: /^\/api\/serials\//, area: "Warranties", action: "Edited serial number" },
  { pattern: /^\/api\/suppliers$/, method: "POST", area: "Suppliers", action: "Added supplier" },
  { pattern: /^\/api\/suppliers\//, method: "DELETE", area: "Suppliers", action: "Deleted supplier" },
  { pattern: /^\/api\/suppliers\//, area: "Suppliers", action: "Edited supplier" },
  { pattern: /^\/api\/stock-receipts/, area: "Inventory", action: "Received stock from supplier" },
  { pattern: /^\/api\/expenses$/, method: "POST", area: "Expenses", action: "Recorded expense" },
  { pattern: /^\/api\/expenses\//, method: "DELETE", area: "Expenses", action: "Deleted expense" },
  { pattern: /^\/api\/expenses\//, area: "Expenses", action: "Edited expense" },
  { pattern: /^\/api\/cashups/, area: "Cash-up", action: "Closed the day (cash-up)" },
];

// Body fields worth showing in the log, in priority order.
const SUMMARY_FIELDS = [
  "number", "name", "customerName", "customer", "description", "serialNumbers", "serialNumber",
  "type", "quantity", "amount", "status", "reason", "reference", "sku", "sellingPrice",
  "costPrice", "paymentMethod", "amountPaid", "technician", "category", "email", "role", "date",
];
const SECRET = /pass|secret|token|key/i;

function describe(method: string, path: string) {
  const match = DESCRIPTIONS.find(
    (entry) => entry.pattern.test(path) && (!entry.method || entry.method === method),
  );
  return match ?? { area: "Other", action: `${method} ${path}` };
}

function summarise(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const record = body as Record<string, unknown>;
  const parts: string[] = [];
  for (const field of SUMMARY_FIELDS) {
    if (SECRET.test(field) || !(field in record)) continue;
    const value = record[field];
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      parts.push(`${field}: ${value.length} item(s)`);
    } else if (typeof value === "object") {
      continue;
    } else {
      parts.push(`${field}: ${String(value).slice(0, 80)}`);
    }
    if (parts.length >= 5) break;
  }
  if (Array.isArray(record.items)) parts.push(`${record.items.length} line item(s)`);
  return parts.join(" · ");
}

const nameCache = new Map<string, { name: string; at: number }>();

async function userName(db: Db, id: string): Promise<string> {
  const cached = nameCache.get(id);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.name;
  if (!ObjectId.isValid(id)) return "Unknown user";
  const user = await db.collection("users").findOne({ _id: new ObjectId(id) }, { projection: { name: 1 } });
  const name = typeof user?.name === "string" ? user.name : "Unknown user";
  nameCache.set(id, { name, at: Date.now() });
  return name;
}

/** Register before the routes. Logs after the response has been sent. */
export function activityLogger(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method) || !req.path.startsWith("/api/")) {
    next();
    return;
  }

  const path = req.path.replace(/\/+$/, "");
  // Capture the summary now; the body is already parsed by express.json().
  const startedAt = new Date();

  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const userId = req.authUser?.id ?? req.session?.userId ?? "";
    if (!userId) return;
    const { area, action } = describe(req.method, path);
    const entityId = path.split("/")[3] ?? "";
    void (async () => {
      try {
        const db = await connectToDatabase();
        await db.collection("activity_log").insertOne({
          userId,
          userName: await userName(db, userId),
          area,
          action,
          method: req.method,
          path,
          entityId: ObjectId.isValid(entityId) ? entityId : "",
          summary: summarise(req.body),
          createdAt: startedAt,
        });
      } catch (error) {
        console.error("Could not write activity log:", error instanceof Error ? error.message : error);
      }
    })();
  });

  next();
}

const router = Router();
router.use(requireAuth);

// GET /api/activity?search=&area=&user=&limit=
router.get("/", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const filter: Record<string, unknown> = {};
    const area = cleanText(req.query.area, 60);
    if (area) filter.area = area;
    const userId = cleanText(req.query.user, 40);
    if (userId) filter.userId = userId;
    const search = searchRegex(req.query.search);
    if (search) filter.$or = [{ action: search }, { summary: search }, { userName: search }];
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);

    const entries = await db
      .collection("activity_log")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    const areas = await db.collection("activity_log").distinct("area");
    res.json({ success: true, entries: entries.map(serialize), areas: areas.sort() });
  } catch (error) {
    handleFailure(res, "Could not load the activity log", error);
  }
});

export default router;
