import { apiFetch } from "../lib/api";
import {
  getPendingSyncOperations,
  markSaleSynced,
  markSyncAttemptFailed,
} from "./offlineService";

type SyncResponse = {
  success?: boolean;
  message?: string;
  sale?: {
    id?: string;
    _id?: string;
    receiptNumber?: string;
    subtotal?: number;
    tax?: number;
    grandTotal?: number;
  };
};

let syncInProgress = false;

export type SyncResult = {
  processed: number;
  synchronized: number;
  failed: number;
};

/**
 * Upload pending local sales to the server.
 *
 * A sale is removed from the pending queue only after the server confirms
 * success. The original request payload, including clientSaleId, is reused
 * to make retries idempotent.
 */
export async function syncPendingSales(): Promise<SyncResult> {
  const result: SyncResult = {
    processed: 0,
    synchronized: 0,
    failed: 0,
  };

  if (syncInProgress || !navigator.onLine) {
    return result;
  }

  syncInProgress = true;

  try {
    const operations = await getPendingSyncOperations();

    for (const operation of operations) {
      if (!navigator.onLine) {
        break;
      }

      if (operation.operationType !== "sale") {
        continue;
      }

      result.processed += 1;

      try {
        // Read the current record and its exact original request.
        const { localDb } = await import("./database");
        const sale = await localDb.sales.get(operation.recordId);

        if (!sale) {
          await markSyncAttemptFailed(
            operation.operationId,
            "The queued local sale record could not be found.",
          );
          result.failed += 1;
          continue;
        }

        if (!sale.requestPayload) {
          await markSyncAttemptFailed(
            operation.operationId,
            "The sale has no saved request payload; automatic retry is unsafe.",
          );
          result.failed += 1;
          continue;
        }

        const response = await apiFetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sale.requestPayload),
        });

        const data = (await response.json()) as SyncResponse;

        if (!response.ok || !data.success || !data.sale) {
          throw new Error(
            data.message || `Server rejected synchronization (HTTP ${response.status}).`,
          );
        }

        await markSaleSynced(
          operation.operationId,
          sale.id,
          {
            receiptNumber: data.sale.receiptNumber,
            subtotal: data.sale.subtotal,
            tax: data.sale.tax,
            grandTotal: data.sale.grandTotal,
          },
        );

        result.synchronized += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown synchronization error.";

        try {
          await markSyncAttemptFailed(operation.operationId, message);
        } catch (queueError) {
          console.error("Could not update the local sync queue:", queueError);
        }

        result.failed += 1;
      }
    }
  } finally {
    syncInProgress = false;
  }

  return result;
}
