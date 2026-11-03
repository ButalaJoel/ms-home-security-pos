/**
 * Bulk product import (used for loading the client's real product list).
 * Every imported product starts with zero stock; quantities are set later
 * through Inventory, so each one has an audit trail.
 * Missing SKUs are generated from the category (e.g. CAM-0001).
 */
import { Router, type Request, type Response } from "express";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import { cleanText, handleFailure, isMoney, sendError } from "./common.js";

const router = Router();

function skuStem(category: string): string {
  const letters = category.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters.slice(0, 3) || "ITM").padEnd(3, "X");
}

// POST /api/products/import  { products: [{ name, category, sellingPrice, costPrice?, sku?, brand?, reorderLevel? }] }
router.post("/api/products/import", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = Array.isArray(req.body?.products) ? req.body.products : [];
    if (rows.length === 0 || rows.length > 2000) return sendError(res, 400, "Send between 1 and 2000 products.");

    const db = await connectToDatabase();
    const products = db.collection("products");
    const existingSkus = new Set(
      (await products.find({}, { projection: { sku: 1 } }).toArray()).map((product) => String(product.sku).toUpperCase()),
    );
    const existingNames = new Set(
      (await products.find({}, { projection: { name: 1 } }).toArray()).map((product) => String(product.name).toLowerCase()),
    );

    const errors: string[] = [];
    const skipped: string[] = [];
    const documents: Record<string, unknown>[] = [];
    const now = new Date();

    rows.forEach((raw: unknown, index: number) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const line = index + 1;
      const name = cleanText(row.name, 200);
      const category = cleanText(row.category, 100) || "General";
      const sellingPrice = typeof row.sellingPrice === "string" ? Number(row.sellingPrice.replace(/[^0-9.]/g, "")) : row.sellingPrice;
      const costPrice = row.costPrice === undefined || row.costPrice === "" ? 0
        : typeof row.costPrice === "string" ? Number(row.costPrice.replace(/[^0-9.]/g, "")) : row.costPrice;
      const reorderLevel = row.reorderLevel === undefined || row.reorderLevel === "" ? 5 : Number(row.reorderLevel);

      if (!name) return void errors.push(`Row ${line}: missing product name.`);
      if (!isMoney(sellingPrice)) return void errors.push(`Row ${line} (${name}): invalid selling price.`);
      if (!isMoney(costPrice)) return void errors.push(`Row ${line} (${name}): invalid cost price.`);
      if (!Number.isInteger(reorderLevel) || reorderLevel < 0) return void errors.push(`Row ${line} (${name}): invalid reorder level.`);
      if (existingNames.has(name.toLowerCase())) return void skipped.push(name);

      let sku = cleanText(row.sku, 60).toUpperCase();
      if (!sku) {
        const stem = skuStem(category);
        let counter = 1;
        do {
          sku = `${stem}-${String(counter).padStart(4, "0")}`;
          counter += 1;
        } while (existingSkus.has(sku));
      }
      if (existingSkus.has(sku)) return void errors.push(`Row ${line} (${name}): SKU ${sku} already exists.`);

      existingSkus.add(sku);
      existingNames.add(name.toLowerCase());
      documents.push({
        name,
        sku,
        category,
        brand: cleanText(row.brand, 100),
        costPrice,
        sellingPrice,
        quantity: 0,
        reorderLevel,
        imageUrl: "",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: `Nothing was imported. Fix ${errors.length} row(s) first.`, errors, skipped });
    }
    if (documents.length > 0) await products.insertMany(documents);
    res.status(201).json({
      success: true,
      message: `${documents.length} product(s) imported with zero stock.${skipped.length ? ` ${skipped.length} skipped because they already exist.` : ""}`,
      imported: documents.length,
      skipped,
    });
  } catch (error) {
    handleFailure(res, "Could not import products", error);
  }
});

export default router;
