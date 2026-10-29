
/**
 * MS Home Security POS — Express API
 *
 * Responsibilities:
 * 1. Connect to MongoDB.
 * 2. Provide health checks.
 * 3. Manage business settings and the company logo.
 * 4. Manage products.
 * 5. Record stock adjustments and maintain adjustment history.
 * 6. Process POS sales, deduct stock atomically, and store receipts.
 *
 * Collections:
 * - products
 * - stock_adjustments
 * - settings
 * - sales
 */

import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { ObjectId, type Document } from "mongodb";
import { client, connectToDatabase } from "./db.js";
import { requireAuth, requireRole } from "./authMiddleware.js";

import session from "express-session";
import MongoStore from "connect-mongo";
import helmet from "helmet";
import authRoutes, { configureAuthDatabase } from "./authRoutes.js";

import userRoutes, { configureUserRoutesDatabase } from "./userRoutes.js";
const app = express();
const port = Number(process.env.PORT) || 5000;

// ---------------------------------------------------------
// 1. MIDDLEWARE AND CONFIGURATION
// ---------------------------------------------------------

// Allow the frontend to call this API from local development
// and from the deployed frontend configured in CLIENT_URL.

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin(origin, callback) {
      const isLocalDevelopmentOrigin =
        process.env.NODE_ENV !== "production" &&
        /^http:\/\/localhost:\d+$/.test(origin || "");

      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        isLocalDevelopmentOrigin
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(helmet());

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters long.");
}

app.use(
  session({
    name: "mspos.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      clientPromise: client.connect().then(() => client),
      dbName: process.env.DB_NAME || "ms_home_security_pos",
      collectionName: "sessions",
      ttl: 8 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);



// Parse JSON request bodies. The size limit helps prevent oversized payloads.
app.use(express.json({ limit: "1mb" }));

// Configure Cloudinary for company-logo uploads.
// Keep credentials in server/.env; never expose them in the frontend.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Keep uploaded images in memory until they are sent to Cloudinary.
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

// ---------------------------------------------------------
// 2. SHARED TYPES AND HELPERS
// ---------------------------------------------------------

type AdjustmentType =
  | "Stock received"
  | "Stock issued"
  | "Damaged stock"
  | "Lost stock"
  | "Stock correction";

type ProductDocument = {
  name: string;
  sku: string;
  category: string;
  brand: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  reorderLevel: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AdjustmentDocument = {
  productId: ObjectId;
  productName: string;
  sku: string;
  type: AdjustmentType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  change: number;
  reason: string;
  reference: string;
  createdAt: Date;
};

const adjustmentTypes: AdjustmentType[] = [
  "Stock received",
  "Stock issued",
  "Damaged stock",
  "Lost stock",
  "Stock correction",
];

const defaultSettings = {
  businessName: "MS Home Security",
  businessEmail: "",
  businessPhone: "",
  businessAddress: "",
  currency: "UGX",
  lowStockThreshold: "5",
  defaultUnit: "Pieces",
  taxEnabled: false,
  taxLabel: "Tax",
  taxRate: "0",
  logoUrl: "",
};

type BusinessSettingsDocument = Document & {
  _id: string;
};

// Convert a MongoDB document into a frontend-friendly object.
// MongoDB uses _id; the React pages can use id.
function serializeProduct(product: Document) {
  return {
    ...product,
    id: String(product._id),
    _id: String(product._id),
  };
}

function isNonNegativeNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
  );
}

// Validate a route ID before converting it to a MongoDB ObjectId.
// Express route parameters may be undefined, depending on the type definitions.
function getProductId(
  id: string | string[] | undefined
): ObjectId | null {
  const value = Array.isArray(id) ? id[0] : id;

  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    return null;
  }

  return new ObjectId(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Authentication endpoints: login, logout, current user and initial setup.
app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);

// ---------------------------------------------------------
// 3. HEALTH CHECKS
// ---------------------------------------------------------

// GET /api/health
// Confirms that the Express server is running.
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "MS Home Security POS API is running.",
  });
});

// GET /api/db-health
// Confirms that the API can reach MongoDB.
app.get("/api/db-health", async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    await db.command({ ping: 1 });

    res.json({
      success: true,
      message: "MongoDB connection is healthy.",
      database: db.databaseName,
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(503).json({
      success: false,
      message: "MongoDB is unavailable.",
    });
  }
});

// ---------------------------------------------------------
// 4. BUSINESS SETTINGS
// ---------------------------------------------------------

// GET /api/settings
// Returns saved settings merged with defaults for missing fields.
app.get(
  "/api/settings",
  requireAuth,
  async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();

    const savedSettings = await db
      .collection<BusinessSettingsDocument>("settings")
      .findOne({ _id: "business" });

    res.json({
      success: true,
      settings: {
        ...defaultSettings,
        ...(savedSettings ?? {}),
        _id: undefined,
      },
    });
  } catch (error) {
    console.error("Could not fetch settings:", error);

    res.status(500).json({
      success: false,
      message: "Could not fetch business settings.",
    });
  }
},
);

// PUT /api/settings
// Updates only known settings keys rather than accepting arbitrary fields.
app.put("/api/settings", requireAuth,
  async (req: Request, res: Response) => {
  try {
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body)
    ) {
      res.status(400).json({
        success: false,
        message: "A settings object is required.",
      });
      return;
    }

    const allowedKeys = Object.keys(defaultSettings);
    const updates: Record<string, unknown> = {};

    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        success: false,
        message: "No supported settings were provided.",
      });
      return;
    }

    const db = await connectToDatabase();

    await db.collection<BusinessSettingsDocument>("settings").updateOne(
      { _id: "business" },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    const savedSettings = await db
      .collection<BusinessSettingsDocument>("settings")
      .findOne({ _id: "business" });

    res.json({
      success: true,
      settings: {
        ...defaultSettings,
        ...(savedSettings ?? {}),
        _id: undefined,
      },
    });
  } catch (error) {
    console.error("Could not update settings:", error);

    res.status(500).json({
      success: false,
      message: "Could not update business settings.",
    });
  }
},
);

