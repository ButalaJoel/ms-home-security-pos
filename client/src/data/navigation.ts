
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Clock,
  FileText,
  Users,
  ChartNoAxesColumn,
  Settings,
} from "lucide-react";

export const navigationItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Products", path: "/products", icon: Package },
  { label: "Inventory", path: "/inventory", icon: Boxes },
  { label: "Point of Sale", path: "/pos", icon: ShoppingCart },
  { label: "Sales History", path: "/sales", icon: Clock },
  { label: "Invoices & Receipts", path: "/documents", icon: FileText },
  { label: "Customers", path: "/customers", icon: Users },
  { label: "Reports", path: "/reports", icon: ChartNoAxesColumn },
  { label: "Settings", path: "/settings", icon: Settings },

];
