
import { Bell, ChevronDown, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type HeaderProps = {
  onMenuClick: () => void;
};

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/products": "Products",
  "/inventory": "Inventory",
  "/pos": "Point of Sale",
  "/point-of-sale": "Point of Sale",
  "/sales": "Sales History",
  "/documents": "Invoices & Receipts",
  "/customers": "Customers",
  "/reports": "Reports",
  "/settings": "Settings",
  "/users": "Users & Permissions",
};

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export default function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation();
  const { user } = useAuth();

  const title = pageTitles[location.pathname] ?? "MS Home Security";
  const isDashboard = location.pathname === "/";
  const userName = user?.name || "Signed-in user";
  const userRole = user?.role === "admin" ? "Administrator" : "Staff";

  return (
    <header className="sticky top-0 z-30 flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-sky-600 md:hidden"
        >
          <Menu size={22} />
        </button>

        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">
            {title}
          </h1>

          <p className="mt-1 hidden text-xs text-slate-400 sm:block">
            MS Home Security
            <span className="mx-2">/</span>
            {title}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        {isDashboard && (
          <span className="hidden text-xs text-slate-400 lg:block">
            {user?.role === "admin" ? "Administrator workspace" : "Staff workspace"}
          </span>
        )}

        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-xl p-2 text-sky-600 transition hover:bg-sky-50"
        >
          <Bell size={19} strokeWidth={1.8} />
        </button>

        <div className="hidden h-9 border-l border-slate-200 sm:block" />

        <div
          className="flex items-center gap-2 rounded-xl p-1.5 sm:gap-3"
          aria-label="Signed-in user profile"
        >
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={`${userName} profile`}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
              {getInitials(userName)}
            </div>
          )}

          <div className="hidden text-left sm:block">
            <p className="max-w-32 truncate text-xs font-bold text-slate-900">
              {userName}
            </p>
            <p className="mt-1 text-[10px] capitalize text-slate-500">
              {userRole}
            </p>
          </div>

          <ChevronDown
            size={14}
            className="hidden text-slate-400 sm:block"
          />
        </div>
      </div>
    </header>
  );
}
