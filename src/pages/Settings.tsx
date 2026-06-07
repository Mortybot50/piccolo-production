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
  Calculator,
  Receipt,
  BarChart3,
  NotebookPen,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  GlobalSettingsCard,
  StoresCard,
  SuppliersCard,
  SupplierScheduleCard,
  PrepItemsCard,
  IngredientsCard,
  RecipesCard,
  UsersCard,
  ForecastCard,
  MenuItemSplitsCard,
} from "@/components/settings";

type LinkSpec = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const FOR_TODAY_LINKS: LinkSpec[] = [
  { to: "/store-order/SY", label: "SY order", icon: Store },
  { to: "/sales-input", label: "Sales input", icon: ClipboardList },
  { to: "/sales-averages", label: "Sales averages", icon: BarChart3 },
  { to: "/prep-log", label: "Prep log", icon: NotebookPen },
  { to: "/recipes", label: "Recipes", icon: BookOpen },
];

const COMMERCIAL_LINKS: LinkSpec[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { to: "/catering", label: "Catering", icon: CalendarPlus, adminOnly: true },
  { to: "/invoice", label: "Invoice", icon: Receipt, adminOnly: true },
  { to: "/invoice-history", label: "Invoice history", icon: History, adminOnly: true },
  { to: "/costing", label: "Costing", icon: Calculator, adminOnly: true },
  { to: "/audit-log", label: "Audit log", icon: ScrollText, adminOnly: true },
];

type SectionId =
  | "global"
  | "forecast"
  | "splits"
  | "stores"
  | "suppliers"
  | "supplier_schedule"
  | "prep"
  | "ingredients"
  | "recipes"
  | "users";

const SECTIONS: { id: SectionId; label: string; description: string }[] = [
  { id: "global", label: "Global", description: "Week #, buffer %, waste threshold, forecast window" },
  { id: "forecast", label: "Forecast weeks", description: "Exclude weird weeks from averages" },
  { id: "splits", label: "Store splits", description: "HAW vs SY % per panini" },
  { id: "stores", label: "Stores", description: "Hawthorn + South Yarra" },
  { id: "suppliers", label: "Suppliers", description: "Name + raw JSON shape" },
  { id: "supplier_schedule", label: "Supplier schedule", description: "Delivery cadence + per-ingredient split" },
  { id: "prep", label: "Prep items", description: "Portions, batches, transfer prices" },
  { id: "ingredients", label: "Ingredients", description: "Costs + suppliers" },
  { id: "recipes", label: "Recipes", description: "Builds + panini compositions" },
  { id: "users", label: "Users", description: "PIN-auth crew" },
];

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>("global");
  const { user, logout } = useAuth();
  const isAdmin = user?.is_admin === true;
  const commercialLinks = COMMERCIAL_LINKS.filter((l) => !l.adminOnly || isAdmin);
  return (
    <AppShell title="More">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>For today's prep</CardTitle>
          <CardDescription>Screens you'll use most often.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FOR_TODAY_LINKS.map(({ to, label, icon: Icon }) => (
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
      {commercialLinks.length > 0 ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Commercial</CardTitle>
            <CardDescription>
              {isAdmin ? "Owner-facing surfaces." : "Limited view — ask admin for access."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {commercialLinks.map(({ to, label, icon: Icon }) => (
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
      ) : null}

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
      {section === "forecast" && <ForecastCard />}
      {section === "splits" && <MenuItemSplitsCard />}
      {section === "stores" && <StoresCard />}
      {section === "suppliers" && <SuppliersCard />}
      {section === "supplier_schedule" && <SupplierScheduleCard />}
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