// POST /api/settings/logo
// Uploads the business logo to Cloudinary and saves its URL in MongoDB.
app.post("/api/settings/logo", requireAuth,
  upload.single("logo"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: "Select an image file to upload.",
        });
        return;
      }

      if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        res.status(500).json({
          success: false,
          message: "Cloudinary is not configured on the server.",
        });
        return;
      }

      // Cloudinary upload_stream accepts the image buffer from Multer.
      const logoUrl = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "ms-home-security-pos",
            resource_type: "image",
          },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error("Cloudinary returned no result."));
              return;
            }

            resolve(result.secure_url);
          }
        );

        stream.end(req.file!.buffer);
      });

      const db = await connectToDatabase();

      await db.collection<BusinessSettingsDocument>("settings").updateOne(
        { _id: "business" },
        {
          $set: {
            logoUrl,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      res.json({
        success: true,
        logoUrl,
        message: "Business logo uploaded successfully.",
      });
    } catch (error) {
      console.error("Logo upload failed:", error);

      res.status(500).json({
        success: false,
        message: "Logo upload failed.",
      });
    }
  }
);

// Require an authenticated session for all product operations,
// including product details and stock adjustment history.
app.use("/api/products", requireAuth);

// ---------------------------------------------------------
// 5. PRODUCTS API
// ---------------------------------------------------------

// GET /api/products
// Returns active products. Add ?includeInactive=true to include archived ones.
app.get("/api/products", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const includeInactive = req.query.includeInactive === "true";

    const filter = includeInactive ? {} : { active: { $ne: false } };

    const products = await db
      .collection<ProductDocument>("products")
      .find(filter)
      .sort({ name: 1 })
      .toArray();

    res.json({
      success: true,
      products: products.map((product) => serializeProduct(product)),
      count: products.length,
    });
  } catch (error) {
    console.error("Could not fetch products:", error);

    res.status(500).json({
      success: false,
      message: "Could not fetch products.",
    });
  }
});

// GET /api/products/:id
// Fetches one product by its MongoDB ID.
app.get("/api/products/:id", async (req: Request, res: Response) => {
  try {
    const productId = getProductId(req.params.id);

    if (!productId) {
      res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
      return;
    }

    const db = await connectToDatabase();

    const product = await db
      .collection<ProductDocument>("products")
      .findOne({ _id: productId });

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Product not found.",
      });
      return;
    }

    res.json({
      success: true,
      product: serializeProduct(product),
    });
  } catch (error) {
    console.error("Could not fetch product:", error);

    res.status(500).json({
      success: false,
      message: "Could not fetch product.",
    });
  }
});

// POST /api/products
// Creates a product. SKU is normalized to uppercase and must be unique.
app.post("/api/products", requireAuth,
  async (req: Request, res: Response) => {
  try {
    const name = cleanString(req.body?.name);
    const sku = cleanString(req.body?.sku).toUpperCase();
    const category = cleanString(req.body?.category);
    const brand = cleanString(req.body?.brand);

    const costPrice = req.body?.costPrice;
    const sellingPrice = req.body?.sellingPrice;
    const quantity = req.body?.quantity ?? req.body?.stock ?? 0;
    const reorderLevel = req.body?.reorderLevel ?? 5;

    if (!name || !sku || !category) {
      res.status(400).json({
        success: false,
        message: "Product name, SKU and category are required.",
      });
      return;
    }

    if (
      !isNonNegativeNumber(costPrice) ||
      !isNonNegativeNumber(sellingPrice) ||
      !isNonNegativeNumber(quantity) ||
      !isNonNegativeNumber(reorderLevel)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Prices, quantity and reorder level must be non-negative numbers.",
      });
      return;
    }

    if (
      !Number.isInteger(quantity) ||
      !Number.isInteger(reorderLevel)
    ) {
      res.status(400).json({
        success: false,
        message: "Stock quantity and reorder level must be whole numbers.",
      });
      return;
    }

    const db = await connectToDatabase();
    const products = db.collection<ProductDocument>("products");

    // A duplicate SKU would make stock and sales records ambiguous.
    const existingProduct = await products.findOne({ sku });

    if (existingProduct) {
      res.status(409).json({
        success: false,
        message: `SKU "${sku}" already exists.`,
      });
      return;
    }

    const now = new Date();

    const newProduct: ProductDocument = {
      name,
      sku,
      category,
      brand,
      costPrice,
      sellingPrice,
      quantity,
      reorderLevel,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await products.insertOne(newProduct);

    // Record opening stock so initial quantities have an audit trail.
    if (quantity > 0) {
      const openingAdjustment: AdjustmentDocument = {
        productId: result.insertedId,
        productName: name,
        sku,
        type: "Stock received",
        quantity,
        previousQuantity: 0,
        newQuantity: quantity,
        change: quantity,
        reason: "Opening stock",
        reference: "",
        createdAt: now,
      };

      await db
        .collection<AdjustmentDocument>("stock_adjustments")
        .insertOne(openingAdjustment);
    }

    res.status(201).json({
      success: true,
      message: "Product created successfully.",
      product: serializeProduct({
        _id: result.insertedId,
        ...newProduct,
      }),
    });
  } catch (error) {
    // Handles a duplicate-key error if a unique SKU index is added.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        success: false,
        message: "That SKU already exists.",
      });
      return;
    }

    console.error("Could not create product:", error);

    res.status(500).json({
      success: false,
      message: "Could not create product.",
    });
  }
});

