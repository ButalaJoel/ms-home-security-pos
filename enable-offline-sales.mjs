import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  server: path.join(root, "server/src/index.ts"),
  pos: path.join(root, "client/src/pages/POSPage.tsx"),
  db: path.join(root, "client/src/db/database.ts"),
  service: path.join(root, "client/src/db/offlineService.ts"),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${name} file: ${file}. Run from the project root.`);
  }
}

const original = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")])
);
const changed = { ...original };

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0 || source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Could not uniquely match ${label}. No files have been changed.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

try {
  // 1. Store the original request so a pending sale can be retried.
  changed.db = replaceOnce(
    changed.db,
    '  syncStatus: "pending" | "synced" | "failed";\n  // Timestamp indicating when the server confirmed synchronization.\n  syncedAt?: string;\n',
    '  syncStatus: "pending" | "synced" | "failed";\n  requestPayload?: Record<string, unknown>;\n  // Timestamp indicating when the server confirmed synchronization.\n  syncedAt?: string;\n',
    "LocalSale request payload"
  );

  // 2. Add synchronization helpers.
  changed.service = replaceOnce(
    changed.service,
    'export async function markSaleSynced(operationId: string, saleId: string): Promise<void> {\n  await localDb.transaction("rw", localDb.sales, localDb.pendingSync, async () => {\n    await localDb.pendingSync.where("operationId").equals(operationId).delete();\n    await localDb.sales.update(saleId, {\n      syncStatus: "synced",\n      syncedAt: new Date().toISOString(),\n    });\n  });\n}\n',
    `export async function markSaleSynced(
  operationId: string,
  saleId: string,
  serverSale?: { receiptNumber?: string; subtotal?: number; tax?: number; grandTotal?: number },
): Promise<void> {
  await localDb.transaction("rw", localDb.sales, localDb.pendingSync, async () => {
    await localDb.pendingSync.where("operationId").equals(operationId).delete();
    await localDb.sales.update(saleId, {
      syncStatus: "synced",
      syncedAt: new Date().toISOString(),
      ...(serverSale?.receiptNumber ? { receiptNumber: serverSale.receiptNumber } : {}),
      ...(typeof serverSale?.subtotal === "number" ? { subtotal: serverSale.subtotal } : {}),
      ...(typeof serverSale?.tax === "number" ? { taxAmount: serverSale.tax } : {}),
      ...(typeof serverSale?.grandTotal === "number" ? { total: serverSale.grandTotal } : {}),
    });
  });
}

export async function syncPendingSales(
  sendSale: (payload: Record<string, unknown>) => Promise<{
    success: boolean;
    sale?: { receiptNumber?: string; subtotal?: number; tax?: number; grandTotal?: number };
  }>,
): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const operations = await getPendingSyncOperations();

  for (const operation of operations) {
    if (operation.operationType !== "sale") continue;

    const localSale = await localDb.sales.get(operation.recordId);

    if (!localSale?.requestPayload) {
      await markSyncAttemptFailed(operation.operationId, "Missing saved checkout request; manual review required.");
      continue;
    }

    try {
      const result = await sendSale(localSale.requestPayload);
      if (!result.success || !result.sale) throw new Error("Server did not confirm the sale.");
      await markSaleSynced(operation.operationId, localSale.id, result.sale);
    } catch (error) {
      await markSyncAttemptFailed(
        operation.operationId,
        error instanceof Error ? error.message : "Synchronization failed.",
      );
      break;
    }
  }
}
`,
    "sale synchronization helpers"
  );

  // 3. Add idempotency support to the sales endpoint.
  changed.server = replaceOnce(
    changed.server,
    'app.post("/api/sales", async (req: Request, res: Response) => {\n  const session = client.startSession();\n\n  try {\n    const items = req.body?.items as SaleItemInput[] | undefined;\n',
    'app.post("/api/sales", async (req: Request, res: Response) => {\n  const session = client.startSession();\n\n  try {\n    const clientSaleId = cleanString(req.body?.clientSaleId);\n    if (clientSaleId && clientSaleId.length > 120) {\n      res.status(400).json({ success: false, message: "Invalid sale request ID." });\n      return;\n    }\n    const items = req.body?.items as SaleItemInput[] | undefined;\n',
    "sales endpoint request ID"
  );

  changed.server = replaceOnce(
    changed.server,
    '    const sales = db.collection("sales");\n    const now = new Date();\n',
    `    const sales = db.collection("sales");

    if (clientSaleId) {
      const existingSale = await sales.findOne({ clientSaleId });
      if (existingSale) {
        res.status(200).json({
          success: true,
          message: "Sale was already completed.",
          sale: { ...existingSale, id: String(existingSale._id), _id: String(existingSale._id) },
        });
        return;
      }
    }

    const now = new Date();
