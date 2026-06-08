import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  ListChecks,
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
  ParLevelsCard,
} from "@/components/settings";

type LinkSpec = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const FOR_TODAY_LINKS: LinkSpec[] = [
  { to: "/stocktake", label: "Stocktake", icon: ListChecks },
  { to: "/store-order/HAW", label: "HAW order", icon: Store },
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
  | "par"
  | "stores"
  | "suppliers"
  | "supplier_schedule"
  | "prep"
  | "ingredients"
  | "recipes"
  | "users";

interface Section {
  id: SectionId;
  label: string;
  description: string;
  group: "forecast" | "ops" | "data" | "people";
}

const SECTIONS: Section[] = [
  { id: "global", label: "Global", description: "Week #, buffer %, waste threshold, forecast window", group: "forecast" },
  { id: "forecast", label: "Forecast weeks", description: "Exclude weird weeks from averages", group: "forecast" },
  { id: "splits", label: "Store splits", description: "HAW vs SY % per panini", group: "forecast" },
  { id: "par", label: "Par levels", description: "Target on-hand qty per prep item + ingredient", group: "ops" },
  { id: "supplier_schedule", label: "Supplier schedule", description: "Delivery cadence + per-ingredient split", group: "ops" },
  { id: "stores", label: "Stores", description: "Hawthorn + South Yarra", group: "data" },
  { id: "suppliers", label: "Suppliers", description: "Name + raw JSON shape", group: "data" },
  { id: "prep", label: "Prep items", description: "Portions, batches, transfer prices", group: "data" },
  { id: "ingredients", label: "Ingredients", description: "Costs + suppliers", group: "data" },
  { id: "recipes", label: "Recipes", description: "Builds + panini compositions", group: "data" },
  { id: "users", label: "Users", description: "PIN-auth crew", group: "people" },
];

const GROUP_LABELS: Record<Section["group"], string> = {
  forecast: "Forecast",
  ops: "Operations",
  data: "Master data",
  people: "People",
};

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>("global");
  const { user, logout } = useAuth();
  const isAdmin = user?.is_admin === true;
  const commercialLinks = COMMERCIAL_LINKS.filter((l) => !l.adminOnly || isAdmin);
  const tabsRef = useRef<HTMLDivElement>(null);
  const currentSection = SECTIONS.find((s) => s.id === section);

  return (
    <AppShell title="More" subtitle={`Signed in as ${user?.display_name ?? "—"}`}>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>For today's prep</CardTitle>
          <CardDescription>Jonny's most-used screens.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FOR_TODAY_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]"
              >
                <Icon className="h-4 w-4 text-[var(--color-fg-muted)]" />
                {label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {commercialLinks.length > 0 ? (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle>Commercial</CardTitle>
            <CardDescription>
              {isAdmin ? "Owner-facing surfaces." : "Hidden until you're admin."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {commercialLinks.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg-subtle)]"
                >
                  <Icon className="h-4 w-4 text-[var(--color-fg-muted)]" />
                  {label}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-3 overflow-hidden">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            {currentSection?.description ?? "Pick a section to edit."} · All
            changes write to the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Horizontal-scroll tab strip (OPS HUB pattern). One feature per tab. */}
          <div
            ref={tabsRef}
            className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] px-5 py-2 md:flex-wrap md:px-6"
            style={{ scrollbarWidth: "thin" }}
          >
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={
                  section === s.id
                    ? "shrink-0 rounded-full bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white"
                    : "shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)]"
                }
              >
                {s.label}
                <span className="ml-1 text-[10px] opacity-70">
                  · {GROUP_LABELS[s.group]}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {section === "global" && <GlobalSettingsCard />}
        {section === "forecast" && <ForecastCard />}
        {section === "splits" && <MenuItemSplitsCard />}
        {section === "par" && <ParLevelsCard />}
        {section === "stores" && <StoresCard />}
        {section === "suppliers" && <SuppliersCard />}
        {section === "supplier_schedule" && <SupplierScheduleCard />}
        {section === "prep" && <PrepItemsCard />}
        {section === "ingredients" && <IngredientsCard />}
        {section === "recipes" && <RecipesCard />}
        {section === "users" && <UsersCard />}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void logout()}>
          <LogOut className="mr-1 h-4 w-4" />
          Log out
        </Button>
      </div>
    </AppShell>
  );
}