// PUT /api/products/:id
// Updates product details, not quantity.
// All stock changes must go through the adjustment endpoint.
app.put("/api/products/:id", requireAuth,
  async (req: Request, res: Response) => {
  try {
    const productId = getProductId(req.params.id);

    if (!productId) {
      res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
      return;
    }

    const allowedFields = [
      "name",
      "sku",
      "category",
      "brand",
      "costPrice",
      "sellingPrice",
      "reorderLevel",
      "active",
    ];

    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, field)) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        success: false,
        message: "No supported product fields were provided.",
      });
      return;
    }

    // Validate fields before saving them.
    for (const field of ["name", "category", "brand"] as const) {
      if (field in updates) {
        if (typeof updates[field] !== "string") {
          res.status(400).json({
            success: false,
            message: `${field} must be text.`,
          });
          return;
        }

        updates[field] = (updates[field] as string).trim();

        if (field !== "brand" && !updates[field]) {
          res.status(400).json({
            success: false,
            message: `${field} cannot be empty.`,
          });
          return;
        }
      }
    }

    if ("sku" in updates) {
      if (typeof updates.sku !== "string" || !updates.sku.trim()) {
        res.status(400).json({
          success: false,
          message: "SKU cannot be empty.",
        });
        return;
      }

      updates.sku = updates.sku.trim().toUpperCase();
    }

    for (const field of [
      "costPrice",
      "sellingPrice",
      "reorderLevel",
    ] as const) {
      if (field in updates && !isNonNegativeNumber(updates[field])) {
        res.status(400).json({
          success: false,
          message: `${field} must be a non-negative number.`,
        });
        return;
      }
    }

    if (
      "reorderLevel" in updates &&
      !Number.isInteger(updates.reorderLevel)
    ) {
      res.status(400).json({
        success: false,
        message: "Reorder level must be a whole number.",
      });
      return;
    }

    if ("active" in updates && typeof updates.active !== "boolean") {
      res.status(400).json({
        success: false,
        message: "Active must be true or false.",
      });
      return;
    }

    const db = await connectToDatabase();
    const products = db.collection<ProductDocument>("products");

    // Prevent changing a product's SKU to one already assigned elsewhere.
    if (updates.sku) {
      const duplicateSku = await products.findOne({
        sku: updates.sku,
        _id: { $ne: productId },
      });

      if (duplicateSku) {
        res.status(409).json({
          success: false,
          message: `SKU "${updates.sku}" already exists.`,
        });
        return;
      }
    }

    const result = await products.findOneAndUpdate(
      { _id: productId },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!result) {
      res.status(404).json({
        success: false,
        message: "Product not found.",
      });
      return;
    }

    res.json({
      success: true,
      message: "Product updated successfully.",
      product: serializeProduct(result),
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        success: false,
        message: "That SKU already exists.",
      });
      return;
    }

    console.error("Could not update product:", error);

    res.status(500).json({
      success: false,
      message: "Could not update product.",
    });
  }
});

// ---------------------------------------------------------
// 6. STOCK ADJUSTMENTS AND HISTORY
// ---------------------------------------------------------

// GET /api/products/:id/adjustments
// Returns a product's stock movement history, newest first.
app.get(
  "/api/products/:id/adjustments",
  async (req: Request, res: Response) => {
    try {
      const productId = getProductId(req.params.id);

      if (!productId) {
        res.status(400).json({
          success: false,
          message: "Invalid product ID.",
        });
        return;
      }

      const db = await connectToDatabase();

      const adjustments = await db
        .collection<AdjustmentDocument>("stock_adjustments")
        .find({ productId })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        success: true,
        adjustments: adjustments.map((adjustment) => ({
          ...adjustment,
          id: String(adjustment._id),
          productId: String(adjustment.productId),
        })),
      });
    } catch (error) {
      console.error("Could not fetch stock history:", error);

      res.status(500).json({
        success: false,
        message: "Could not fetch stock history.",
      });
    }
  }
);