`,
    "duplicate sale pre-check"
  );

  changed.server = replaceOnce(
    changed.server,
    '    await session.withTransaction(async () => {\n      const saleLines: SaleLine[] = [];\n',
    `    await session.withTransaction(async () => {
      if (clientSaleId) {
        const existingSale = await sales.findOne({ clientSaleId }, { session });
        if (existingSale) {
          savedSale = existingSale;
          return;
        }
      }

      const saleLines: SaleLine[] = [];
`,
    "transaction duplicate check"
  );

  changed.server = replaceOnce(
    changed.server,
    "      const saleDocument = {\n  receiptNumber,\n",
    "      const saleDocument = {\n  ...(clientSaleId ? { clientSaleId } : {}),\n  receiptNumber,\n",
    "persist request ID"
  );

  changed.server = replaceOnce(
    changed.server,
    '    // Transactions require a MongoDB replica set or sharded cluster (Atlas supports this).\n    res.status(500).json({ success: false, message: "Could not complete the sale. No stock changes were committed." });\n',
    `    if (clientSaleId && error && typeof error === "object" && "code" in error && error.code === 11000) {
      try {
        const db = await connectToDatabase();
        const existingSale = await db.collection("sales").findOne({ clientSaleId });
        if (existingSale) {
          res.status(200).json({
            success: true,
            message: "Sale was already completed.",
            sale: { ...existingSale, id: String(existingSale._id), _id: String(existingSale._id) },
          });
          return;
        }
      } catch (lookupError) {
        console.error("Could not recover idempotent sale response:", lookupError);
      }
    }

    // Transactions require a MongoDB replica set or sharded cluster (Atlas supports this).
    res.status(500).json({ success: false, message: "Could not complete the sale. No stock changes were committed." });
`,
    "duplicate request recovery"
  );

  changed.server = replaceOnce(
    changed.server,
    '    const db = await connectToDatabase();\n\n    configureAuthDatabase(db);\n',
    '    const db = await connectToDatabase();\n    await db.collection("sales").createIndex({ clientSaleId: 1 }, { unique: true, sparse: true });\n\n    configureAuthDatabase(db);\n',
    "idempotency index"
  );

  // 4. Give each checkout a stable ID and retain its original request.
  changed.pos = replaceOnce(
    changed.pos,
    'import { apiFetch } from "../lib/api";\n',
    'import { apiFetch } from "../lib/api";\nimport { recordLocalSale, syncPendingSales } from "../db/offlineService";\n',
    "offline service import"
  );

  changed.pos = replaceOnce(
    changed.pos,
    `    try {
      const response = await apiFetch(\`\${API_BASE_URL}/api/sales\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Keep "customer" for compatibility with the existing sales API.
          customer: customerName.trim() || "Walk-in customer",
          customerName: customerName.trim() || "Walk-in customer",
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          customerAddress: customerAddress.trim(),
          customerType,
          paymentMethod,
          amountPaid: paidInput,
          overallDiscount: discount,
          taxEnabled,
          items: cart.map((item) => ({
            productId: getProductId(item.product),
            quantity: item.quantity,
            discount: item.discount,
          })),
        }),
      });

      const data = await response.json();
`,
    `    const clientSaleId = crypto.randomUUID();
    const salePayload: Record<string, unknown> = {
      clientSaleId,
      customer: customerName.trim() || "Walk-in customer",
      customerName: customerName.trim() || "Walk-in customer",
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      customerAddress: customerAddress.trim(),
      customerType,
      paymentMethod,
      amountPaid: paidInput,
      overallDiscount: discount,
      taxEnabled,
      items: cart.map((item) => ({
        productId: getProductId(item.product),
        quantity: item.quantity,
        discount: item.discount,
      })),
    };

    try {
      const response = await apiFetch(\`\${API_BASE_URL}/api/sales\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salePayload),
      });

      const data = await response.json();
`,
    "checkout payload"
  );

  changed.pos = replaceOnce(
    changed.pos,
    `    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not complete the sale.",
      );
      setMessageIsError(true);
    } finally {
`,
    `    } catch (error) {
      const isNetworkFailure =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        error instanceof TypeError;

      if (isNetworkFailure) {
        try {
          const createdAt = new Date().toISOString();
          const localSubtotal = cart.reduce(
            (sum, item) => sum + item.product.sellingPrice * item.quantity, 0
          );
          const localLineDiscount = cart.reduce(
            (sum, item) => sum + Math.round(item.product.sellingPrice * item.quantity * item.discount / 100), 0
          );
          const localTotal = Math.max(0, localSubtotal - localLineDiscount - discount);

          await recordLocalSale({
            id: clientSaleId,
            receiptNumber: \`PENDING-\${clientSaleId.slice(0, 8).toUpperCase()}\`,
            items: cart.map((item) => ({
              productId: getProductId(item.product),
              productName: item.product.name,
              quantity: item.quantity,
              unitPrice: item.product.sellingPrice,
              lineTotal: Math.max(0, item.product.sellingPrice * item.quantity * (1 - item.discount / 100)),
            })),
            subtotal: localSubtotal,
            taxAmount: 0,
            total: localTotal,
            paymentMethod,
            createdAt,
            syncStatus: "pending",
            requestPayload: salePayload,
          });

          setMessage("Connection unavailable. Sale saved as PENDING SYNC. The server must confirm the final total and receipt after reconnection.");
          setMessageIsError(false);
          setShowConfirmation(false);
          setCart([]);
          setAmountPaid("0");
          setOverallDiscount("0");
        } catch (storageError) {
          setMessage(storageError instanceof Error ? \`Offline save failed: \${storageError.message}\` : "Offline save failed. Restore the connection and keep the sale open.");
          setMessageIsError(true);
        }
      } else {
        setMessage(error instanceof Error ? error.message : "Could not complete the sale.");
        setMessageIsError(true);
      }
    } finally {
`,
    "offline checkout fallback"
  );

  changed.pos = replaceOnce(
    changed.pos,
    "  async function confirmSale() {\n",
    `  useEffect(() => {
    let running = false;

    const retryQueuedSales = async () => {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        await syncPendingSales(async (payload) => {
          const response = await apiFetch(\`\${API_BASE_URL}/api/sales\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await response.json();
          if (!response.ok || !data.success || !data.sale) {
            throw new Error(data.message || "Sale synchronization failed.");
          }
          return data;
        });
      } finally {
        running = false;
      }
    };

    void retryQueuedSales();
    window.addEventListener("online", retryQueuedSales);
    return () => window.removeEventListener("online", retryQueuedSales);
  }, []);

  async function confirmSale() {
`,
    "automatic sync hook"
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

// Write only after every expected code section has matched.
for (const [name, file] of Object.entries(files)) {
  if (changed[name] !== original[name]) {
    const backup = `${file}.before-offline-installer.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  }
}
for (const [name, file] of Object.entries(files)) {
  if (changed[name] !== original[name]) fs.writeFileSync(file, changed[name], "utf8");
}

console.log("Offline checkout installer applied.");
console.log("Backups created with .before-offline-installer.bak where needed.");
console.log("Build both apps before testing; this is not yet production-verified.");

