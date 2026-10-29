import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const serverFile = path.join(root, "server/src/index.ts");
const clientApp = path.join(root, "client/src/App.tsx");
const navigationFile = path.join(root, "client/src/data/navigation.ts");
const sidebarFile = path.join(root, "client/src/components/layout/Sidebar.tsx");
const usersPage = path.join(root, "client/src/pages/UsersPage.tsx");

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Required file missing: ${file}`);
  return fs.readFileSync(file, "utf8");
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(file, `${file}.backup-${stamp}`);
}

function writeNew(file, content) {
  if (fs.existsSync(file)) throw new Error(`Refusing to overwrite existing file: ${file}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function update(file, transform) {
  const before = read(file);
  const after = transform(before);
  if (before === after) return console.log(`UNCHANGED ${path.relative(root, file)}`);
  backup(file);
  fs.writeFileSync(file, after, "utf8");
  console.log(`UPDATED   ${path.relative(root, file)}`);
}

const userRoutesSource = `import { Router, type Request, type Response } from "express";
import { ObjectId, type Db } from "mongodb";
import {
  hashPassword,
  normalizeEmail,
  isValidEmail,
  serializeUser,
  type UserDocument,
} from "./auth.js";
import { requireAuth, requireRole } from "./authMiddleware.js";

const router = Router();
let database: Db | null = null;

export function configureUserDatabase(db: Db) {
  database = db;
}

function getUsers() {
  if (!database) throw new Error("User database has not been initialized.");
  return database.collection<UserDocument>("users");
}

function sendError(res: Response, status: number, message: string) {
  return res.status(status).json({ success: false, message });
}

// Every endpoint in this router is restricted to authenticated administrators.
router.use(requireAuth, requireRole("admin"));

router.get("/", async (_req: Request, res: Response) => {
  try {
    const users = await getUsers()
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ name: 1 })
      .toArray();

    return res.json({
      success: true,
      users: users.map((user) => serializeUser(user)),
    });
  } catch (error) {
    console.error("Unable to list users:", error);
    return sendError(res, 500, "Unable to load user accounts.");
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = normalizeEmail(
      typeof req.body?.email === "string" ? req.body.email : "",
    );
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (name.length < 2 || name.length > 100) {
      return sendError(res, 400, "Name must be between 2 and 100 characters.");
    }
    if (!isValidEmail(email)) {
      return sendError(res, 400, "Enter a valid email address.");
    }
    if (password.length < 12 || password.length > 128) {
      return sendError(res, 400, "Password must be between 12 and 128 characters.");
    }

    const users = getUsers();
    const existing = await users.findOne({ email });
    if (existing) return sendError(res, 409, "An account with that email already exists.");

    const now = new Date();
    const user = {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "staff" as const,
      active: true,
      photoUrl: "",
      createdAt: now,
      updatedAt: now,
    };

    const result = await users.insertOne(user);
    const saved = await users.findOne({ _id: result.insertedId });

    if (!saved) return sendError(res, 500, "The account was created but could not be loaded.");

    return res.status(201).json({
      success: true,
      message: "Staff account created.",
      user: serializeUser(saved),
    });
  } catch (error) {
    console.error("Unable to create staff account:", error);
    return sendError(res, 500, "Unable to create the staff account.");
  }
});

router.patch("/:id/active", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return sendError(res, 400, "Invalid user ID.");

    if (typeof req.body?.active !== "boolean") {
      return sendError(res, 400, "Provide active as true or false.");
    }

    const users = getUsers();
    const target = await users.findOne({ _id: new ObjectId(id) });

    if (!target) return sendError(res, 404, "User account not found.");
    if (target.role === "admin") {
      return sendError(res, 403, "Administrator accounts cannot be changed here.");
    }

    await users.updateOne(
      { _id: target._id },
      { $set: { active: req.body.active, updatedAt: new Date() } },
    );

    return res.json({
      success: true,
      message: req.body.active ? "Staff account activated." : "Staff account deactivated.",
    });
  } catch (error) {
    console.error("Unable to update staff account:", error);
    return sendError(res, 500, "Unable to update the staff account.");
  }
});

export default router;
`;

