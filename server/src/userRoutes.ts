import { Router, type Request, type Response } from "express";
import { ObjectId, type Db } from "mongodb";
import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  serializeUser,
  type UserDocument,
} from "./auth.js";
import { requireAuth, requireRole } from "./authMiddleware.js";

const router = Router();
let database: Db | null = null;

export function configureUserRoutesDatabase(db: Db) {
  database = db;
}

function usersCollection() {
  if (!database) {
    throw new Error("User routes database has not been configured.");
  }
  return database.collection<UserDocument>("users");
}

// All account-management endpoints are administrator-only.
router.use(requireAuth, requireRole("admin"));

// List users without exposing password hashes.
router.get("/", async (_req: Request, res: Response) => {
  try {
    const users = await usersCollection()
      .find({})
      .sort({ name: 1 })
      .toArray();

    res.json({
      success: true,
      users: users.map((user) => ({
        ...serializeUser(user),
        active: user.active !== false,
      })),
    });
  } catch (error) {
    console.error("Failed to list users:", error);
    res.status(500).json({ message: "Failed to load users." });
  }
});

// Administrators can create staff accounts. New accounts cannot choose
// their own role, and passwords are stored only as bcrypt hashes.
router.post("/", async (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = normalizeEmail(
      typeof req.body?.email === "string" ? req.body.email : ""
    );
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (name.length < 2 || name.length > 100) {
      res.status(400).json({ message: "Name must be between 2 and 100 characters." });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ message: "Enter a valid email address." });
      return;
    }

    if (password.length < 12 || password.length > 128) {
      res.status(400).json({ message: "Password must be between 12 and 128 characters." });
      return;
    }

    const users = usersCollection();
    const existing = await users.findOne({ email });

    if (existing) {
      res.status(409).json({ message: "An account with this email already exists." });
      return;
    }

    const now = new Date();
    const newUser = {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "staff" as const,
      active: true,
      photoUrl: "",
      createdAt: now,
      updatedAt: now,
    };

    const result = await users.insertOne(newUser);
    const created = await users.findOne({ _id: result.insertedId });

    if (!created) {
      res.status(500).json({ message: "Account was created but could not be loaded." });
      return;
    }

    res.status(201).json({
      success: true,
      message: "Staff account created successfully.",
      user: { ...serializeUser(created), active: created.active !== false },
    });
  } catch (error) {
    console.error("Failed to create staff account:", error);
    res.status(500).json({ message: "Failed to create staff account." });
  }
});

// Administrators may activate/deactivate staff accounts.
// Admin accounts cannot be deactivated through this endpoint.
router.patch("/:id/active", async (req: Request, res: Response) => {
  try {
    const paramId = req.params.id;
    const id = Array.isArray(paramId) ? paramId[0] : paramId;
    if (typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid user ID." });
      return;
    }

    if (typeof req.body?.active !== "boolean") {
      res.status(400).json({ message: "The active field must be true or false." });
      return;
    }

    const users = usersCollection();
    const target = await users.findOne({ _id: new ObjectId(id) });

    if (!target) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    if (target.role === "admin") {
      res.status(403).json({ message: "Administrator accounts cannot be changed here." });
      return;
    }

    await users.updateOne(
      { _id: target._id },
      { $set: { active: req.body.active, updatedAt: new Date() } }
    );

    const updated = await users.findOne({ _id: target._id });
    res.json({
      success: true,
      message: req.body.active ? "Staff account activated." : "Staff account deactivated.",
      user: updated
        ? { ...serializeUser(updated), active: updated.active !== false }
        : null,
    });
  } catch (error) {
    console.error("Failed to update staff account:", error);
    res.status(500).json({ message: "Failed to update staff account." });
  }
});

export default router;
