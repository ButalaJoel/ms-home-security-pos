import NotificationBell from "./components/layout/NotificationBell";

import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";

import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import InventoryPage from "./pages/InventoryPage";
import POSPage from "./pages/POSPage";
import SalesHistoryPage from "./pages/SalesHistoryPage";
import DocumentsPage from "./pages/DocumentsPage";
import CustomersPage from "./pages/CustomersPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { syncPendingSales } from "./db/syncService";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FA]">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#08B9F0]" />
        <p className="mt-4 text-sm text-slate-500">
          Checking your session...
        </p>
      </div>
    </div>
  );
}

function LoginRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (user) {
    const destination =
      (location.state as { from?: string } | null)?.from || "/";
    return <Navigate to={destination} replace />;
  }

  return <LoginPage />;
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <AppLayout />;
}

function AppLayout() {
  useEffect(() => {
    let active = true;

    const runSync = () => {
      if (!navigator.onLine) return;

      void syncPendingSales()
        .then((result) => {
          if (active && result.synchronized > 0) {
            console.info(
              `Offline sync completed: ${result.synchronized} sale(s) synchronized.`,
            );
          }
        })
        .catch((error) => {
          console.error("Offline sale synchronization failed:", error);
        });
    };

    runSync();

    window.addEventListener("online", runSync);
    window.addEventListener("focus", runSync);

    return () => {
      active = false;
      window.removeEventListener("online", runSync);
      window.removeEventListener("focus", runSync);
    };
  }, []);

  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    setLogoutError("");

    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "Logout failed.",
      );
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F4F7FA]">
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <NotificationBell />

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {user?.name}
            </p>
            <p className="text-xs capitalize text-slate-500">
              {user?.role}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>

        {logoutError && (
          <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700">
            {logoutError}
          </p>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-7">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/pos" element={<POSPage />} />
            <Route path="/point-of-sale" element={<POSPage />} />
            <Route path="/sales" element={<SalesHistoryPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="*" element={<ProtectedRoute />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

