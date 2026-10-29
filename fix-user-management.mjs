import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const server = path.join(root, "server", "src");
const indexPath = path.join(server, "index.ts");
const authPath = path.join(server, "auth.ts");
const middlewarePath = path.join(server, "authMiddleware.ts");
const userRoutesPath = path.join(server, "userRoutes.ts");

for (const file of [indexPath, authPath, middlewarePath]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Required file not found: ${file}`);
  }
}

if (fs.existsSync(userRoutesPath)) {
  throw new Error(
    "server/src/userRoutes.ts already exists. Installer stopped to avoid overwriting it."
  );
}

let index = fs.readFileSync(indexPath, "utf8");
const auth = fs.readFileSync(authPath, "utf8");
const middleware = fs.readFileSync(middlewarePath, "utf8");

for (const token of ["serializeUser", "hashPassword", "normalizeEmail", "isValidEmail"]) {
  if (!auth.includes(token)) {
    throw new Error(`auth.ts is missing expected export/reference: ${token}`);
  }
}

for (const token of ["requireAuth", "requireRole"]) {
  if (!middleware.includes(token)) {
    throw new Error(`authMiddleware.ts is missing expected middleware: ${token}`);
  }
}

if (!index.includes("configureAuthDatabase")) {
  throw new Error("Could not find configureAuthDatabase(db) in index.ts.");
}

if (!index.includes('app.use("/api/auth", authRoutes)')) {
  throw new Error('Could not find app.use("/api/auth", authRoutes) in index.ts.');
}

const changes = [];
function replaceOne(label, regex, replacement, required = false) {
  const matches = [...index.matchAll(regex)];
  if (matches.length > 1) {
    throw new Error(`Expected at most one match for "${label}", found ${matches.length}.`);
  }
  if (matches.length === 0) {
    if (required) throw new Error(`Could not find expected route for "${label}".`);
    changes.push(`Skipped ${label}: no admin-only guard found.`);
    return;
  }
  index = index.replace(regex, replacement);
  changes.push(`Updated ${label}.`);
}

// Keep login required, but allow both roles to operate the shop.
replaceOne(
  "settings update permissions",
  /app\.put\(\s*["']\/api\/settings["']\s*,\s*requireAuth\s*,\s*requireRole\("admin"\)\s*,/g,
  'app.put("/api/settings", requireAuth,',
  false
);

replaceOne(
  "logo upload permissions",
  /app\.post\(\s*["']\/api\/settings\/logo["']\s*,\s*requireAuth\s*,\s*requireRole\("admin"\)\s*,/g,
  'app.post("/api/settings/logo", requireAuth,',
  false
);

replaceOne(
  "product creation permissions",
  /app\.post\(\s*["']\/api\/products["']\s*,\s*requireAuth\s*,\s*requireRole\("admin"\)\s*,/g,
  'app.post("/api/products", requireAuth,',
  false
);

replaceOne(
  "product editing permissions",
  /app\.put\(\s*["']\/api\/products\/:id["']\s*,\s*requireAuth\s*,\s*requireRole\("admin"\)\s*,/g,
  'app.put("/api/products/:id", requireAuth,',
  false
);

replaceOne(
  "stock adjustment permissions",
  /app\.post\(\s*["']\/api\/products\/:id\/adjustments["']\s*,\s*requireRole\("admin"\)\s*,/g,
  'app.post("/api/products/:id/adjustments",',
  false
);

// Handle the earlier installer’s formatting where a guard may sit immediately
// before async with no whitespace.
replaceOne(
  "product creation compact guard",
  /app\.post\(\s*["']\/api\/products["']\s*,\s*requireAuth\s*,\s*requireRole\("admin"\)\s*,\s*async\s*\(/g,
  'app.post("/api/products", requireAuth, async (',
  false
);

replaceOne(
  "product editing compact guard",
  /app\.put\(\s*["']\/api\/products\/:id["']\s*,\s*requireAuth\s*,\s*requireRole\("admin"\)\s*,\s*async\s*\(/g,
  'app.put("/api/products/:id", requireAuth, async (',
  false
);

// User routes use the same MongoDB database as authentication.
const userRoutesSource = String.raw`import { Router, type Request, type Response } from "express";
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

    res.json(users.map((user) => serializeUser(user)));
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
      message: "Staff account created successfully.",
      user: serializeUser(created),
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
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
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
      message: req.body.active ? "Staff account activated." : "Staff account deactivated.",
      user: updated ? serializeUser(updated) : null,
    });
  } catch (error) {
    console.error("Failed to update staff account:", error);
    res.status(500).json({ message: "Failed to update staff account." });
  }
});

export default router;
`;

const importLine = 'import userRoutes, { configureUserRoutesDatabase } from "./userRoutes.js";';
if (!index.includes('from "./userRoutes.js"')) {
  const importMatches = [...index.matchAll(/^import .*;\s*$/gm)];
  if (!importMatches.length) throw new Error("Could not find import section in index.ts.");
  const lastImport = importMatches[importMatches.length - 1];
  const insertionPoint = lastImport.index + lastImport[0].length;
  index = index.slice(0, insertionPoint) + "\n" + importLine + index.slice(insertionPoint);
  changes.push("Added userRoutes import.");
} else {
  throw new Error("index.ts already imports userRoutes; inspect it before running this installer.");
}

const configureMatches = [...index.matchAll(/configureAuthDatabase\(\s*db\s*\)\s*;?/g)];
if (configureMatches.length !== 1) {
  throw new Error(`Expected one configureAuthDatabase(db) call; found ${configureMatches.length}.`);
}
const configure = configureMatches[0];
const configureText = configure[0];
index =
  index.slice(0, configure.index) +
  `${configureText}\n  configureUserRoutesDatabase(db);` +
  index.slice(configure.index + configureText.length);
changes.push("Configured user routes with the existing database.");

// Mount only once, immediately after the auth routes.
if (index.includes('app.use("/api/users"')) {
  throw new Error("A /api/users route is already mounted; inspect index.ts before continuing.");
}
index = index.replace(
  /app\.use\("\/api\/auth",\s*authRoutes\);/,
  (match) => `${match}\n  app.use("/api/users", userRoutes);`
);
if (!index.includes('app.use("/api/users", userRoutes);')) {
  throw new Error("Could not mount /api/users after the auth routes.");
}
changes.push("Mounted administrator-only /api/users endpoints.");

// Write backups first, then the validated changes.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${indexPath}.backup-${stamp}`;
fs.copyFileSync(indexPath, backupPath);
fs.writeFileSync(indexPath, index, "utf8");
fs.writeFileSync(userRoutesPath, userRoutesSource, "utf8");

console.log("\nUser management installer completed.");
console.log(`Backup: ${backupPath}`);
for (const change of changes) console.log(`- ${change}`);
console.log("\nNew endpoints:");
console.log("- GET    /api/users (admin only)");
console.log("- POST   /api/users (admin creates staff account only)");
console.log("- PATCH  /api/users/:id/active (admin only; staff accounts)");
console.log("\nNext: run npm run build from the server folder.");
