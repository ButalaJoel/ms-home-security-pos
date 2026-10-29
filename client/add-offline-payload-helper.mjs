const fs = await import("node:fs");

const path = "src/db/offlineService.ts";
const source = fs.readFileSync(path, "utf8");

if (source.includes("recordLocalSaleWithPayload")) {
  console.log("The payload-aware helper already exists.");
  process.exit(0);
}

const marker = "// Retrieve sales stored on this computer.";
if (!source.includes(marker)) {
  throw new Error("Could not locate the local-sales section. No changes made.");
}

const addition = `// Record a pending sale with the exact server request used for retries.
export async function recordLocalSaleWithPayload(
  sale: LocalSale,
  requestPayload: Record<string, unknown>,
): Promise<void> {
  const pendingSale: LocalSale = {
    ...sale,
    requestPayload,
    syncStatus: "pending",
  };

  await localDb.transaction(
    "rw",
    localDb.sales,
    localDb.pendingSync,
    async () => {
      await localDb.sales.put(pendingSale);

      await localDb.pendingSync.put({
        operationId: \`sale:\${pendingSale.id}\`,
        operationType: "sale",
        recordId: pendingSale.id,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    },
  );
}

`;

fs.copyFileSync(path, path + ".before-payload-helper.bak");
fs.writeFileSync(path, source.replace(marker, addition + marker), "utf8");

console.log("Added payload-aware offline sale helper.");
console.log("Backup created.");
