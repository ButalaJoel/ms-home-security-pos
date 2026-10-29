
import Dexie, { type EntityTable } from "dexie";

// A product cached on this computer for offline browsing and selling.
export interface LocalProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  stockQuantity: number;
  updatedAt: string;
  syncedAt?: string;
}

// A sale recorded locally before it is synchronized with the server.
export interface LocalSale {
  // Exact checkout payload retained for safe retries.
  requestPayload?: Record<string, unknown>;
  id: string;
  receiptNumber: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
  syncStatus: "pending" | "synced" | "failed";
  // Timestamp indicating when the server confirmed synchronization.
  syncedAt?: string;
}

// Stores an operation that still needs to reach the backend.
export interface PendingSync {
  id?: number;
  operationId: string;
  operationType: "sale";
  recordId: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

// Cached business settings for use when the internet is unavailable.
export interface LocalSettings {
  id: "business";
  data: Record<string, string | boolean>;
  cachedAt: string;
}

// Define the IndexedDB database and its tables.
class MSHomeSecurityDatabase extends Dexie {
  products!: EntityTable<LocalProduct, "id">;
  sales!: EntityTable<LocalSale, "id">;
  pendingSync!: EntityTable<PendingSync, "id">;
  settings!: EntityTable<LocalSettings, "id">;

  constructor() {
    super("MSHomeSecurityPOS");

    // Version 1 establishes the initial offline data structure.
    this.version(1).stores({
      products: "id, sku, name, category, updatedAt",
      sales: "id, receiptNumber, createdAt, syncStatus",
      pendingSync: "++id, &operationId, operationType, recordId, createdAt",
      settings: "id",
    });
  }
}

// Export one shared database instance for the entire frontend.
export const localDb = new MSHomeSecurityDatabase();
