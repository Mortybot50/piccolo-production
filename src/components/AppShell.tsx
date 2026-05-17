import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-20">
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">
              Piccolo Production
            </p>
            <h1 className="font-display text-xl font-bold">{title}</h1>
          </div>
          {user ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">{user.display_name}</span>
            </Button>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-screen-sm px-4 py-6">{children}</main>
      <BottomNav />
    </div>
  );
}
