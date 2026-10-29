
import type { Request, Response, NextFunction } from "express";
import { connectToDatabase } from "./db.js";
import { findActiveUserById, type UserRole } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        role: UserRole;
      };
    }
  }
}

// Require a valid session and an active user account.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const db = await connectToDatabase();
    const user = await findActiveUserById(db, userId);

    if (!user) {
      req.session.destroy(() => undefined);

      res.status(401).json({
        success: false,
        message: "Your account is unavailable. Please log in again.",
      });
      return;
    }

    req.authUser = {
      id: String(user._id),
      role: user.role,
    };

    next();
  } catch (error) {
    console.error("Authentication middleware failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to verify authentication.",
    });
  }
}

// Restrict an endpoint to the specified user roles.
// Use after requireAuth.
export function requireRole(...allowedRoles: UserRole[]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.authUser) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action.",
      });
      return;
    }

    next();
  };
}
