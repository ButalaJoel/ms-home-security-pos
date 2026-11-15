/**
 * Public endpoints for the MS Home Security website (no login).
 *
 * They return ONLY what the website shows. Never cost price, exact stock
 * counts, reorder levels, photo storage ids, users, customers or sales.
 * Stock is sent as a label (in stock / low stock / available to order).
 *
 * Later steps add POST endpoints here for orders and website requests.
 */
import { Router, type Request, type Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Document } from "mongodb";
import { connectToDatabase } from "../db.js";
import { handleFailure } from "./common.js";

const router = Router();

// Generous for browsing, but stops anyone hammering the server. Counted per visitor:
// the website proxies these calls, so the visitor is the first X-Forwarded-For address.
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() || req.ip || "unknown"),
  message: { success: false, message: "Too many requests. Please wait a minute and try again." },
});

type StockStatus = "in_stock" | "low_stock" | "available_to_order";

function stockStatus(product: Document): StockStatus {
  const quantity = Number(product.quantity ?? 0);
  const reorderLevel = Number(product.reorderLevel ?? 5);
  if (!(quantity > 0)) return "available_to_order";
  return quantity <= reorderLevel ? "low_stock" : "in_stock";
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The website's product shape (see the website's src/lib/types.ts). */
export function toPublicProduct(product: Document) {
  return {
    id: String(product._id),
    name: text(product.name),
    sku: text(product.sku),
    category: text(product.category),
    brand: text(product.brand),
    // Prices are not published: resellers and end customers would see conflicting prices.
    // 0 makes the website show "Price on request"; staff quote the price when they call.
    price: 0,
    imageUrl: text(product.imageUrl),
    stock: stockStatus(product),
    model: text(product.model),
    subcategory: text(product.subcategory),
    series: text(product.series),
    description: text(product.description),
    features: Array.isArray(product.features) ? product.features.filter((item: unknown) => typeof item === "string") : [],
    specs: Array.isArray(product.specs)
      ? product.specs
          .map((row: Document) => ({ label: text(row?.label), value: text(row?.value) }))
          .filter((row: { label: string; value: string }) => row.label && row.value)
      : [],
    images: Array.isArray(product.gallery) ? product.gallery.map((photo: Document) => text(photo?.url)).filter(Boolean) : [],
    featured: product.featured === true,
  };
}

// GET /api/public/products — every active product that is shown on the website.
router.get("/api/public/products", readLimiter, async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const products = await db
      .collection("products")
      .find(
        { active: { $ne: false }, showOnWebsite: { $ne: false } },
        // Only read the fields the website needs; cost price never leaves the database.
        {
          projection: {
            name: 1, sku: 1, category: 1, brand: 1, sellingPrice: 1, imageUrl: 1, quantity: 1, reorderLevel: 1,
            model: 1, subcategory: 1, series: 1, description: 1, features: 1, specs: 1, gallery: 1, featured: 1,
          },
        },
      )
      .sort({ category: 1, name: 1 })
      .toArray();

    res.set("Cache-Control", "public, max-age=60");
    res.json({ success: true, products: products.map(toPublicProduct), count: products.length });
  } catch (error) {
    handleFailure(res, "Could not load products", error);
  }
});

const DEFAULT_INSTALLATION_TERMS = "Installation jobs need a 70% deposit, with the 30% balance paid on handover.";

// GET /api/public/business — contact details and payment numbers from POS Settings.
router.get("/api/public/business", readLimiter, async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const s: Document = (await db.collection<Document>("settings").findOne({ _id: "business" } as Document)) ?? {};

    const phones = [s.phone, s.phone2, s.phone3, s.businessPhone].map(text).map((p) => p.trim()).filter(Boolean);
    const uniquePhones = [...new Set(phones)];
    const momo = [
      { network: "MTN MoMo", number: text(s.mtnPaymentNumber).trim(), name: text(s.mtnRegisteredName).trim() },
      { network: "Airtel Money", number: text(s.airtelPaymentNumber).trim(), name: text(s.airtelRegisteredName).trim() },
    ].filter((item) => item.number);

    res.set("Cache-Control", "public, max-age=300");
    res.json({
      success: true,
      business: {
        name: text(s.businessName).trim() || "MS Home Security Solutions",
        phones: uniquePhones,
        whatsapp: (text(s.whatsappNumber).trim() || uniquePhones[0] || "").replace(/[^\d+]/g, ""),
        email: text(s.email).trim() || text(s.businessEmail).trim(),
        address: text(s.address).trim() || text(s.businessAddress).trim() || "Kampala, Uganda",
        hours: text(s.openingHours).trim(),
        mapLink: text(s.mapLink).trim(),
        social: {
          facebook: text(s.facebookUrl).trim(),
          instagram: text(s.instagramUrl).trim(),
          tiktok: text(s.tiktokUrl).trim(),
        },
        momo,
        installationTerms: text(s.installationTerms).trim() || DEFAULT_INSTALLATION_TERMS,
        warranty: text(s.warrantyDuration).trim() || "6 months",
        logoUrl: text(s.logoUrl).trim(),
      },
    });
  } catch (error) {
    handleFailure(res, "Could not load business details", error);
  }
});

export default router;