// POST /api/products/:id/adjustments
//
// For Stock received: quantity is added.
// For Stock issued, Damaged stock and Lost stock: quantity is subtracted.
// For Stock correction: quantity is the NEW total stock, including zero.
//
// Each successful adjustment creates an audit record.
app.post("/api/products/:id/adjustments",
  async (req: Request, res: Response) => {
    try {
      const productId = getProductId(req.params.id);

      if (!productId) {
        res.status(400).json({
          success: false,
          message: "Invalid product ID.",
        });
        return;
      }

      const type = req.body?.type as AdjustmentType;
      const quantity = req.body?.quantity;
      const reason = cleanString(req.body?.reason);
      const reference = cleanString(req.body?.reference);

      if (!adjustmentTypes.includes(type)) {
        res.status(400).json({
          success: false,
          message: "Invalid stock adjustment type.",
        });
        return;
      }

      // Corrections may set stock to zero; other adjustment quantities
      // must be positive whole numbers.
      const validQuantity =
        type === "Stock correction"
          ? isNonNegativeNumber(quantity) && Number.isInteger(quantity)
          : isPositiveInteger(quantity);

      if (!validQuantity) {
        res.status(400).json({
          success: false,
          message:
            type === "Stock correction"
              ? "Corrected stock must be a non-negative whole number."
              : "Adjustment quantity must be a positive whole number.",
        });
        return;
      }

      if (!reason) {
        res.status(400).json({
          success: false,
          message: "Provide a reason for the stock adjustment.",
        });
        return;
      }

      const db = await connectToDatabase();
      const products = db.collection<ProductDocument>("products");

      const product = await products.findOne({
        _id: productId,
        active: { $ne: false },
      });

      if (!product) {
        res.status(404).json({
          success: false,
          message: "Active product not found.",
        });
        return;
      }

      const previousQuantity = product.quantity;
      let newQuantity: number;
      let change: number;

      if (type === "Stock correction") {
        newQuantity = quantity as number;
        change = newQuantity - previousQuantity;
      } else if (type === "Stock received") {
        change = quantity as number;
        newQuantity = previousQuantity + change;
      } else {
        change = -(quantity as number);
        newQuantity = previousQuantity + change;

        if (newQuantity < 0) {
          res.status(400).json({
            success: false,
            message: `Insufficient stock. Available quantity: ${previousQuantity}.`,
          });
          return;
        }
      }

      // Compare-and-set: update only if the stock still equals the
      // quantity we just read. This prevents silently overwriting a
      // concurrent stock change.
      const updatedProduct = await products.findOneAndUpdate(
        { _id: productId, quantity: previousQuantity },
        {
          $set: {
            quantity: newQuantity,
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );

      if (!updatedProduct) {
        res.status(409).json({
          success: false,
          message:
            "Stock changed during this adjustment. Refresh and try again.",
        });
        return;
      }

      const adjustment: AdjustmentDocument = {
        productId,
        productName: product.name,
        sku: product.sku,
        type,
        // For corrections, this is the corrected final quantity.
        // previousQuantity, newQuantity and change explain the movement.
        quantity: quantity as number,
        previousQuantity,
        newQuantity,
        change,
        reason,
        reference,
        createdAt: new Date(),
      };

      // Save the audit entry after the stock update.
      await db
        .collection<AdjustmentDocument>("stock_adjustments")
        .insertOne(adjustment);

      res.status(201).json({
        success: true,
        message: "Stock adjustment recorded successfully.",
        product: serializeProduct(updatedProduct),
        adjustment: {
          ...adjustment,
          productId: String(productId),
        },
      });
    } catch (error) {
      console.error("Stock adjustment failed:", error);

      res.status(500).json({
        success: false,
        message: "Could not record stock adjustment.",
      });
    }
  }
);

/* ---------------------------------------------------------
   CUSTOMER DATABASE
   --------------------------------------------------------- */

type CustomerType = "Customer" | "Company account";

type CustomerDocument = {
  name: string;
  phone: string;
  email: string;
  address: string;
  customerType: CustomerType;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

function serializeCustomer(customer: Document) {
  return {
    ...customer,
    id: String(customer._id),
    _id: String(customer._id),
  };
}

// Require authentication for all customer operations.
app.use("/api/customers", requireAuth);


// GET /api/customers?search=...
app.get("/api/customers", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const collection = db.collection<CustomerDocument>("customers");
    const search = cleanString(req.query.search).slice(0, 100);
    const requestedLimit = Number(req.query.limit ?? 200);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 200;

    const filter: Record<string, unknown> = {};

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expression = new RegExp(escaped, "i");

      filter.$or = [
        { name: expression },
        { phone: expression },
        { email: expression },
        { address: expression },
      ];
    }

    const customers = await collection
      .find(filter)
      .sort({ name: 1 })
      .limit(limit)
      .toArray();

    res.json({
      success: true,
      customers: customers.map((customer) =>
        serializeCustomer(customer as unknown as Document)
      ),
      count: customers.length,
    });
  } catch (error) {
    console.error("Could not fetch customers:", error);
    res.status(500).json({
      success: false,
      message: "Could not fetch customers.",
    });
  }
});

// GET /api/customers/:id
app.get("/api/customers/:id", async (req: Request, res: Response) => {
  try {
    const customerId = getProductId(req.params.id);

    if (!customerId) {
      res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
      return;
    }

    const db = await connectToDatabase();
    const customer = await db
      .collection<CustomerDocument>("customers")
      .findOne({ _id: customerId });

    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
      return;
    }

    res.json({
      success: true,
      customer: serializeCustomer(customer as unknown as Document),
    });
  } catch (error) {
    console.error("Could not fetch customer:", error);
    res.status(500).json({
      success: false,
      message: "Could not fetch customer.",
    });
  }
});

