import {
  Activity,
  Boxes,
  ChartNoAxesColumn,
  Clock,
  FileSignature,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Receipt,
  Wrench,
} from "lucide-react";

// "section" starts a new group heading in the sidebar.
export const navigationItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, section: "Overview" },
  { label: "Point of Sale", path: "/pos", icon: ShoppingCart, section: "Sell" },
  { label: "Quotations", path: "/quotations", icon: FileSignature },
  { label: "Sales History", path: "/sales", icon: Clock },
  { label: "Invoices & Receipts", path: "/documents", icon: FileText },
  { label: "Customer Balances", path: "/balances", icon: Wallet },
  { label: "Customers", path: "/customers", icon: Users },
  { label: "Products", path: "/products", icon: Package, section: "Stock" },
  { label: "Inventory", path: "/inventory", icon: Boxes },
  { label: "Suppliers & Stock In", path: "/suppliers", icon: Truck },
  { label: "Installation Jobs", path: "/jobs", icon: Wrench, section: "Service" },
  { label: "Warranties", path: "/warranties", icon: ShieldCheck },
  { label: "Expenses & Cash-up", path: "/expenses", icon: Receipt, section: "Money" },
  { label: "Reports", path: "/reports", icon: ChartNoAxesColumn },
  { label: "Activity Log", path: "/activity", icon: Activity, section: "Admin" },
  { label: "Settings", path: "/settings", icon: Settings },
] as const satisfies readonly {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  section?: string;
  adminOnly?: boolean;
}[];
