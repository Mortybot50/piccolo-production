import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-24">
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/80">
        <div className="container-app flex items-center justify-between gap-3 py-3 md:py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-fg-soft)]">
              Piccolo Production
            </p>
            <h1 className="truncate font-display text-2xl font-semibold leading-tight md:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {user ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              aria-label="Sign out"
              className="tap-target shrink-0"
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-1 hidden text-xs font-medium sm:inline">
                {user.display_name}
              </span>
            </Button>
          ) : null}
        </div>
      </header>
      <main className="container-app py-5 md:py-7">{children}</main>
      <BottomNav />
    </div>
  );
}
