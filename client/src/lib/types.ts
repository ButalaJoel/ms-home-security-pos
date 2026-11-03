export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand?: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  reorderLevel?: number;
  imageUrl?: string;
  active?: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  customerType?: string;
};

export const PAYMENT_METHODS = ["Cash", "Mobile Money", "Bank transfer", "Card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
