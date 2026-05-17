import { NavLink } from "react-router-dom";
import {
  Calendar,
  Store,
  Truck,
  Receipt,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/today", label: "Today", icon: Calendar },
  { to: "/store-order/HAW", label: "Store", icon: Store },
  { to: "/supplier-orders", label: "Suppliers", icon: Truck },
  { to: "/invoice", label: "Invoice", icon: Receipt },
  { to: "/dashboard", label: "Dash", icon: LayoutDashboard },
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <ul className="mx-auto flex max-w-screen-sm">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 py-2 text-xs font-medium tap-target",
                  isActive
                    ? "text-[var(--color-brand-600)]"
                    : "text-stone-500 hover:text-stone-800"
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
