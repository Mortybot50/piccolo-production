import { NavLink } from "react-router-dom";
import {
  Calendar,
  ListChecks,
  Truck,
  BookOpen,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/today", label: "Today", icon: Calendar },
  { to: "/stocktake", label: "Stock", icon: ListChecks },
  { to: "/supplier-orders", label: "Suppliers", icon: Truck },
  { to: "/recipes", label: "Recipes", icon: BookOpen },
  { to: "/settings", label: "More", icon: Settings },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg-elevated)]/85"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="container-app flex">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium tap-comfortable",
                  isActive
                    ? "text-[var(--color-brand-700)]"
                    : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-9 w-12 items-center justify-center rounded-full transition-colors",
                      isActive
                        ? "bg-[var(--color-brand-100)] text-[var(--color-brand-700)]"
                        : "text-[var(--color-fg-muted)]"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
