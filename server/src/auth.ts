
import "dotenv/config";
import type { Request, Response, NextFunction } from "express";
import type { Db, Document, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

export type UserRole = "admin" | "staff";

export interface UserDocument extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  photoUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  photoUrl: string;
}

export function serializeUser(user: UserDocument): SafeUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    photoUrl: user.photoUrl || "",
  };
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) {
    throw new Error("Password must be between 12 and 128 characters.");
  }

  return bcrypt.hash(password, 12);
}

export async function findActiveUserById(
  db: Db,
  id: string,
): Promise<UserDocument | null> {
  const { ObjectId } = await import("mongodb");

  if (!ObjectId.isValid(id)) {
    return null;
  }

  return db.collection<UserDocument>("users").findOne({
    _id: new ObjectId(id),
    active: true,
  });
}

export function unauthorized(
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  res.status(401).json({
    success: false,
    message: "Authentication is required.",
  });
}
