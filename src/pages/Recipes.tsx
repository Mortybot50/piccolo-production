// /recipes — read-only browser (reuses the RecipesCard component).
import { AppShell } from "@/components/AppShell";
import { RecipesCard } from "@/components/settings";

export default function RecipesPage() {
  return (
    <AppShell title="Recipes">
      <RecipesCard />
    </AppShell>
  );
}
