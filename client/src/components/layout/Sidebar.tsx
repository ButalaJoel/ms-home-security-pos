
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, X } from "lucide-react";

import { navigationItems } from "../../data/navigation";
import { useConnectionStatus } from "../../hooks/useConnectionStatus";
import { useAuth } from "../../context/AuthContext";

// Props passed from App.tsx to control the mobile sidebar.
type SidebarProps = {
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export default function Sidebar({
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  // Reads the browser's current network status.
  const connectionStatus = useConnectionStatus();

  function handleNavigation(path: string) {
    navigate(path);
    onMobileClose();
  }

  // End the server session before redirecting to login.
  async function handleSignOut() {
    if (signingOut) return;

    setSignOutError("");
    setSigningOut(true);

    try {
      await logout();
      onMobileClose();
      navigate("/login", { replace: true });
    } catch (error) {
      setSignOutError(
        error instanceof Error
          ? error.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  const isOnline = connectionStatus === "online";
  const statusLabel = isOnline ? "System online" : "Offline mode";

  const statusDotClass = isOnline
    ? "bg-emerald-500"
    : "bg-amber-400";

  const statusTextClass = isOnline
    ? "text-white"
    : "text-amber-300";

  return (
    <>
      {/* Dark backdrop behind the sidebar on mobile. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] md:hidden"
        />
      )}

      {/* Main sidebar: fixed on mobile and sticky on desktop. */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-64 flex-col
          bg-[#111827] text-slate-300
          transition-[transform,width] duration-300 ease-in-out
          md:sticky md:top-0 md:h-screen md:translate-x-0
          ${collapsed ? "md:w-[76px]" : "md:w-60"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Brand area. */}
        <div className="flex h-[76px] shrink-0 items-center justify-between border-b border-white/10 px-4">
          <button
            type="button"
            onClick={() => handleNavigation("/")}
            className="flex min-w-0 items-center gap-3"
            aria-label="Go to dashboard"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-b-xl rounded-t-sm bg-sky-500 text-sm font-extrabold text-white">
              <img
  src="/ms-home-security-logo.png"
  alt="MS Home Security Solutions"
  className={`
    rounded-lg bg-white object-contain p-1
    ${collapsed ? "h-10 w-12" : "h-12 w-[176px]"}
  `}
/>
            </div>

            {!collapsed && (
              <div className="text-left">
                <p className="whitespace-nowrap text-[11px] font-extrabold tracking-wide text-white">
                  MS HOME SECURITY
                </p>

                <p className="mt-1 text-[9px] tracking-[0.35em] text-sky-400">
                  SOLUTIONS
                </p>
              </div>
            )}
          </button>

          {/* Close button for mobile navigation. */}
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Close navigation"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main navigation. */}
        <nav
          aria-label="Main navigation"
          className="flex-1 space-y-1 overflow-y-auto px-3 py-5"
        >
          {navigationItems.filter((item) => !(("adminOnly" in item) && item.adminOnly) || user?.role === "admin").map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <button
                key={item.path}
                type="button"
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                onClick={() => handleNavigation(item.path)}
                className={`
                  group relative flex w-full items-center gap-3
                  rounded-xl px-3 py-3 text-left text-sm
                  transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-sky-400
                  ${
                    isActive
                      ? "bg-sky-500/15 font-semibold text-sky-400"
                      : "text-slate-300 hover:bg-[#1D3044] hover:text-sky-300"
                  }
                  ${collapsed ? "md:justify-center md:px-0" : ""}
                `}
              >
                <Icon
                  size={19}
                  strokeWidth={1.8}
                  className={`shrink-0 transition-colors ${
                    isActive
                      ? "text-sky-400"
                      : "text-slate-400 group-hover:text-sky-300"
                  }`}
                />

                <span className={collapsed ? "md:hidden" : ""}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Desktop sidebar collapse control. */}
        <div className="hidden border-t border-white/10 p-3 md:block">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-full rounded-xl px-3 py-2 text-left text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            {collapsed ? "Expand sidebar →" : "← Collapse sidebar"}
          </button>
        </div>

        {/* Account identity and sign-out action. */}
        <div className="shrink-0 border-t border-white/10 px-3 py-3">
          {!collapsed && user && (
            <div className="mb-2 truncate px-2 text-[11px] text-slate-400">
              Signed in as{" "}
              <span className="font-semibold text-slate-200">
                {user.name}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            title={collapsed ? "Sign out" : undefined}
            className={`
              group flex w-full items-center gap-3 rounded-xl px-3 py-3
              text-left text-sm font-medium text-slate-300
              transition-colors hover:bg-rose-500/10 hover:text-rose-300
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-rose-400
              disabled:cursor-not-allowed disabled:opacity-60
              ${collapsed ? "md:justify-center md:px-0" : ""}
            `}
          >
            <LogOut
              size={19}
              strokeWidth={1.8}
              className="shrink-0 text-slate-400 transition-colors group-hover:text-rose-300"
            />

            <span className={collapsed ? "md:hidden" : ""}>
              {signingOut ? "Signing out..." : "Sign out"}
            </span>
          </button>

          {signOutError && (
            <p
              role="alert"
              className="mt-2 break-words px-2 text-xs text-rose-300"
            >
              {signOutError}
            </p>
          )}
        </div>

        {/* Browser connection status. */}
        <div className="shrink-0 border-t border-white/10 px-5 py-5">
          <div
            role="status"
            aria-live="polite"
            title={statusLabel}
            className={`
              flex items-center gap-2 text-xs font-semibold
              ${statusTextClass}
              ${collapsed ? "md:justify-center" : ""}
            `}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass}`}
            />

            <span className={collapsed ? "md:hidden" : ""}>
              {statusLabel}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
