/**
 * The business details printed at the top of receipts, invoices and quotations.
 *
 * Each sale and quotation keeps a copy of these details from the moment it was made,
 * so renaming the business or changing its logo, phones or address in Settings never
 * changes documents that were already issued. Payment instructions are deliberately
 * NOT copied: a customer paying an old balance should see today's MoMo and bank details.
 */
import type { Db, Document } from "mongodb";

export type BusinessSnapshot = {
  name: string;
  phone: string;
  phone2: string;
  phone3: string;
  email: string;
  address: string;
  logoUrl: string;
  tinNumber: string;
  warrantyDuration: string;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function snapshotFromSettings(settings: Document | null | undefined): BusinessSnapshot {
  const s = settings ?? {};
  return {
    name: text(s.businessName),
    phone: text(s.phone) || text(s.businessPhone),
    phone2: text(s.phone2) || text(s.alternatePhone),
    phone3: text(s.phone3) || text(s.additionalPhone),
    email: text(s.email) || text(s.businessEmail),
    address: text(s.address) || text(s.businessAddress),
    logoUrl: text(s.logoUrl),
    tinNumber: text(s.tinNumber) || text(s.tin),
    warrantyDuration: text(s.warrantyDuration),
  };
}

export async function currentBusinessSnapshot(db: Db): Promise<BusinessSnapshot> {
  const settings = await db.collection<Document & { _id: string }>("settings").findOne({ _id: "business" });
  return snapshotFromSettings(settings);
}

/**
 * One-time database update for the rename to MS Security Systems Ltd.
 *
 *  1. Every existing sale and quotation without a snapshot is stamped with the business
 *     details as they are right now (the old name), so old documents keep it.
 *  2. Then the business name in Settings becomes MS Security Systems Ltd.
 *
 * A marker in Settings makes sure this runs only once, even though it is called on
 * every server start. Staff can still change the name in Settings afterwards.
 */
export const NEW_BUSINESS_NAME = "MS Security Systems Ltd";
const MIGRATION_MARKER = "renamedToMsSecuritySystemsAt";

export async function runRenameMigration(db: Db): Promise<void> {
  const settingsCollection = db.collection<Document & { _id: string }>("settings");
  const settings = await settingsCollection.findOne({ _id: "business" });
  if (settings?.[MIGRATION_MARKER]) return;

  const snapshot = snapshotFromSettings(settings);
  // Nothing configured yet: fall back to the name printed on documents until now.
  if (!snapshot.name) snapshot.name = "MS Home Security Solutions";

  const missing = { businessSnapshot: { $exists: false } };
  const sales = await db.collection("sales").updateMany(missing, { $set: { businessSnapshot: snapshot } });
  const quotes = await db.collection("quotations").updateMany(missing, { $set: { businessSnapshot: snapshot } });

  await settingsCollection.updateOne(
    { _id: "business" },
    { $set: { businessName: NEW_BUSINESS_NAME, [MIGRATION_MARKER]: new Date(), updatedAt: new Date() } },
    { upsert: true },
  );
  console.log(
    `Rename: kept "${snapshot.name}" on ${sales.modifiedCount} sale(s) and ${quotes.modifiedCount} quotation(s); business name is now "${NEW_BUSINESS_NAME}".`,
  );
}