const usersPageSource = `import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserPlus, Users, RefreshCw, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { apiFetch } from "../lib/api";

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  photoUrl?: string;
};

type UsersResponse = {
  success: boolean;
  message?: string;
  users?: StaffUser[];
};

export default function UsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/users");
      const data = (await response.json()) as UsersResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load user accounts.");
      }
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load user accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await response.json()) as UsersResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not create staff account.");
      }

      setName("");
      setEmail("");
      setPassword("");
      setNotice("Staff account created successfully.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create staff account.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: StaffUser) {
    const nextActive = !(user as StaffUser & { active?: boolean }).active;
    setError("");
    setNotice("");

    try {
      const response = await apiFetch(\`/api/users/\${encodeURIComponent(user.id)}/active\`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = (await response.json()) as { success: boolean; message?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not update the account.");
      }
      setNotice(data.message || "Account updated.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the account.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sky-600">ADMINISTRATION</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Users & Permissions</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Create staff accounts and manage access to the shop system.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-sky-50 p-3 text-sky-700"><UserPlus size={21} /></div>
            <div>
              <h2 className="font-bold text-slate-900">Add a staff member</h2>
              <p className="mt-1 text-xs text-slate-500">New accounts receive the Staff role.</p>
            </div>
          </div>

          <form onSubmit={createUser} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Full name
              <input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="Staff member's name" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Email address
              <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="staff@example.com" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Temporary password
              <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="At least 12 characters" />
              <span className="mt-1 block text-xs text-slate-400">Share the password securely with the staff member.</span>
            </label>
            <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
              <UserPlus size={17} /> {saving ? "Creating account…" : "Create staff account"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-3 text-slate-700"><Users size={21} /></div>
            <div>
              <h2 className="font-bold text-slate-900">Registered users</h2>
              <p className="mt-1 text-xs text-slate-500">{users.length} account{users.length === 1 ? "" : "s"} found</p>
            </div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading accounts…</p>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No user accounts were returned.</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => {
                const active = (user as StaffUser & { active?: boolean }).active !== false;
                return (
                  <div key={user.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    {user.photoUrl ? (
                      <img src={user.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-sky-700">
                        {user.name.trim().split(/\\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <ShieldCheck size={13} /> {user.role === "admin" ? "Administrator" : "Staff"}
                        </span>
                        <span className={\`rounded-full px-2 py-0.5 \${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}\`}>
                          {active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                    {user.role === "staff" && (
                      <button type="button" onClick={() => void toggleActive(user)} aria-label={active ? \`Deactivate \${user.name}\` : \`Activate \${user.name}\`} className={\`shrink-0 rounded-lg p-2 transition \${active ? "text-rose-600 hover:bg-rose-50" : "text-emerald-700 hover:bg-emerald-50"}\`}>
                        {active ? <UserX size={18} /> : <UserCheck size={18} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Access policy:</strong> staff can use normal shop features, including sales and stock adjustments. Only administrators can create or deactivate staff accounts.
      </div>
    </div>
  );
}
`;

writeNew(usersPage, usersPageSource);
console.log("CREATED  client/src/pages/UsersPage.tsx");

update(navigationFile, (source) => {
  if (source.includes('path: "/users"') || source.includes('path: "/users",')) return source;
  const marker = '{ label: "Settings", path: "/settings", icon: Settings },';
  if (!source.includes(marker)) throw new Error("Could not locate Settings navigation item.");
  return source.replace(marker, marker + '\n  { label: "Users & Permissions", path: "/users", icon: Users, adminOnly: true },');
});

update(sidebarFile, (source) => {
  if (!source.includes('navigationItems.map((item) =>')) throw new Error("Could not locate sidebar navigation loop.");
  let result = source;
  result = result.replace(
    'const { user, logout } = useAuth();',
    'const { user, logout } = useAuth();'
  );
  const marker = '{navigationItems.map((item) => {';
  if (!result.includes(marker)) throw new Error("Sidebar loop format differs; refusing unsafe edit.");
  result = result.replace(marker, '{navigationItems.filter((item) => !(("adminOnly" in item) && item.adminOnly) || user?.role === "admin").map((item) => {');
  return result;
});

