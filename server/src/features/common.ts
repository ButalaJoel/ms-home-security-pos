/**
 * Shared helpers for the feature routers (quotations, jobs, warranties,
 * suppliers, expenses, payments and the activity log).
 */
import type { Request, Response } from "express";
import { ObjectId, type ClientSession, type Db, type Document } from "mongodb";

export const PAYMENT_METHODS = ["Cash", "Mobile Money", "Bank transfer", "Card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function cleanText(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function toObjectId(value: unknown): ObjectId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && ObjectId.isValid(raw) ? new ObjectId(raw) : null;
}

export function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

export function isWholeNumber(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

/** Accepts "YYYY-MM-DD" or a full ISO string. Returns null when invalid. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T12:00:00+03:00`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Turns MongoDB's _id into the string "id" the React pages use. */
export function serialize<T extends Document>(doc: T) {
  return { ...doc, id: String(doc._id), _id: String(doc._id) };
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function searchRegex(value: unknown): RegExp | null {
  const text = cleanText(value, 100);
  return text ? new RegExp(escapeRegex(text), "i") : null;
}

/** Kampala calendar day (YYYY-MM-DD) for a date. The business runs on UTC+3. */
export function kampalaDayKey(value: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/** Start and end (exclusive) of a Kampala calendar day, as UTC Dates. */
export function kampalaDayRange(dayKey: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const start = new Date(`${dayKey}T00:00:00+03:00`);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Atomically reserves the next number in a sequence, e.g. QUO-2026-0001.
 * Numbers never repeat, even when two people save at the same moment.
 */
export async function nextDocumentNumber(
  db: Db,
  prefix: string,
  session?: ClientSession,
): Promise<string> {
  const safePrefix = (prefix || "DOC").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) || "DOC";
  const year = kampalaDayKey().slice(0, 4);
  const key = `${safePrefix}-${year}`;
  const counter = await db
    .collection<{ _id: string; value: number }>("counters")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after", ...(session ? { session } : {}) },
    );
  const value = counter?.value ?? 1;
  return `${key}-${String(value).padStart(4, "0")}`;
}

/** Name of the signed-in user, used for "created by" fields. */
export async function currentUserName(db: Db, req: Request): Promise<{ id: string; name: string }> {
  const id = req.authUser?.id ?? "";
  if (!id || !ObjectId.isValid(id)) return { id, name: "Unknown user" };
  const user = await db
    .collection("users")
    .findOne({ _id: new ObjectId(id) }, { projection: { name: 1 } });
  return { id, name: typeof user?.name === "string" ? user.name : "Unknown user" };
}

export function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, message });
}

export function handleFailure(res: Response, label: string, error: unknown): void {
  console.error(`${label}:`, error instanceof Error ? error.message : error);
  if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
    sendError(res, 409, "That record already exists.");
    return;
  }
  sendError(res, 500, `${label}. Please try again.`);
}
