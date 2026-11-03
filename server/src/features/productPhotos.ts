/**
 * Optional product photos, stored in Cloudinary (the same account as the logo).
 * Images are shrunk to at most 800px on upload so the till stays fast.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import { handleFailure, sendError, serialize, toObjectId } from "./common.js";

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
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET,
  );
}

const router = Router();

// POST /api/products/:id/photo  (multipart field "photo")
router.post("/api/products/:id/photo", requireAuth, upload.single("photo"), async (req: Request, res: Response) => {
  try {
    const productId = toObjectId(req.params.id);
    if (!productId) return sendError(res, 400, "Invalid product ID.");
    if (!req.file) return sendError(res, 400, "Choose an image to upload.");
    if (!cloudinaryReady()) return sendError(res, 500, "Cloudinary is not configured on the server.");

    const db = await connectToDatabase();
    const product = await db.collection("products").findOne({ _id: productId });
    if (!product) return sendError(res, 404, "Product not found.");

    const uploaded = await new Promise<{ url: string; publicId: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "ms-home-security-pos/products",
          resource_type: "image",
          transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto", fetch_format: "auto" }],
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
      { $set: { imageUrl: uploaded.url, imagePublicId: uploaded.publicId, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    // Remove the old photo from Cloudinary; failure here is not fatal.
    if (typeof product.imagePublicId === "string" && product.imagePublicId) {
      cloudinary.uploader.destroy(product.imagePublicId).catch(() => undefined);
    }

    res.json({ success: true, message: "Photo saved.", product: updated ? serialize(updated) : null });
  } catch (error) {
    handleFailure(res, "Could not upload the photo", error);
  }
});

// DELETE /api/products/:id/photo
router.delete("/api/products/:id/photo", requireAuth, async (req: Request, res: Response) => {
  try {
    const productId = toObjectId(req.params.id);
    if (!productId) return sendError(res, 400, "Invalid product ID.");
    const db = await connectToDatabase();
    const product = await db.collection("products").findOneAndUpdate(
      { _id: productId },
      { $set: { imageUrl: "", imagePublicId: "", updatedAt: new Date() } },
      { returnDocument: "before" },
    );
    if (!product) return sendError(res, 404, "Product not found.");
    if (typeof product.imagePublicId === "string" && product.imagePublicId && cloudinaryReady()) {
      cloudinary.uploader.destroy(product.imagePublicId).catch(() => undefined);
    }
    res.json({ success: true, message: "Photo removed." });
  } catch (error) {
    handleFailure(res, "Could not remove the photo", error);
  }
});

export default router;
