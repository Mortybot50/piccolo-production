import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePrepRecipes, useMenuRecipes } from "@/lib/queries";

interface PrepRecipeRow {
  prep_item_id: string;
  ingredient_id: string;
  qty_per_yield: number;
  qty_unit: string;
  yield_qty: number;
  yield_unit: string;
  prep_items: { name: string; code: string } | null;
  ingredients: { name: string; code: string; pack_unit: string | null } | null;
}

interface MenuRecipeRow {
  menu_item_id: string;
  line_no: number;
  ingredient_id: string | null;
  prep_item_id: string | null;
  qty_per_serve: number;
  qty_unit: string;
  menu_items: { name: string; code: string } | null;
  ingredients: { name: string; code: string } | null;
  prep_items: { name: string; code: string } | null;
}

export function RecipesCard() {
  const { data: prep = [], isLoading: a } = usePrepRecipes();
  const { data: menu = [], isLoading: b } = useMenuRecipes();

  // Group prep recipes by prep_items.code.
  const prepGroups = new Map<string, PrepRecipeRow[]>();
  for (const row of prep as unknown as PrepRecipeRow[]) {
    const key = row.prep_items?.name ?? row.prep_item_id;
    if (!prepGroups.has(key)) prepGroups.set(key, []);
    prepGroups.get(key)!.push(row);
  }

  const menuGroups = new Map<string, MenuRecipeRow[]>();
  for (const row of menu as unknown as MenuRecipeRow[]) {
    const key = row.menu_items?.name ?? row.menu_item_id;
    if (!menuGroups.has(key)) menuGroups.set(key, []);
    menuGroups.get(key)!.push(row);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Prep recipes</CardTitle>
          <CardDescription>
            What you make in production. Read-only here; edit in DB until v2.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {a ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {[...prepGroups.entries()].map(([name, rows]) => (
            <div key={name} className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{name}</h4>
                {rows[0] ? (
                  <Badge variant="outline">
                    yield {rows[0].yield_qty} {rows[0].yield_unit}
                  </Badge>
                ) : null}
              </div>
              <ul className="space-y-0.5 text-sm">
                {rows.map((r, i) => (
                  <li key={i} className="flex justify-between font-mono text-xs">
                    <span>{r.ingredients?.name ?? "?"}</span>
                    <span className="text-stone-600">
                      {r.qty_per_yield} {r.qty_unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Panini recipes</CardTitle>
          <CardDescription>What goes in each menu panini.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {b ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {[...menuGroups.entries()].map(([name, rows]) => (
            <div key={name} className="space-y-1">
              <h4 className="font-medium">{name}</h4>
              <ul className="space-y-0.5 text-sm">
                {rows.map((r) => (
                  <li key={r.line_no} className="flex justify-between font-mono text-xs">
                    <span>
                      {r.prep_items?.name ?? r.ingredients?.name ?? "?"}
                      {r.prep_items ? (
                        <Badge variant="outline" className="ml-2">
                          prep
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-stone-600">
                      {r.qty_per_serve} {r.qty_unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
