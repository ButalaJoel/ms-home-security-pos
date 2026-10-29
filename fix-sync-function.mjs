import fs from "node:fs";

const file = "./client/src/db/offlineService.ts";
const source = fs.readFileSync(file, "utf8");

const startMarker = "export async function markSaleSynced(";
const start = source.indexOf(startMarker);

if (start < 0) {
  console.error("Could not find markSaleSynced. No changes made.");
  process.exit(1);
}

const nextExport = source.indexOf("\nexport async function ", start + startMarker.length);
const end = nextExport < 0 ? source.length : nextExport;

const replacement = `export async function markSaleSynced(
  operationId: string,
  saleId: string,
  serverSale?: { receiptNumber?: string; subtotal?: number; tax?: number; grandTotal?: number },
): Promise<void> {
  await localDb.transaction(
    "rw",
    localDb.sales,
    localDb.pendingSync,
    async () => {
      await localDb.pendingSync
        .where("operationId")
        .equals(operationId)
        .delete();

      await localDb.sales.update(saleId, {
        syncStatus: "synced",
        syncedAt: new Date().toISOString(),
        ...(serverSale?.receiptNumber ? { receiptNumber: serverSale.receiptNumber } : {}),
        ...(typeof serverSale?.subtotal === "number" ? { subtotal: serverSale.subtotal } : {}),
        ...(typeof serverSale?.tax === "number" ? { taxAmount: serverSale.tax } : {}),
        ...(typeof serverSale?.grandTotal === "number" ? { total: serverSale.grandTotal } : {}),
      });
    },
  );
}
`;

const updated = source.slice(0, start) + replacement + source.slice(end);
const backup = file + ".before-sync-function.bak";

if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
fs.writeFileSync(file, updated, "utf8");

console.log("Updated markSaleSynced and created backup:", backup);
