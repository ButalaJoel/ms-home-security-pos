/**
 * Bulk product import (used for loading the client's real product list).
 * Every imported product starts with zero stock; quantities are set later
 * through Inventory, so each one has an audit trail.
 * Missing SKUs are generated from the category (e.g. CAM-0001).
 *
 * Optional website columns: model, subcategory (type), series, description,
 * features ("a | b | c") and specs ("Label: value | Label: value"), and
 * imageUrl: a link to the maker's photo, copied into Cloudinary in the
 * background for products that have no main photo yet.
 * With updateExisting = true, rows that match an existing product (by SKU,
 * else by name) only update that product's website details; prices, stock
 * and till fields are never changed by an update.
 */
import { Router, type Request, type Response } from "express";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import { cleanText, handleFailure, isMoney, sendError } from "./common.js";
import { cleanImageUrl, copyMainPhotosInBackground, splitList, splitSpecs, WEBSITE_DEFAULTS } from "./productWebsite.js";

/** Website columns from one pasted row; only columns that have something in them. */
function websiteColumns(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const model = cleanText(row.model, 80);
  const subcategory = cleanText(row.subcategory, 60);
  const series = cleanText(row.series, 60);
  const description = cleanText(row.description, 3000);
  const features = splitList(row.features);
  const specs = splitSpecs(row.specs);
  if (model) out.model = model;
  if (subcategory) out.subcategory = subcategory;
  if (series) out.series = series;
  if (description) out.description = description;
  if (features.length) out.features = features;
  if (specs.length) out.specs = specs;
  return out;
}

const router = Router();

function skuStem(category: string): string {
  const letters = category.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters.slice(0, 3) || "ITM").padEnd(3, "X");
}

// POST /api/products/import  { products: [{ name, category, sellingPrice, costPrice?, sku?, brand?, reorderLevel? }] }
router.post("/api/products/import", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = Array.isArray(req.body?.products) ? req.body.products : [];
    const updateExisting = req.body?.updateExisting === true;
    if (rows.length === 0 || rows.length > 2000) return sendError(res, 400, "Send between 1 and 2000 products.");

    const db = await connectToDatabase();
    const products = db.collection("products");
    const current = await products.find({}, { projection: { sku: 1, name: 1, brand: 1 } }).toArray();
    const existingSkus = new Set(current.map((product) => String(product.sku).toUpperCase()));
    const existingNames = new Set(current.map((product) => String(product.name).toLowerCase()));
    const idBySku = new Map(current.map((product) => [String(product.sku).toUpperCase(), product._id]));
    const idByName = new Map(current.map((product) => [String(product.name).toLowerCase(), product._id]));
    const blankBrand = new Set(current.filter((product) => !String(product.brand ?? "").trim()).map((product) => String(product._id)));
    const updates: { id: unknown; name: string; fields: Record<string, unknown> }[] = [];
    const photoJobs: { id: unknown; url: string }[] = [];
    const newPhotoUrls: string[] = []; // same order as documents

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

      // Update mode: an existing product only gets its website details filled in.
      const rowSku = cleanText(row.sku, 60).toUpperCase();
      const existingId = (rowSku && idBySku.get(rowSku)) || idByName.get(name.toLowerCase());
      if (updateExisting && existingId) {
        const fields = websiteColumns(row);
        // A brand is filled in only where the product has none; a brand staff typed is never replaced.
        const brand = cleanText(row.brand, 100);
        if (brand && blankBrand.has(String(existingId))) fields.brand = brand;
        const photoUrl = cleanImageUrl(row.imageUrl);
        if (photoUrl) photoJobs.push({ id: existingId, url: photoUrl });
        if (Object.keys(fields).length === 0) return void (photoUrl ? undefined : skipped.push(name));
        return void updates.push({ id: existingId, name, fields });
      }

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
      newPhotoUrls.push(cleanImageUrl(row.imageUrl));
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
        ...WEBSITE_DEFAULTS,
        ...websiteColumns(row),
        createdAt: now,
        updatedAt: now,
      });
    });

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: `Nothing was imported. Fix ${errors.length} row(s) first.`, errors, skipped });
    }
    if (documents.length > 0) {
      const inserted = await products.insertMany(documents);
      newPhotoUrls.forEach((url, index) => {
        if (url && inserted.insertedIds[index]) photoJobs.push({ id: inserted.insertedIds[index], url });
      });
    }
    for (const update of updates) {
      await products.updateOne({ _id: update.id as never }, { $set: { ...update.fields, updatedAt: now } });
    }
    const parts = [
      documents.length ? `${documents.length} new product(s) imported with zero stock.` : "",
      updates.length ? `${updates.length} existing product(s) updated with website details.` : "",
      skipped.length ? `${skipped.length} skipped (${updateExisting ? "nothing to update" : "already exist"}).` : "",
      photoJobs.length ? `${photoJobs.length} photo(s) are being copied in the background; refresh in a minute.` : "",
    ].filter(Boolean);
    copyMainPhotosInBackground(photoJobs);
    res.status(201).json({
      success: true,
      message: parts.join(" ") || "Nothing to import.",
      imported: documents.length,
      updated: updates.length,
      skipped,
    });
  } catch (error) {
    handleFailure(res, "Could not import products", error);
  }
});

export default router;
