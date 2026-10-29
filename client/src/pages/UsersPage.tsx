import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserPlus, Users, RefreshCw, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { apiFetch } from "../lib/api";

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  photoUrl?: string;
  active: boolean;
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
    const nextActive = !user.active;
    setError("");
    setNotice("");

    try {
      const response = await apiFetch(`/api/users/${encodeURIComponent(user.id)}/active`, {
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
                const active = user.active;
                return (
                  <div key={user.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    {user.photoUrl ? (
                      <img src={user.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-sky-700">
                        {user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <ShieldCheck size={13} /> {user.role === "admin" ? "Administrator" : "Staff"}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                    {user.role === "staff" && (
                      <button type="button" onClick={() => void toggleActive(user)} aria-label={active ? `Deactivate ${user.name}` : `Activate ${user.name}`} className={`shrink-0 rounded-lg p-2 transition ${active ? "text-rose-600 hover:bg-rose-50" : "text-emerald-700 hover:bg-emerald-50"}`}>
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
