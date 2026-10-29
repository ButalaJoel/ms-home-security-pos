
import { Router, type Request, type Response } from "express";
import type { Db } from "mongodb";
import rateLimit from "express-rate-limit";
import {
  findActiveUserById,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  serializeUser,
  verifyPassword,
  type UserDocument,
} from "./auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});

let authDatabase: Db | null = null;

export function configureAuthDatabase(db: Db): void {
  authDatabase = db;
}

function getDatabase(): Db {
  if (!authDatabase) {
    throw new Error("Authentication database is not configured.");
  }

  return authDatabase;
}

function getSessionUserId(req: Request): string | undefined {
  return req.session?.userId;
}

// POST /api/auth/setup
// Creates the first administrator only. Requires a private setup key.
router.post("/setup", async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const setupKey = process.env.INITIAL_ADMIN_SETUP_KEY;
    const suppliedKey = req.get("x-setup-key");

    if (!setupKey || !suppliedKey || suppliedKey !== setupKey) {
      res.status(403).json({
        success: false,
        message: "Administrator setup is not authorized.",
      });
      return;
    }

    const users = db.collection<UserDocument>("users");

    if (await users.countDocuments({}) > 0) {
      res.status(409).json({
        success: false,
        message: "Administrator setup has already been completed.",
      });
      return;
    }

    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = normalizeEmail(req.body?.email);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!name || name.length > 100 || !isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: "Enter a valid name and email address.",
      });
      return;
    }

    if (password.length < 12 || password.length > 128) {
      res.status(400).json({
        success: false,
        message: "Password must be between 12 and 128 characters.",
      });
      return;
    }

    const now = new Date();

    const result = await users.insertOne({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "admin",
      active: true,
      photoUrl: "",
      createdAt: now,
      updatedAt: now,
    });

    const user = await users.findOne({ _id: result.insertedId });

    if (!user) {
      res.status(500).json({
        success: false,
        message: "Administrator was created but could not be retrieved.",
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: "Administrator account created. You can now log in.",
      user: serializeUser(user as UserDocument),
    });
  } catch (error) {
    console.error("Admin setup failed:", error);
    res.status(500).json({
      success: false,
      message: "Administrator setup failed.",
    });
  }
});

// POST /api/auth/login
router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const email = normalizeEmail(req.body?.email);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!isValidEmail(email) || !password || password.length > 128) {
      res.status(400).json({
        success: false,
        message: "Enter your email and password.",
      });
      return;
    }

    const user = await db.collection<UserDocument>("users").findOne({
      email,
      active: true,
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
      return;
    }

    req.session.regenerate((sessionError) => {
      if (sessionError) {
        console.error("Session regeneration failed:", sessionError);
        res.status(500).json({
          success: false,
          message: "Unable to start a secure session.",
        });
        return;
      }

      req.session.userId = String(user._id);

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save failed:", saveError);
          res.status(500).json({
            success: false,
            message: "Unable to save your session.",
          });
          return;
        }

        res.json({
          success: true,
          user: serializeUser(user),
        });
      });
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
    });
  }
});

// GET /api/auth/me
router.get("/me", async (req: Request, res: Response) => {
  try {
    const userId = getSessionUserId(req);

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "You are not logged in.",
      });
      return;
    }

    const user = await findActiveUserById(getDatabase(), userId);

    if (!user) {
      req.session.destroy(() => undefined);

      res.status(401).json({
        success: false,
        message: "Your account is unavailable. Please log in again.",
      });
      return;
    }

    res.json({
      success: true,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Session check failed:", error);
    res.status(500).json({
      success: false,
      message: "Unable to verify your session.",
    });
  }
});

// POST /api/auth/logout
router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((error) => {
    if (error) {
      res.status(500).json({
        success: false,
        message: "Unable to log out.",
      });
      return;
    }

    res.clearCookie("mspos.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    res.json({ success: true, message: "Logged out successfully." });
  });
});

export default router;