// POST /api/customers
app.post("/api/customers", async (req: Request, res: Response) => {
  try {
    const name = cleanString(req.body?.name ?? req.body?.customerName);
    const phone = cleanString(req.body?.phone ?? req.body?.customerPhone);
    const email = cleanString(req.body?.email ?? req.body?.customerEmail).toLowerCase();
    const address = cleanString(req.body?.address ?? req.body?.customerAddress);
    const requestedType = cleanString(req.body?.customerType);
    const notes = cleanString(req.body?.notes);

    const customerType: CustomerType =
      requestedType === "Company account" ? "Company account" : "Customer";

    if (!name) {
      res.status(400).json({
        success: false,
        message: "Customer name is required.",
      });
      return;
    }

    if (name.length > 150 || phone.length > 40 ||
        email.length > 254 || address.length > 300 ||
        notes.length > 2000) {
      res.status(400).json({
        success: false,
        message: "One or more customer fields exceed the allowed length.",
      });
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
      return;
    }

    const db = await connectToDatabase();
    const customers = db.collection<CustomerDocument>("customers");

    // Avoid registering the same customer twice when a phone or email
    // has already been supplied. Names alone are not unique.
    if (phone || email) {
      const duplicateConditions: Record<string, string>[] = [];

      if (phone) duplicateConditions.push({ phone });
      if (email) duplicateConditions.push({ email });

      const existing = await customers.findOne({
        $or: duplicateConditions,
      });

      if (existing) {
        res.status(409).json({
          success: false,
          message: "A customer with that phone number or email already exists.",
          customer: serializeCustomer(existing as unknown as Document),
        });
        return;
      }
    }

    const now = new Date();

    const newCustomer: CustomerDocument = {
      name,
      phone,
      email,
      address,
      customerType,
      notes,
      createdAt: now,
      updatedAt: now,
    };

    const result = await customers.insertOne(newCustomer);

    res.status(201).json({
      success: true,
      message: "Customer registered successfully.",
      customer: serializeCustomer({
        _id: result.insertedId,
        ...newCustomer,
      } as unknown as Document),
    });
  } catch (error) {
    console.error("Could not register customer:", error);
    res.status(500).json({
      success: false,
      message: "Could not register customer.",
    });
  }
});

// PUT /api/customers/:id
app.put("/api/customers/:id", async (req: Request, res: Response) => {
  try {
    const customerId = getProductId(req.params.id);

    if (!customerId) {
      res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
      return;
    }

    const allowedFields = [
      "name",
      "phone",
      "email",
      "address",
      "customerType",
      "notes",
    ] as const;

    const updates: Record<string, string> = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, field)) {
        if (typeof req.body[field] !== "string") {
          res.status(400).json({
            success: false,
            message: `${field} must be text.`,
          });
          return;
        }

        updates[field] = req.body[field].trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        success: false,
        message: "Provide at least one customer field to update.",
      });
      return;
    }

    if ("name" in updates && !updates.name) {
      res.status(400).json({
        success: false,
        message: "Customer name cannot be empty.",
      });
      return;
    }

    if (
      "customerType" in updates &&
      !["Customer", "Company account"].includes(updates.customerType)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid customer type.",
      });
      return;
    }

    if (
      "email" in updates &&
      updates.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)
    ) {
      res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
      return;
    }

    if ("email" in updates) {
      updates.email = updates.email.toLowerCase();
    }

    if (
      ("phone" in updates && updates.phone) ||
      ("email" in updates && updates.email)
    ) {
      const duplicateConditions: Record<string, string>[] = [];

      if (updates.phone) duplicateConditions.push({ phone: updates.phone });
      if (updates.email) duplicateConditions.push({ email: updates.email });

      if (duplicateConditions.length) {
        const duplicate = await (await connectToDatabase())
          .collection<CustomerDocument>("customers")
          .findOne({
            _id: { $ne: customerId },
            $or: duplicateConditions,
          });

        if (duplicate) {
          res.status(409).json({
            success: false,
            message: "Another customer already uses that phone number or email.",
          });
          return;
        }
      }
    }

    const db = await connectToDatabase();

    const updated = await db
      .collection<CustomerDocument>("customers")
      .findOneAndUpdate(
        { _id: customerId },
        { $set: { ...updates, updatedAt: new Date() } },
        { returnDocument: "after" }
      );

    if (!updated) {
      res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
      return;
    }

    res.json({
      success: true,
      message: "Customer updated successfully.",
      customer: serializeCustomer(updated as unknown as Document),
    });
  } catch (error) {
    console.error("Could not update customer:", error);
    res.status(500).json({
      success: false,
      message: "Could not update customer.",
    });
  }
});

// ---------------------------------------------------------
// 7. POINT OF SALE / SALES HISTORY
// ---------------------------------------------------------

type SaleItemInput = {
  productId: string;
  quantity: number;
  discount?: number; // Per-line discount percentage from 0 to 100.
};

type SaleLine = {
  productId: ObjectId;
  name: string;
  sku: string;
  category: string;
  brand: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  discountAmount: number;
  lineTotal: number;
};


// ---------------------------------------------------------
// DASHBOARD SUMMARY
// ---------------------------------------------------------

// Require authentication for dashboard data.
app.use("/api/dashboard", requireAuth);

