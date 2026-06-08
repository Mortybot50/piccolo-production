import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, Settings as SettingsIcon } from "lucide-react";

export function AppShell({
  children,
  title,
  subtitle,
  showBack,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showBack?: boolean;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.is_admin === true;
  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-10">
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/80">
        <div className="container-app flex items-center gap-2 py-3 md:py-4">
          {showBack ? (
            <Button
              variant="ghost"
              size="sm"
              className="tap-target shrink-0"
              aria-label="Back"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
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
          {isAdmin ? (
            <Button
              variant="ghost"
              size="sm"
              className="tap-target shrink-0"
              aria-label="Settings"
              asChild
            >
              <Link to="/settings">
                <SettingsIcon className="h-5 w-5" />
              </Link>
            </Button>
          ) : null}
          {user ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              aria-label="Sign out"
              className="tap-target shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </header>
      <main className="container-app py-5 md:py-7">{children}</main>
    </div>
  );
}
