/**
 * Clears the dummy / test data before the app goes live.
 *
 *   npm run reset:test-data              -> shows what WOULD be deleted (safe)
 *   npm run reset:test-data -- --confirm -> backs everything up, then deletes
 *
 * Kept: users (logins), settings (business details, logo), sessions.
 * Deleted: products, sales, customers, stock history, quotations, jobs,
 * serial numbers, suppliers, stock receipts, expenses, cash-ups,
 * the activity log and document-number counters (so numbering restarts at 0001).
 *
 * A full backup of every collection (including the kept ones) is written to
 * server/backups/ first. If the backup fails, nothing is deleted.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BSON } from "mongodb";
import { client, connectToDatabase } from "./db.js";

const TO_CLEAR = [
  "products",
  "sales",
  "customers",
  "stock_adjustments",
  "quotations",
  "jobs",
  "serials",
  "suppliers",
  "stock_receipts",
  "expenses",
  "cashups",
  "activity_log",
  "counters",
];
const TO_KEEP = ["users", "settings"];

async function main() {
  const confirmed = process.argv.includes("--confirm");
  const db = await connectToDatabase();
  const existing = new Set((await db.listCollections().toArray()).map((info) => info.name));

  console.log(`\nDatabase: ${db.databaseName}`);
  console.log("Will be CLEARED:");
  for (const name of TO_CLEAR) {
    const count = existing.has(name) ? await db.collection(name).countDocuments() : 0;
    console.log(`  - ${name.padEnd(18)} ${count} record(s)`);
  }
  console.log("Will be KEPT:");
  for (const name of TO_KEEP) {
    const count = existing.has(name) ? await db.collection(name).countDocuments() : 0;
    console.log(`  - ${name.padEnd(18)} ${count} record(s)`);
  }

  if (!confirmed) {
    console.log("\nDry run only. Nothing was changed.");
    console.log("To back up and delete, run:  npm run reset:test-data -- --confirm\n");
    return;
  }

  // 1. Back up every collection (kept and cleared) to one file.
  const backup: Record<string, unknown[]> = {};
  for (const name of [...TO_CLEAR, ...TO_KEEP]) {
    backup[name] = existing.has(name) ? await db.collection(name).find({}).toArray() : [];
  }
  const folder = path.resolve(process.cwd(), "backups");
  await mkdir(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(folder, `backup-before-reset-${stamp}.json`);
  await writeFile(file, BSON.EJSON.stringify(backup, undefined, 2, { relaxed: false }), "utf8");
  console.log(`\nBackup saved: ${file}`);

  // 2. Delete the test data.
  for (const name of TO_CLEAR) {
    if (!existing.has(name)) continue;
    const result = await db.collection(name).deleteMany({});
    console.log(`Cleared ${name}: ${result.deletedCount} record(s)`);
  }
  console.log("\nDone. Users and settings were not touched.\n");
}

main()
  .catch((error) => {
    console.error("Reset failed. If it failed before 'Backup saved', nothing was deleted.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.close());
