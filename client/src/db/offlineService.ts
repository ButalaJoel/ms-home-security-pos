
import { localDb } from "./database";
import type {
  LocalProduct,
  LocalSale,
  LocalSettings,
  PendingSync,
} from "./database";

// -----------------------------------------------------------------------------
// PRODUCT CACHE
// -----------------------------------------------------------------------------

// Save or update products in the local database.
// The backend will provide the authoritative product list when we connect it.
export async function cacheProducts(
  products: LocalProduct[],
): Promise<void> {
  await localDb.products.bulkPut(products);
}

// Retrieve cached products, including when the internet is unavailable.
export async function getCachedProducts(): Promise<LocalProduct[]> {
  return localDb.products.toArray();
}

// Find one locally cached product by its ID.
export async function getCachedProduct(
  productId: string,
): Promise<LocalProduct | undefined> {
  return localDb.products.get(productId);
}

// -----------------------------------------------------------------------------
// BUSINESS SETTINGS CACHE
// -----------------------------------------------------------------------------

// Save business settings locally so the app can use them offline.
export async function cacheBusinessSettings(
  settings: Record<string, string | boolean>,
): Promise<void> {
  const cachedSettings: LocalSettings = {
    id: "business",
    data: settings,
    cachedAt: new Date().toISOString(),
  };

  await localDb.settings.put(cachedSettings);
}

// Retrieve cached settings.
// Return undefined if this computer has not cached settings yet.
export async function getCachedBusinessSettings():
Promise<LocalSettings | undefined> {
  return localDb.settings.get("business");
}

// -----------------------------------------------------------------------------
// LOCAL SALES
// -----------------------------------------------------------------------------

// Record a sale and queue its synchronization in one IndexedDB transaction.
// This prevents a sale being stored without its corresponding sync operation.
export async function recordLocalSale(
  sale: LocalSale,
): Promise<void> {
  // Only new sales should enter the queue as pending.
  const pendingSale: LocalSale = {
    ...sale,
    syncStatus: "pending",
  };

  // Use a transaction so both writes succeed or fail together.
  await localDb.transaction(
    "rw",
    localDb.sales,
    localDb.pendingSync,
    async () => {
      // Save the sale locally first.
      await localDb.sales.put(pendingSale);

      // Give the sync operation a stable unique ID.
      const syncOperation: PendingSync = {
        operationId: `sale:${pendingSale.id}`,
        operationType: "sale",
        recordId: pendingSale.id,
        createdAt: new Date().toISOString(),
        attempts: 0,
      };

      // Queue it for synchronization with the server later.
      await localDb.pendingSync.put(syncOperation);
    },
  );
}

// Record a pending sale with the exact server request used for retries.
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
        operationId: `sale:${pendingSale.id}`,
        operationType: "sale",
        recordId: pendingSale.id,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    },
  );
}

// Retrieve sales stored on this computer.
export async function getLocalSales(): Promise<LocalSale[]> {
  return localDb.sales.orderBy("createdAt").reverse().toArray();
}

// Count sales that have not yet been synchronized.
export async function getPendingSaleCount(): Promise<number> {
  return localDb.pendingSync
    .where("operationType")
    .equals("sale")
    .count();
}

// -----------------------------------------------------------------------------
// SYNCHRONIZATION QUEUE
// -----------------------------------------------------------------------------

// Retrieve queued operations in the order they were created.
export async function getPendingSyncOperations():
Promise<PendingSync[]> {
  return localDb.pendingSync.orderBy("createdAt").toArray();
}

// Record a failed attempt so we can retry it later.
export async function markSyncAttemptFailed(
  operationId: string,
  errorMessage: string,
): Promise<void> {
  const operation = await localDb.pendingSync
    .where("operationId")
    .equals(operationId)
    .first();

  if (!operation) {
    return;
  }

  await localDb.pendingSync.update(operation.id!, {
    attempts: operation.attempts + 1,
    lastError: errorMessage,
  });

  // Keep the sale marked as failed until a later sync succeeds.
  await localDb.sales.update(operation.recordId, {
    syncStatus: "failed",
  });
}

// Mark a sale synchronized only after the backend confirms it was saved.
export async function markSaleSynced(
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
