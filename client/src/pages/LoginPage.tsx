
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FA] px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl md:grid-cols-2">
        {/* Desktop branding panel */}
        <div className="hidden flex-col justify-between bg-[#0B263B] p-10 text-white md:flex">
          <div>
            <div className="flex w-fit items-center">
  <img
    src="/ms-home-security-logo.png"
    alt="MS Home Security Solutions"
    className="h-20 w-56 object-contain object-left"
  />
</div>

            <p className="mt-3 text-sm text-slate-300">
              Point of Sale System
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#08B9F0]">
              Secure operations
            </p>

            <h1 className="text-4xl font-bold leading-tight">
              Manage your business with confidence.
            </h1>

            <p className="mt-5 max-w-sm leading-7 text-slate-300">
              Access your products, inventory, sales and business reports from
              one place.
            </p>
          </div>

          <p className="text-sm text-slate-400">
            Authorized personnel only.
          </p>
        </div>

        {/* Login form */}
        <div className="flex items-center justify-center p-6 sm:p-10 md:p-12">
          <div className="w-full max-w-sm">
            {/* Mobile branding */}
            <div className="mb-8 inline-flex max-w-full rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-100 md:hidden">
              <img
                src="/ms-home-security-logo.png"
                alt="MS Home Security Solutions"
                className="h-12 w-40 object-contain"
              />
            </div>

            <p className="text-sm font-semibold uppercase tracking-wider text-[#078DB8]">
              Welcome back
            </p>

            <h2 className="mt-2 text-3xl font-bold text-[#102A3D]">
              Sign in
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Enter your account details to access your workspace.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#08B9F0] focus:ring-4 focus:ring-sky-100"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Password
                </label>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm outline-none transition focus:border-[#08B9F0] focus:ring-4 focus:ring-sky-100"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B263B] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#103149] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LockKeyhole size={17} />
                {submitting ? "Signing in..." : "Sign in to your account"}
              </button>
            </form>

            <p className="mt-8 text-center text-xs leading-5 text-slate-400">
              Protected access for authorized MS Home Security staff.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
