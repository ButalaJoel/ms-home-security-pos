/**
 * Data backups (admin only).
 *
 * GET  /api/backup/status    when the last backup was taken, and record counts
 * GET  /api/backup/download  one JSON file containing every collection
 * POST /api/backup/restore   replace the data with a backup file (multipart "file")
 *
 * The file uses MongoDB Extended JSON, so IDs and dates restore exactly.
 * Restore runs in a single transaction: either everything is restored or
 * nothing changes. Logins (users) are only restored when explicitly asked,
 * so a restore can never lock the current administrator out.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { BSON, type Document } from "mongodb";
import { client, connectToDatabase } from "../db.js";
import { requireAuth, requireRole } from "../authMiddleware.js";
import { currentUserName, handleFailure, sendError } from "./common.js";

export const BACKUP_COLLECTIONS = [
  "settings",
  "products",
  "stock_adjustments",
  "customers",
  "sales",
  "quotations",
  "jobs",
  "serials",
  "suppliers",
  "stock_receipts",
  "expenses",
  "cashups",
  "activity_log",
  "counters",
  "users",
] as const;

const FORMAT = "ms-home-security-pos-backup";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

async function counts() {
  const db = await connectToDatabase();
  const result: Record<string, number> = {};
  for (const name of BACKUP_COLLECTIONS) {
    result[name] = await db.collection(name).countDocuments();
  }
  return result;
}

const router = Router();
router.use(requireAuth, requireRole("admin"));

// GET /api/backup/status
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const meta = await db.collection<Document & { _id: string }>("meta").findOne({ _id: "backup" });
    res.json({
      success: true,
      lastBackupAt: meta?.lastBackupAt ?? null,
      lastBackupBy: meta?.lastBackupBy ?? "",
      lastRestoreAt: meta?.lastRestoreAt ?? null,
      lastRestoreBy: meta?.lastRestoreBy ?? "",
      counts: await counts(),
    });
  } catch (error) {
    handleFailure(res, "Could not read the backup status", error);
  }
});

// GET /api/backup/download
router.get("/download", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const user = await currentUserName(db, req);
    const now = new Date();
    const collections: Record<string, Document[]> = {};
    for (const name of BACKUP_COLLECTIONS) {
      collections[name] = await db.collection(name).find({}).toArray();
    }
    const backup = {
      format: FORMAT,
      version: 1,
      createdAt: now,
      createdBy: user.name,
      database: db.databaseName,
      collections,
    };

    await db.collection<Document & { _id: string }>("meta").updateOne(
      { _id: "backup" },
      { $set: { lastBackupAt: now, lastBackupBy: user.name } },
      { upsert: true },
    );
    await db.collection("activity_log").insertOne({
      userId: user.id,
      userName: user.name,
      area: "Backups",
      action: "Downloaded a backup",
      method: "GET",
      path: "/api/backup/download",
      entityId: "",
      summary: Object.entries(collections).map(([name, docs]) => `${name}: ${docs.length}`).join(" · "),
      createdAt: now,
    });

    const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ms-pos-backup-${stamp}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(BSON.EJSON.stringify(backup, { relaxed: false }));
  } catch (error) {
    handleFailure(res, "Could not create the backup", error);
  }
});

// POST /api/backup/restore  (multipart: file, includeUsers=true|false)
router.post("/restore", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) return sendError(res, 400, "Choose a backup file.");

  let parsed: Record<string, unknown>;
  try {
    parsed = BSON.EJSON.parse(req.file.buffer.toString("utf8"), { relaxed: true }) as Record<string, unknown>;
  } catch {
    return sendError(res, 400, "That file is not a valid backup.");
  }

  // Accept this app's backups and the older reset-script backups
  // (which store collections at the top level).
  const source = (parsed.format === FORMAT ? parsed.collections : parsed) as Record<string, unknown> | undefined;
  if (!source || typeof source !== "object") return sendError(res, 400, "That file is not a valid backup.");

  const includeUsers = req.body?.includeUsers === "true";
  const toRestore = BACKUP_COLLECTIONS.filter(
    (name) => Array.isArray(source[name]) && (name !== "users" || includeUsers),
  );
  if (toRestore.length === 0) return sendError(res, 400, "The file contains no data this app recognises.");
  if (includeUsers && (source.users as unknown[]).length === 0) {
    return sendError(res, 400, "The backup has no user accounts, so restoring them would lock everyone out.");
  }

  const session = client.startSession();
  try {
    const db = await connectToDatabase();
    const user = await currentUserName(db, req);
    const restored: Record<string, number> = {};

    await session.withTransaction(async () => {
      for (const name of toRestore) {
        const documents = source[name] as Document[];
        await db.collection(name).deleteMany({}, { session });
        if (documents.length > 0) await db.collection(name).insertMany(documents, { session });
        restored[name] = documents.length;
      }
    });

    await db.collection<Document & { _id: string }>("meta").updateOne(
      { _id: "backup" },
      { $set: { lastRestoreAt: new Date(), lastRestoreBy: user.name } },
      { upsert: true },
    );

    res.json({
      success: true,
      message: `Backup restored${parsed.createdAt ? ` from ${new Date(parsed.createdAt as Date).toLocaleString("en-GB", { timeZone: "Africa/Kampala" })}` : ""}.`,
      restored,
      usersRestored: includeUsers,
    });
  } catch (error) {
    handleFailure(res, "Restore failed. Nothing was changed", error);
  } finally {
    await session.endSession();
  }
});

export default router;