update(clientApp, (source) => {
  let result = source;
  if (!result.includes('import UsersPage from "./pages/UsersPage";')) {
    const marker = 'import SettingsPage from "./pages/SettingsPage";';
    if (!result.includes(marker)) throw new Error("Could not locate SettingsPage import.");
    result = result.replace(marker, marker + '\nimport UsersPage from "./pages/UsersPage";');
  }
  if (!result.includes('path="/users"')) {
    const marker = '<Route path="/settings" element={<SettingsPage />} />';
    if (!result.includes(marker)) throw new Error("Could not locate Settings route.");
    result = result.replace(marker, marker + '\n\n            <Route path="/users" element={<UsersPage />} />');
  }
  return result;
});

update(path.join(root, "client/src/components/layout/Header.tsx"), (source) => {
  if (source.includes('"/users": "Users & Permissions"')) return source;
  const marker = '  "/settings": "Settings",';
  if (!source.includes(marker)) throw new Error("Could not locate header page title map.");
  return source.replace(marker, marker + '\n  "/users": "Users & Permissions",');
});

update(serverFile, (source) => {
  let result = source;
  if (!result.includes('import userRoutes from "./userRoutes.js";')) {
    const authImport = 'import authRoutes from "./authRoutes.js";';
    if (!result.includes(authImport)) throw new Error("Could not locate authRoutes import in server index.");
    result = result.replace(authImport, authImport + '\nimport userRoutes, { configureUserDatabase } from "./userRoutes.js";');
  } else if (!result.includes("configureUserDatabase")) {
    result = result.replace('import userRoutes from "./userRoutes.js";', 'import userRoutes, { configureUserDatabase } from "./userRoutes.js";');
  }

  if (!result.includes('app.use("/api/users", userRoutes);')) {
    const authMount = 'app.use("/api/auth", authRoutes);';
    if (!result.includes(authMount)) throw new Error("Could not locate auth route mount.");
    result = result.replace(authMount, authMount + '\napp.use("/api/users", userRoutes);');
  }

  if (!result.includes("configureUserDatabase(db)")) {
    const configureAuth = "configureAuthDatabase(db);";
    if (!result.includes(configureAuth)) throw new Error("Could not locate configureAuthDatabase(db) startup call.");
    result = result.replace(configureAuth, configureAuth + '\n  configureUserDatabase(db);');
  }

  // Remove administrator-only restrictions from normal shop operations.
  const replacements = [
    [
      /app\.put\(\s*["']\/api\/settings["']\s*,\s*requireAuth\s*,\s*requireRole\(["']admin["']\)\s*,/g,
      'app.put("/api/settings", requireAuth,',
      "settings update",
    ],
    [
      /app\.post\(\s*["']\/api\/settings\/logo["']\s*,\s*requireAuth\s*,\s*requireRole\(["']admin["']\)\s*,/g,
      'app.post("/api/settings/logo", requireAuth,',
      "logo upload",
    ],
    [
      /app\.post\(\s*["']\/api\/products["']\s*,\s*requireAuth\s*,\s*requireRole\(["']admin["']\)\s*,/g,
      'app.post("/api/products", requireAuth,',
      "product creation",
    ],
    [
      /app\.put\(\s*["']\/api\/products\/:id["']\s*,\s*requireAuth\s*,\s*requireRole\(["']admin["']\)\s*,/g,
      'app.put("/api/products/:id", requireAuth,',
      "product editing",
    ],
    [
      /app\.post\(\s*["']\/api\/products\/:id\/adjustments["']\s*,\s*requireRole\(["']admin["']\)\s*,/g,
      'app.post("/api/products/:id/adjustments",',
      "stock adjustments",
    ],
  ];

  for (const [pattern, replacement, label] of replacements) {
    result = result.replace(pattern, replacement);
  }

  // If the route file was already patched to admin-only with a different
  // whitespace layout, remove only the guard immediately after the route path.
  result = result.replace(
    /(app\.(?:post|put)\(\s*["']\/api\/(?:products(?:\/:id)?|settings(?:\/logo)?)["']\s*,\s*requireAuth)\s*,\s*requireRole\(["']admin["']\)\s*,/g,
    "$1,"
  );
  result = result.replace(
    /(app\.post\(\s*["']\/api\/products\/:id\/adjustments["']\s*,)\s*requireRole\(["']admin["']\)\s*,/g,
    "$1"
  );

  return result;
});

console.log("\\nInstaller changes written. Now run the server and client builds.");