// GET /api/dashboard?period=7|30|90
// Uses saved MongoDB records; it does not rely on the paginated sales endpoint.
app.get("/api/dashboard", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const requestedPeriod = Number(req.query.period ?? 7);
    const periodDays = [7, 30, 90].includes(requestedPeriod) ? requestedPeriod : 7;
    const now = new Date();

    // The business operates in Uganda (Africa/Kampala, UTC+3).
    const kampalaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Kampala",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [year, month, day] = kampalaDate.split("-").map(Number);
    const todayStart = new Date(Date.UTC(year, month - 1, day) - 3 * 60 * 60 * 1000);
    const rangeStart = new Date(todayStart.getTime() - (periodDays - 1) * 24 * 60 * 60 * 1000);

    const productsCollection = db.collection<ProductDocument>("products");
    const salesCollection = db.collection("sales");
    const activeProducts = await productsCollection
      .find({ active: { $ne: false } })
      .project({ name: 1, sku: 1, quantity: 1, reorderLevel: 1, category: 1 })
      .toArray();

    const [periodSales, outstandingSales] = await Promise.all([
      salesCollection.find({ createdAt: { $gte: rangeStart, $lte: now } })
        .sort({ createdAt: -1 })
        .toArray(),
      salesCollection.find({ balance: { $gt: 0 } })
        .project({ balance: 1, customerName: 1, customer: 1 })
        .toArray(),
    ]);

    const dateKey = (value: Date | string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Kampala",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value));

    const todayKey = dateKey(now);
    const todaySales = periodSales.filter((sale) => sale.createdAt && dateKey(sale.createdAt) === todayKey);
    const revenueToday = todaySales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0);
    const lowStockProducts = activeProducts
      .filter((product) => Number(product.quantity || 0) <= Number(product.reorderLevel ?? 5))
      .sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0))
      .slice(0, 8)
      .map((product) => ({
        name: product.name,
        sku: product.sku,
        stock: Number(product.quantity || 0),
        reorderLevel: Number(product.reorderLevel ?? 5),
      }));

    const chartByDate = new Map<string, number>();
    for (let offset = 0; offset < periodDays; offset += 1) {
      const date = new Date(rangeStart.getTime() + offset * 24 * 60 * 60 * 1000);
      chartByDate.set(dateKey(date), 0);
    }
    for (const sale of periodSales) {
      if (!sale.createdAt) continue;
      const key = dateKey(sale.createdAt);
      if (chartByDate.has(key)) {
        chartByDate.set(key, (chartByDate.get(key) || 0) + Number(sale.grandTotal || 0));
      }
    }

    const revenueChart = Array.from(chartByDate.entries()).map(([date, amount]) => ({
      date,
      label: new Intl.DateTimeFormat("en-UG", {
        timeZone: "Africa/Kampala",
        day: "numeric",
        month: periodDays === 7 ? "short" : undefined,
      }).format(new Date(`${date}T12:00:00+03:00`)),
      amount,
    }));

    const bestSellers = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const sale of periodSales) {
      for (const item of Array.isArray(sale.items) ? sale.items : []) {
        const key = String(item.productId || item.sku || item.name || "unknown");
        const existing = bestSellers.get(key) || {
          name: String(item.name || "Unknown product"),
          quantity: 0,
          revenue: 0,
        };
        existing.quantity += Number(item.quantity || 0);
        existing.revenue += Number(item.lineTotal ?? (Number(item.unitPrice || 0) * Number(item.quantity || 0)));
        bestSellers.set(key, existing);
      }
    }

    res.json({
      success: true,
      generatedAt: now.toISOString(),
      periodDays,
      stats: {
        revenueToday,
        transactionsToday: todaySales.length,
        averageSaleToday: todaySales.length ? Math.round(revenueToday / todaySales.length) : 0,
        activeProducts: activeProducts.length,
        categoryCount: new Set(activeProducts.map((product) => product.category).filter(Boolean)).size,
        lowStockCount: activeProducts.filter((product) => Number(product.quantity || 0) <= Number(product.reorderLevel ?? 5)).length,
        outOfStockCount: activeProducts.filter((product) => Number(product.quantity || 0) <= 0).length,
        outstandingBalance: outstandingSales.reduce((sum, sale) => sum + Number(sale.balance || 0), 0),
        customersWithBalances: new Set(outstandingSales.map((sale) => String(sale.customerId || sale.customerName || sale.customer || "Walk-in customer"))).size,
      },
      revenueChart,
      lowStockProducts,
      recentSales: periodSales.slice(0, 8).map((sale) => ({
        id: String(sale._id),
        ref: String(sale.receiptNumber || sale._id),
        createdAt: sale.createdAt,
        customer: String(sale.customerName || sale.customer || "Walk-in customer"),
        total: Number(sale.grandTotal || 0),
        status: String(sale.paymentStatus || (Number(sale.balance || 0) > 0 ? (Number(sale.amountPaid || 0) > 0 ? "partial" : "unpaid") : "paid")),
      })),
      bestSellingProducts: Array.from(bestSellers.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5),
    });
  } catch (error) {
    console.error("Could not load dashboard data:", error);
    res.status(500).json({ success: false, message: "Could not load dashboard data." });
  }
});

// Require authentication for all sales operations.
app.use("/api/sales", requireAuth);

// GET /api/sales
// Returns recent saved sales for the Sales History page.
app.get("/api/sales", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const requestedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 50;

    const sales = await db
      .collection("sales")
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({
      success: true,
      sales: sales.map((sale) => ({
        ...sale,
        id: String(sale._id),
        _id: String(sale._id),
      })),
      count: sales.length,
    });
  } catch (error) {
    console.error("Could not fetch sales:", error);
    res.status(500).json({ success: false, message: "Could not fetch sales history." });
  }
});

// GET /api/sales/:id
// Returns a single saved sale, suitable for displaying or printing a receipt.
app.get("/api/sales/:id", async (req: Request, res: Response) => {
  try {
    const saleId = getProductId(req.params.id);
    if (!saleId) {
      res.status(400).json({ success: false, message: "Invalid sale ID." });
      return;
    }

    const db = await connectToDatabase();
    const sale = await db.collection("sales").findOne({ _id: saleId });
    if (!sale) {
      res.status(404).json({ success: false, message: "Sale not found." });
      return;
    }

    res.json({ success: true, sale: { ...sale, id: String(sale._id), _id: String(sale._id) } });
  } catch (error) {
    console.error("Could not fetch sale:", error);
    res.status(500).json({ success: false, message: "Could not fetch sale." });
  }
});

