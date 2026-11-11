/**
 * Website details for products: everything the public website shows beyond
 * the till fields (model number, type, series, description, selling points,
 * specifications, extra photos, and whether the product is shown or featured).
 *
 * The till never needs these fields; they are optional on every product.
 * Extra photos live in Cloudinary next to the main product photo.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import { cleanText, handleFailure, sendError, serialize, toObjectId } from "./common.js";

export type ProductSpec = { label: string; value: string };
export type GalleryPhoto = { url: string; publicId: string };

export type WebsiteFields = {
  model?: string;
  subcategory?: string;
  series?: string;
  description?: string;
  features?: string[];
  specs?: ProductSpec[];
  showOnWebsite?: boolean;
  featured?: boolean;
};

export const MAX_FEATURES = 12;
export const MAX_SPECS = 40;
export const MAX_GALLERY = 8;

const WEBSITE_KEYS = ["model", "subcategory", "series", "description", "features", "specs", "showOnWebsite", "featured"] as const;

/** True when the request body carries at least one website field. */
export function hasWebsiteFields(body: unknown): boolean {
  const data = (body ?? {}) as Record<string, unknown>;
  return WEBSITE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(data, key));
}

/**
 * Reads and checks the website fields in a request body.
 * Only fields that are present are returned, so a PUT changes just what was sent.
 */
export function parseWebsiteFields(body: unknown): { ok: true; fields: WebsiteFields } | { ok: false; message: string } {
  const data = (body ?? {}) as Record<string, unknown>;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
  const fields: WebsiteFields = {};

  for (const [key, max] of [["model", 80], ["subcategory", 60], ["series", 60], ["description", 3000]] as const) {
    if (!has(key)) continue;
    if (data[key] !== null && typeof data[key] !== "string") return { ok: false, message: `${key} must be text.` };
    fields[key] = cleanText(data[key], max);
  }

  if (has("features")) {
    if (!Array.isArray(data.features)) return { ok: false, message: "Selling points must be a list." };
    const list = data.features.map((item) => cleanText(item, 200)).filter(Boolean);
    if (list.length > MAX_FEATURES) return { ok: false, message: `Use at most ${MAX_FEATURES} selling points.` };
    fields.features = list;
  }

  if (has("specs")) {
    if (!Array.isArray(data.specs)) return { ok: false, message: "Specifications must be a list." };
    const list: ProductSpec[] = [];
    for (const raw of data.specs) {
      const row = (raw ?? {}) as Record<string, unknown>;
      const label = cleanText(row.label, 60);
      const value = cleanText(row.value, 300);
      if (!label && !value) continue;
      if (!label || !value) return { ok: false, message: "Each specification needs both a name and a value." };
      list.push({ label, value });
    }
    if (list.length > MAX_SPECS) return { ok: false, message: `Use at most ${MAX_SPECS} specifications.` };
    fields.specs = list;
  }

  for (const key of ["showOnWebsite", "featured"] as const) {
    if (!has(key)) continue;
    if (typeof data[key] !== "boolean") return { ok: false, message: `${key} must be true or false.` };
    fields[key] = data[key] as boolean;
  }

  return { ok: true, fields };
}

/** Defaults for a new product: shown on the website, not featured, no details yet. */
export const WEBSITE_DEFAULTS: Required<WebsiteFields> = {
  model: "",
  subcategory: "",
  series: "",
  description: "",
  features: [],
  specs: [],
  showOnWebsite: true,
  featured: false,
};

// ---- Import helpers (pasted spreadsheet text) ----

/** "Night vision 30 m | AcuSense detection" → ["Night vision 30 m", "AcuSense detection"] */
export function splitList(value: unknown): string[] {
  return cleanText(value, 4000).split("|").map((item) => item.trim()).filter(Boolean).slice(0, MAX_FEATURES);
}

/** "Resolution: 4 MP | Lens: 2.8 mm" → [{label: "Resolution", value: "4 MP"}, …] */
export function splitSpecs(value: unknown): ProductSpec[] {
  return cleanText(value, 8000)
    .split("|")
    .map((pair) => {
      const at = pair.indexOf(":");
      return at > 0 ? { label: cleanText(pair.slice(0, at), 60), value: cleanText(pair.slice(at + 1), 300) } : null;
    })
    .filter((spec): spec is ProductSpec => !!spec && !!spec.label && !!spec.value)
    .slice(0, MAX_SPECS);
}

// ---- Extra photos (gallery) ----

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Only image files are allowed."));
      return;
    }
    callback(null, true);
  },
});

function cloudinaryReady(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

const router = Router();

// POST /api/products/:id/gallery  (multipart field "photo") — adds one extra photo.
router.post("/api/products/:id/gallery", requireAuth, upload.single("photo"), async (req: Request, res: Response) => {
  try {
    const productId = toObjectId(req.params.id);
    if (!productId) return sendError(res, 400, "Invalid product ID.");
    if (!req.file) return sendError(res, 400, "Choose an image to upload.");
    if (!cloudinaryReady()) return sendError(res, 500, "Cloudinary is not configured on the server.");

    const db = await connectToDatabase();
    const product = await db.collection("products").findOne({ _id: productId }, { projection: { gallery: 1 } });
    if (!product) return sendError(res, 404, "Product not found.");
    const gallery = Array.isArray(product.gallery) ? (product.gallery as GalleryPhoto[]) : [];
    if (gallery.length >= MAX_GALLERY) return sendError(res, 400, `A product can have at most ${MAX_GALLERY} extra photos.`);

    const uploaded = await new Promise<GalleryPhoto>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "ms-home-security-pos/products",
          resource_type: "image",
          // Website photos are shown larger than on the till.
          transformation: [{ width: 1200, height: 1200, crop: "limit", quality: "auto", fetch_format: "auto" }],
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Cloudinary returned no result."));
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.end(req.file!.buffer);
    });

    const updated = await db.collection("products").findOneAndUpdate(
      { _id: productId },
      { $push: { gallery: uploaded }, $set: { updatedAt: new Date() } } as never,
      { returnDocument: "after" },
    );
    res.json({ success: true, message: "Photo added.", product: updated ? serialize(updated) : null });
  } catch (error) {
    handleFailure(res, "Could not upload the photo", error);
  }
});

// DELETE /api/products/:id/gallery  { url } — removes one extra photo.
router.delete("/api/products/:id/gallery", requireAuth, async (req: Request, res: Response) => {
  try {
    const productId = toObjectId(req.params.id);
    if (!productId) return sendError(res, 400, "Invalid product ID.");
    const url = cleanText(req.body?.url, 1000);
    if (!url) return sendError(res, 400, "Say which photo to remove.");

    const db = await connectToDatabase();
    const product = await db.collection("products").findOne({ _id: productId }, { projection: { gallery: 1 } });
    if (!product) return sendError(res, 404, "Product not found.");
    const photo = (Array.isArray(product.gallery) ? (product.gallery as GalleryPhoto[]) : []).find((item) => item.url === url);
    if (!photo) return sendError(res, 404, "That photo is not on this product.");

    const updated = await db.collection("products").findOneAndUpdate(
      { _id: productId },
      { $pull: { gallery: { url } }, $set: { updatedAt: new Date() } } as never,
      { returnDocument: "after" },
    );
    if (photo.publicId && cloudinaryReady()) cloudinary.uploader.destroy(photo.publicId).catch(() => undefined);
    res.json({ success: true, message: "Photo removed.", product: updated ? serialize(updated) : null });
  } catch (error) {
    handleFailure(res, "Could not remove the photo", error);
  }
});

export default router;
