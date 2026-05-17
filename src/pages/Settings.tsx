import { useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  ScrollText,
  BookOpen,
  ClipboardList,
  History,
  LogOut,
  CalendarPlus,
  Store,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  GlobalSettingsCard,
  StoresCard,
  SuppliersCard,
  PrepItemsCard,
  IngredientsCard,
  RecipesCard,
  UsersCard,
} from "@/components/settings";

const MORE_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/store-order/SY", label: "SY order", icon: Store },
  { to: "/catering", label: "Catering", icon: CalendarPlus },
  { to: "/sales-input", label: "Sales input", icon: ClipboardList },
  { to: "/invoice-history", label: "Invoice history", icon: History },
  { to: "/recipes", label: "Recipes", icon: BookOpen },
  { to: "/audit-log", label: "Audit log", icon: ScrollText },
];

type SectionId =
  | "global"
  | "stores"
  | "suppliers"
  | "prep"
  | "ingredients"
  | "recipes"
  | "users";

const SECTIONS: { id: SectionId; label: string; description: string }[] = [
  { id: "global", label: "Global", description: "Week #, buffer %, waste threshold" },
  { id: "stores", label: "Stores", description: "Hawthorn + South Yarra" },
  { id: "suppliers", label: "Suppliers", description: "Schedules + lead times" },
  { id: "prep", label: "Prep items", description: "Portions, batches, transfer prices" },
  { id: "ingredients", label: "Ingredients", description: "Costs + suppliers" },
  { id: "recipes", label: "Recipes", description: "Builds + panini compositions" },
  { id: "users", label: "Users", description: "PIN-auth crew" },
];

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>("global");
  const { user, logout } = useAuth();
  return (
    <AppShell title="More">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Jump to</CardTitle>
          <CardDescription>Other screens not in the bottom nav.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MORE_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                <Icon className="h-4 w-4 text-stone-500" />
                {label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            All changes write to the audit log.
            {user ? (
              <span className="block text-xs text-stone-500">
                Signed in as {user.display_name}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <Button
                key={s.id}
                variant={section === s.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">
            <Badge variant="outline" className="mr-1">
              {SECTIONS.find((s) => s.id === section)?.label}
            </Badge>
            {SECTIONS.find((s) => s.id === section)?.description}
          </p>
        </CardContent>
      </Card>

      {section === "global" && <GlobalSettingsCard />}
      {section === "stores" && <StoresCard />}
      {section === "suppliers" && <SuppliersCard />}
      {section === "prep" && <PrepItemsCard />}
      {section === "ingredients" && <IngredientsCard />}
      {section === "recipes" && <RecipesCard />}
      {section === "users" && <UsersCard />}

      <div className="mt-6 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void logout()}>
          <LogOut className="mr-1 h-4 w-4" />
          Log out
        </Button>
      </div>
    </AppShell>
  );
}