// POST /api/sales
// Finalizes a checkout. Product prices and stock always come from MongoDB,
// never from the browser. Stock deduction, audit records, and sale insertion
// run in one transaction so a failed checkout cannot leave partial changes.
app.post("/api/sales", async (req: Request, res: Response) => {
  const session = client.startSession();

  try {
    const clientSaleId = typeof req.body?.clientSaleId === "string" ? req.body.clientSaleId.trim() : "";
    if (clientSaleId.length > 120) {
      res.status(400).json({ success: false, message: "Invalid sale request ID." });
      return;
    }
    const items = req.body?.items as SaleItemInput[] | undefined;
    // Customer details submitted by the POS checkout.
const customer = cleanString(req.body?.customerName ?? req.body?.customer)
  || "Walk-in customer";

const customerName = customer;
const customerPhone = cleanString(req.body?.customerPhone);
const customerEmail = cleanString(req.body?.customerEmail);
const customerAddress = cleanString(req.body?.customerAddress);
const customerType =
  cleanString(req.body?.customerType) === "Company account"
    ? "Company account"
    : "Customer";

    // Optional link to a registered customer.
// Walk-in sales remain supported.
const customerIdInput = cleanString(req.body?.customerId);
let customerId: ObjectId | null = null;

if (customerIdInput) {
  if (!ObjectId.isValid(customerIdInput)) {
    res.status(400).json({
      success: false,
      message: "Invalid customer ID.",
    });
    return;
  }

  customerId = new ObjectId(customerIdInput);
}

const paymentMethod = cleanString(req.body?.paymentMethod);
    const amountPaidInput = req.body?.amountPaid;
    const overallDiscountInput = req.body?.overallDiscount ?? 0;
    const taxEnabled = req.body?.taxEnabled === true;
    const allowedPaymentMethods = ["Cash", "Mobile Money", "Bank transfer", "Card"];

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, message: "Add at least one product to the sale." });
      return;
    }
    if (!allowedPaymentMethods.includes(paymentMethod)) {
      res.status(400).json({ success: false, message: "Select a valid payment method." });
      return;
    }
    if (!isNonNegativeNumber(amountPaidInput)) {
      res.status(400).json({ success: false, message: "Amount paid must be a non-negative number." });
      return;
    }
    if (!isNonNegativeNumber(overallDiscountInput)) {
      res.status(400).json({ success: false, message: "Overall discount must be a non-negative amount." });
      return;
    }

    // Combine repeated product lines so a product cannot bypass stock checks
    // by being added to the cart more than once.
    const combined = new Map<string, { quantity: number; discount: number }>();
    for (const item of items) {
      if (!item || typeof item.productId !== "string" || !getProductId(item.productId)) {
        res.status(400).json({ success: false, message: "A sale contains an invalid product ID." });
        return;
      }
      if (!isPositiveInteger(item.quantity)) {
        res.status(400).json({ success: false, message: "Each sale quantity must be a positive whole number." });
        return;
      }
      const discount = item.discount ?? 0;
      if (typeof discount !== "number" || !Number.isFinite(discount) || discount < 0 || discount > 100) {
        res.status(400).json({ success: false, message: "Line discounts must be between 0 and 100 percent." });
        return;
      }

      const previous = combined.get(item.productId);
      if (previous && previous.discount !== discount) {
        res.status(400).json({ success: false, message: "The same product cannot have different discounts on separate lines." });
        return;
      }
      combined.set(item.productId, {
        quantity: (previous?.quantity ?? 0) + item.quantity,
        discount,
      });
    }

    const db = await connectToDatabase();
    // Ensure the selected customer exists before processing the sale.
if (customerId) {
  const registeredCustomer = await db
    .collection<CustomerDocument>("customers")
    .findOne({ _id: customerId });

  if (!registeredCustomer) {
    res.status(400).json({
      success: false,
      message: "Selected customer does not exist. Refresh the customer list.",
    });
    return;
  }
}

    const products = db.collection<ProductDocument>("products");
    const adjustments = db.collection<AdjustmentDocument>("stock_adjustments");
    const sales = db.collection("sales");

    // Return the original result when a checkout is retried with the same ID.
    if (clientSaleId) {
      const existing = await sales.findOne({ clientSaleId });
      if (existing) {
        res.status(200).json({
          success: true,
          message: "Sale was already completed.",
          sale: { ...existing, id: String(existing._id), _id: String(existing._id) },
        });
        return;
      }
    }

    const now = new Date();
    const receiptNumber = `MS-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    let savedSale: Document | null = null;

    await session.withTransaction(async () => {
      const saleLines: SaleLine[] = [];

      // Read and validate every product inside the transaction before changing stock.
      for (const [id, requested] of combined.entries()) {
        const productId = new ObjectId(id);
        const product = await products.findOne(
          { _id: productId, active: { $ne: false } },
          { session }
        );

        if (!product) {
          throw new Error(`PRODUCT_NOT_FOUND:${id}`);
        }
        if (product.quantity < requested.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${product.name}:${product.quantity}`);
        }

        // Calculate all monetary values on the server using the saved selling price.
        const unitPrice = Number(product.sellingPrice);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new Error(`INVALID_PRICE:${product.name}`);
        }
        const grossLine = unitPrice * requested.quantity;
        const discountAmount = Math.round((grossLine * requested.discount) / 100);
        saleLines.push({
          productId,
          name: product.name,
          sku: product.sku,
          category: product.category,
          brand: product.brand,
          unitPrice,
          quantity: requested.quantity,
          discountPercent: requested.discount,
          discountAmount,
          lineTotal: grossLine - discountAmount,
        });
      }

      const subtotal = saleLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
      const lineDiscountTotal = saleLines.reduce((sum, line) => sum + line.discountAmount, 0);
      const beforeOverallDiscount = Math.max(0, subtotal - lineDiscountTotal);
      const overallDiscount = Math.min(overallDiscountInput, beforeOverallDiscount);
      const taxableAmount = Math.max(
  0,
  beforeOverallDiscount - overallDiscount,
);

// Read the authoritative tax configuration saved in business settings.
const savedSettings = await db
  .collection<BusinessSettingsDocument>("settings")
  .findOne({ _id: "business" }, { session });

const configuredTaxEnabled =
  savedSettings?.taxEnabled === true;

const configuredTaxLabel =
  typeof savedSettings?.taxLabel === "string" &&
  savedSettings.taxLabel.trim()
    ? savedSettings.taxLabel.trim()
    : "Tax";

const configuredTaxRate = Number(savedSettings?.taxRate ?? 0);

if (
  !Number.isFinite(configuredTaxRate) ||
  configuredTaxRate < 0 ||
  configuredTaxRate > 100
) {
  throw new Error("INVALID_TAX_CONFIGURATION");
}

const taxEnabled = configuredTaxEnabled;
const taxLabel = configuredTaxLabel;
const taxRate = taxEnabled ? configuredTaxRate : 0;

const tax = Math.round((taxableAmount * taxRate) / 100);
const grandTotal = taxableAmount + tax;
      const amountPaid = Math.min(amountPaidInput, grandTotal);
      const balance = Math.max(0, grandTotal - amountPaid);
      const change = Math.max(0, amountPaidInput - grandTotal);
      const paymentStatus = balance === 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid";

      // Use conditional stock updates as an extra guard against overselling.
      for (const line of saleLines) {
        const previous = await products.findOne(
          { _id: line.productId },
          { session, projection: { quantity: 1 } }
        );
        if (!previous || previous.quantity < line.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${line.name}:${previous?.quantity ?? 0}`);
        }

        const update = await products.updateOne(
          { _id: line.productId, quantity: { $gte: line.quantity }, active: { $ne: false } },
          { $inc: { quantity: -line.quantity }, $set: { updatedAt: now } },
          { session }
        );
        if (update.modifiedCount !== 1) {
          throw new Error(`INSUFFICIENT_STOCK:${line.name}:0`);
        }

        // Sales are also written to stock history so inventory audits show the deduction.
        await adjustments.insertOne({
          productId: line.productId,
          productName: line.name,
          sku: line.sku,
          type: "Stock issued",
          quantity: line.quantity,
          previousQuantity: previous.quantity,
          newQuantity: previous.quantity - line.quantity,
          change: -line.quantity,
          reason: "Customer sale",
          reference: receiptNumber,
          createdAt: now,
        }, { session });
      }

      const saleDocument = {
  ...(clientSaleId ? { clientSaleId } : {}),
  receiptNumber,

  // Preserve the existing customer field for compatibility with other pages.
  customer,
customerId: customerId ? String(customerId) : null,
customerName,
customerPhone,
customerEmail,
customerAddress,
customerType,

  items: saleLines.map((line) => ({          ...line,
          productId: String(line.productId),
        })),
        subtotal,
        lineDiscountTotal,
        overallDiscount,
        taxEnabled,
        taxLabel,
        taxRate,
        tax,
        grandTotal,
        paymentMethod,
        amountPaid,
        balance,
        change,
        paymentStatus,
        createdAt: now,
        updatedAt: now,
      };

      const insertResult = await sales.insertOne(saleDocument, { session });
      savedSale = { _id: insertResult.insertedId, ...saleDocument };
    });

    res.status(201).json({
      success: true,
      message: "Sale completed and stock updated successfully.",
      sale: (() => {
  const finalSale = savedSale as unknown as Document | null;

  return finalSale
    ? {
        ...finalSale,
        id: String(finalSale._id),
        _id: String(finalSale._id),
      }
    : null;
})(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("POS sale failed:", message);

    if (message.startsWith("PRODUCT_NOT_FOUND:")) {
      res.status(404).json({ success: false, message: "One of the products is no longer available. Refresh the catalogue and try again." });
      return;
    }
    if (message.startsWith("INSUFFICIENT_STOCK:")) {
      const details = message.split(":");
      res.status(409).json({ success: false, message: `Insufficient stock for ${details[1]}. Available quantity: ${details[2] ?? "0"}. Refresh the catalogue and adjust the cart.` });
      return;
    }
    if (message.startsWith("INVALID_PRICE:")) {
      res.status(400).json({ success: false, message: "A product has an invalid selling price. Correct the product before selling it." });
      return;
    }

    // Transactions require a MongoDB replica set or sharded cluster (Atlas supports this).
    res.status(500).json({ success: false, message: "Could not complete the sale. No stock changes were committed." });
  } finally {
    await session.endSession();
  }
});

// ---------------------------------------------------------
// 8. ERROR HANDLING
// ---------------------------------------------------------

// Handle invalid uploads and other errors passed through Express middleware.
app.use(
  (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error("API middleware error:", error.message);

    if (error instanceof multer.MulterError) {
      res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Image must not exceed 5 MB."
            : "Image upload error.",
      });
      return;
    }

    if (error.message.startsWith("CORS blocked origin:")) {
      res.status(403).json({
        success: false,
        message: "This frontend origin is not allowed.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "An unexpected server error occurred.",
    });
  }
);

// ---------------------------------------------------------
// 9. START SERVER
// ---------------------------------------------------------

async function startServer() {
  try {
    const db = await connectToDatabase();
    await db.collection("sales").createIndex({ clientSaleId: 1 }, { unique: true, sparse: true });

    configureAuthDatabase(db);
  configureUserRoutesDatabase(db);

    app.listen(port, () => {
      console.log(`MS Home Security API running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
  }
}

void startServer();
