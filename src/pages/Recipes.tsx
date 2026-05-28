// /recipes — CRUD editor for prep_item_recipe + menu_item_recipe + printable
// cook cards. Per BRIEF §4.11.
//
// Layout: tabs Prep | Panini. Each tab lists items in the left column with a
// chevron; selecting an item opens an editable line-list on the right with
// add/edit/delete + a "Print cook card" button that opens a print-friendly
// view in a new tab.

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  qk,
  usePrepItems,
  useMenuItems,
  useIngredients,
} from "@/lib/queries";

type Tab = "prep" | "menu";

interface PrepItemLite {
  id: string;
  code: string;
  name: string;
  unit: string;
  active: boolean;
}
interface MenuItemLite {
  id: string;
  code: string;
  name: string;
  active: boolean;
}
interface IngredientLite {
  id: string;
  code: string;
  name: string;
  pack_unit: string | null;
}

interface PrepLine {
  id: string;
  prep_item_id: string;
  ingredient_id: string | null;
  child_prep_item_id: string | null;
  qty_per_yield: number;
  qty_unit: string;
  yield_qty: number;
  yield_unit: string;
}

interface MenuLine {
  menu_item_id: string;
  line_no: number;
  ingredient_id: string | null;
  prep_item_id: string | null;
  qty_per_serve: number;
  qty_unit: string;
}

export default function RecipesPage() {
  const [tab, setTab] = useState<Tab>("prep");
  const [selectedPrepId, setSelectedPrepId] = useState<string | null>(null);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const { data: prepItemsRaw = [] } = usePrepItems();
  const { data: menuItemsRaw = [] } = useMenuItems();
  const { data: ingredientsRaw = [] } = useIngredients();

  const prepItems = (prepItemsRaw as PrepItemLite[]).filter((p) => p.active);
  const menuItems = (menuItemsRaw as MenuItemLite[]).filter((m) => m.active);
  const ingredients = ingredientsRaw as unknown as IngredientLite[];

  return (
    <AppShell title="Recipes">
      <Card className="mb-3">
        <CardContent className="flex gap-2 pt-4">
          <Button
            size="sm"
            variant={tab === "prep" ? "default" : "outline"}
            onClick={() => setTab("prep")}
          >
            Prep recipes
          </Button>
          <Button
            size="sm"
            variant={tab === "menu" ? "default" : "outline"}
            onClick={() => setTab("menu")}
          >
            Panini recipes
          </Button>
        </CardContent>
      </Card>

      {tab === "prep" ? (
        <div className="grid gap-3 md:grid-cols-[260px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Prep items</CardTitle>
              <CardDescription>Select to edit recipe.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {prepItems.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPrepId(p.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm ${
                    selectedPrepId === p.id
                      ? "bg-stone-100 font-medium"
                      : "hover:bg-stone-50"
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="font-mono text-[11px] text-stone-500">
                    {p.unit}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
          {selectedPrepId ? (
            <PrepRecipeEditor
              prepItem={prepItems.find((p) => p.id === selectedPrepId)!}
              prepItems={prepItems}
              ingredients={ingredients}
            />
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-stone-500">
                Pick a prep item from the left to edit its recipe.
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-[260px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Panini items</CardTitle>
              <CardDescription>Select to edit recipe.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {menuItems.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMenuId(m.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm ${
                    selectedMenuId === m.id
                      ? "bg-stone-100 font-medium"
                      : "hover:bg-stone-50"
                  }`}
                >
                  <span>{m.name}</span>
                  <span className="font-mono text-[11px] text-stone-500">
                    {m.code}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
          {selectedMenuId ? (
            <MenuRecipeEditor
              menuItem={menuItems.find((m) => m.id === selectedMenuId)!}
              prepItems={prepItems}
              ingredients={ingredients}
            />
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-stone-500">
                Pick a panini from the left to edit its recipe.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}

function usePrepLines(prepItemId: string | null) {
  return useQuery({
    queryKey: [...qk.prepItemRecipe, "by-prep", prepItemId] as const,
    enabled: !!prepItemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prep_item_recipe")
        .select("*")
        .eq("prep_item_id", prepItemId!);
      if (error) throw error;
      return (data ?? []) as PrepLine[];
    },
  });
}

function useMenuLines(menuItemId: string | null) {
  return useQuery({
    queryKey: [...qk.menuItemRecipe, "by-menu", menuItemId] as const,
    enabled: !!menuItemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_item_recipe")
        .select("*")
        .eq("menu_item_id", menuItemId!)
        .order("line_no");
      if (error) throw error;
      return (data ?? []) as MenuLine[];
    },
  });
}

function PrepRecipeEditor({
  prepItem,
  prepItems,
  ingredients,
}: {
  prepItem: PrepItemLite;
  prepItems: PrepItemLite[];
  ingredients: IngredientLite[];
}) {
  const qc = useQueryClient();
  const { data: lines = [], isLoading } = usePrepLines(prepItem.id);

  const yieldQty = lines[0]?.yield_qty ?? null;
  const yieldUnit = lines[0]?.yield_unit ?? prepItem.unit;

  const upsertLine = useMutation({
    mutationFn: async (line: Partial<PrepLine> & { id?: string }) => {
      const row = {
        prep_item_id: prepItem.id,
        ingredient_id: line.ingredient_id ?? null,
        child_prep_item_id: line.child_prep_item_id ?? null,
        qty_per_yield: line.qty_per_yield ?? 0,
        qty_unit: line.qty_unit ?? "g",
        yield_qty: line.yield_qty ?? yieldQty ?? 1,
        yield_unit: line.yield_unit ?? yieldUnit,
      };
      if (line.id) {
        const { error } = await supabase
          .from("prep_item_recipe")
          .update(row)
          .eq("id", line.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("prep_item_recipe").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.prepItemRecipe });
    },
  });

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("prep_item_recipe")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.prepItemRecipe });
    },
  });

  const updateYield = useMutation({
    mutationFn: async ({ qty, unit }: { qty: number; unit: string }) => {
      const { error } = await supabase
        .from("prep_item_recipe")
        .update({ yield_qty: qty, yield_unit: unit })
        .eq("prep_item_id", prepItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.prepItemRecipe });
    },
  });

  const ingredientName = (id: string | null) =>
    ingredients.find((i) => i.id === id)?.name ?? "—";
  const prepName = (id: string | null) =>
    prepItems.find((p) => p.id === id)?.name ?? "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{prepItem.name}</CardTitle>
          <CardDescription>
            Yield {yieldQty == null ? "—" : `${yieldQty} ${yieldUnit}`} per
            batch. Each line = one ingredient or child prep.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            openPrepCookCard(prepItem, lines, ingredients, prepItems)
          }
        >
          Print cook card
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <YieldEditor
          qty={yieldQty}
          unit={yieldUnit}
          disabled={lines.length === 0 || updateYield.isPending}
          onSave={(qty, unit) =>
            updateYield
              .mutateAsync({ qty, unit })
              .then(() => toast.success("Yield updated"))
              .catch((e: Error) => toast.error(e.message))
          }
        />

        {isLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : null}
        {lines.length === 0 && !isLoading ? (
          <p className="text-sm text-stone-500">
            No recipe lines yet — add one below.
          </p>
        ) : null}

        <div className="space-y-1">
          {lines.map((ln) => (
            <PrepLineRow
              key={ln.id}
              line={ln}
              prepItems={prepItems}
              ingredients={ingredients}
              ingredientName={ingredientName}
              prepName={prepName}
              onSave={(patch) =>
                upsertLine
                  .mutateAsync({ id: ln.id, ...patch })
                  .then(() => toast.success("Saved"))
                  .catch((e: Error) => toast.error(e.message))
              }
              onDelete={() =>
                deleteLine
                  .mutateAsync(ln.id)
                  .then(() => toast.success("Deleted"))
                  .catch((e: Error) => toast.error(e.message))
              }
            />
          ))}
        </div>

        <AddPrepLineForm
          prepItems={prepItems}
          ingredients={ingredients}
          defaultUnit={yieldUnit}
          onAdd={async (patch) => {
            try {
              await upsertLine.mutateAsync(patch);
              toast.success("Line added");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

function YieldEditor({
  qty,
  unit,
  disabled,
  onSave,
}: {
  qty: number | null;
  unit: string;
  disabled: boolean;
  onSave: (qty: number, unit: string) => void;
}) {
  const [q, setQ] = useState(qty == null ? "" : String(qty));
  const [u, setU] = useState(unit);
  // Re-seed local state when the loaded yield arrives or changes — prevents
  // the editor from showing blank/stale values for recipes whose lines load
  // asynchronously after mount.
  useEffect(() => {
    setQ(qty == null ? "" : String(qty));
  }, [qty]);
  useEffect(() => {
    setU(unit);
  }, [unit]);
  return (
    <div className="flex items-end gap-2 rounded border border-stone-200 bg-stone-50 p-2">
      <div className="flex-1">
        <label className="text-xs text-stone-500">Yield qty</label>
        <Input
          inputMode="decimal"
          value={q}
          onChange={(e) => setQ(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </div>
      <div className="w-24">
        <label className="text-xs text-stone-500">Yield unit</label>
        <Input value={u} onChange={(e) => setU(e.target.value)} />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          const n = parseFloat(q);
          if (!isFinite(n) || n <= 0) {
            toast.error("Yield must be > 0");
            return;
          }
          onSave(n, u.trim() || "unit");
        }}
      >
        Save yield
      </Button>
    </div>
  );
}

function PrepLineRow({
  line,
  prepItems,
  ingredients,
  ingredientName,
  prepName,
  onSave,
  onDelete,
}: {
  line: PrepLine;
  prepItems: PrepItemLite[];
  ingredients: IngredientLite[];
  ingredientName: (id: string | null) => string;
  prepName: (id: string | null) => string;
  onSave: (patch: Partial<PrepLine>) => void;
  onDelete: () => void;
}) {
  const isChild = line.child_prep_item_id != null;
  const sourceLabel = isChild
    ? prepName(line.child_prep_item_id)
    : ingredientName(line.ingredient_id);
  const [qty, setQty] = useState(String(line.qty_per_yield));
  const [unit, setUnit] = useState(line.qty_unit);
  const dirty = qty !== String(line.qty_per_yield) || unit !== line.qty_unit;
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 border-b border-[var(--color-border)] py-2 last:border-b-0">
      <div className="text-sm">
        <span className="font-medium">{sourceLabel}</span>
        {isChild ? (
          <Badge variant="outline" className="ml-2 text-[10px]">
            prep
          </Badge>
        ) : null}
        <div className="font-mono text-[10px] text-stone-500">
          {isChild ? line.child_prep_item_id : line.ingredient_id}
        </div>
      </div>
      <Input
        inputMode="decimal"
        className="h-9 w-20 text-center text-sm"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
      />
      <Input
        className="h-9 w-16 text-sm"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!dirty}
        onClick={() => {
          const n = parseFloat(qty);
          if (!isFinite(n)) {
            toast.error("Qty must be a number");
            return;
          }
          onSave({ qty_per_yield: n, qty_unit: unit.trim() || "g" });
        }}
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (confirm(`Remove ${sourceLabel}?`)) onDelete();
        }}
      >
        ✕
      </Button>
      {/* keep the prepItems/ingredients lookup refs alive for lint */}
      <span className="hidden">
        {prepItems.length}/{ingredients.length}
      </span>
    </div>
  );
}

function AddPrepLineForm({
  prepItems,
  ingredients,
  defaultUnit,
  onAdd,
}: {
  prepItems: PrepItemLite[];
  ingredients: IngredientLite[];
  defaultUnit: string;
  onAdd: (patch: Partial<PrepLine>) => Promise<void> | void;
}) {
  const [kind, setKind] = useState<"ingredient" | "prep">("ingredient");
  const [sourceId, setSourceId] = useState<string>("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g");

  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-2">
      <div className="mb-2 text-xs font-medium text-stone-700">Add line</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr_80px_80px_auto]">
        <select
          className="h-9 rounded border border-[var(--color-border)] bg-white px-2 text-sm"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as "ingredient" | "prep");
            setSourceId("");
          }}
        >
          <option value="ingredient">Ingredient</option>
          <option value="prep">Child prep</option>
        </select>
        <select
          className="h-9 rounded border border-[var(--color-border)] bg-white px-2 text-sm"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          <option value="">— pick —</option>
          {(kind === "ingredient" ? ingredients : prepItems).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <Input
          inputMode="decimal"
          placeholder="qty"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        <Input
          placeholder={defaultUnit}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <Button
          size="sm"
          disabled={!sourceId}
          onClick={async () => {
            const n = parseFloat(qty);
            if (!isFinite(n) || n <= 0) {
              toast.error("Qty must be > 0");
              return;
            }
            await onAdd({
              qty_per_yield: n,
              qty_unit: unit.trim() || "g",
              ingredient_id: kind === "ingredient" ? sourceId : null,
              child_prep_item_id: kind === "prep" ? sourceId : null,
            });
            setSourceId("");
            setQty("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function MenuRecipeEditor({
  menuItem,
  prepItems,
  ingredients,
}: {
  menuItem: MenuItemLite;
  prepItems: PrepItemLite[];
  ingredients: IngredientLite[];
}) {
  const qc = useQueryClient();
  const { data: lines = [], isLoading } = useMenuLines(menuItem.id);

  const nextLineNo = useMemo(
    () => (lines.length === 0 ? 1 : Math.max(...lines.map((l) => l.line_no)) + 1),
    [lines]
  );

  const upsertLine = useMutation({
    mutationFn: async (
      line: Partial<MenuLine> & { line_no: number; insert?: boolean }
    ) => {
      const row = {
        menu_item_id: menuItem.id,
        line_no: line.line_no,
        ingredient_id: line.ingredient_id ?? null,
        prep_item_id: line.prep_item_id ?? null,
        qty_per_serve: line.qty_per_serve ?? 0,
        qty_unit: line.qty_unit ?? "g",
      };
      if (line.insert) {
        const { error } = await supabase.from("menu_item_recipe").insert(row);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("menu_item_recipe")
          .update(row)
          .eq("menu_item_id", menuItem.id)
          .eq("line_no", line.line_no);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.menuItemRecipe });
    },
  });

  const deleteLine = useMutation({
    mutationFn: async (lineNo: number) => {
      const { error } = await supabase
        .from("menu_item_recipe")
        .delete()
        .eq("menu_item_id", menuItem.id)
        .eq("line_no", lineNo);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.menuItemRecipe });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{menuItem.name}</CardTitle>
          <CardDescription>
            One line per ingredient or prep component used per serve.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            openMenuCookCard(menuItem, lines, ingredients, prepItems)
          }
        >
          Print cook card
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
        {lines.length === 0 && !isLoading ? (
          <p className="text-sm text-stone-500">No lines yet.</p>
        ) : null}

        <div className="space-y-1">
          {lines.map((ln) => (
            <MenuLineRow
              key={ln.line_no}
              line={ln}
              prepItems={prepItems}
              ingredients={ingredients}
              onSave={(patch) =>
                upsertLine
                  .mutateAsync({ ...patch, line_no: ln.line_no })
                  .then(() => toast.success("Saved"))
                  .catch((e: Error) => toast.error(e.message))
              }
              onDelete={() =>
                deleteLine
                  .mutateAsync(ln.line_no)
                  .then(() => toast.success("Deleted"))
                  .catch((e: Error) => toast.error(e.message))
              }
            />
          ))}
        </div>

        <AddMenuLineForm
          prepItems={prepItems}
          ingredients={ingredients}
          nextLineNo={nextLineNo}
          onAdd={async (patch) => {
            try {
              await upsertLine.mutateAsync({ ...patch, insert: true });
              toast.success("Line added");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

function MenuLineRow({
  line,
  prepItems,
  ingredients,
  onSave,
  onDelete,
}: {
  line: MenuLine;
  prepItems: PrepItemLite[];
  ingredients: IngredientLite[];
  onSave: (patch: Partial<MenuLine>) => void;
  onDelete: () => void;
}) {
  const isPrep = line.prep_item_id != null;
  const sourceName = isPrep
    ? prepItems.find((p) => p.id === line.prep_item_id)?.name ?? "—"
    : ingredients.find((i) => i.id === line.ingredient_id)?.name ?? "—";
  const [qty, setQty] = useState(String(line.qty_per_serve));
  const [unit, setUnit] = useState(line.qty_unit);
  const dirty = qty !== String(line.qty_per_serve) || unit !== line.qty_unit;
  return (
    <div className="grid grid-cols-[40px_1fr_auto_auto_auto_auto] items-center gap-2 border-b border-[var(--color-border)] py-2 last:border-b-0">
      <span className="text-center font-mono text-[11px] text-stone-500">
        #{line.line_no}
      </span>
      <div className="text-sm">
        <span className="font-medium">{sourceName}</span>
        {isPrep ? (
          <Badge variant="outline" className="ml-2 text-[10px]">
            prep
          </Badge>
        ) : null}
      </div>
      <Input
        inputMode="decimal"
        className="h-9 w-20 text-center text-sm"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
      />
      <Input
        className="h-9 w-16 text-sm"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!dirty}
        onClick={() => {
          const n = parseFloat(qty);
          if (!isFinite(n)) {
            toast.error("Qty must be a number");
            return;
          }
          onSave({ qty_per_serve: n, qty_unit: unit.trim() || "g" });
        }}
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (confirm(`Remove line ${line.line_no} (${sourceName})?`))
            onDelete();
        }}
      >
        ✕
      </Button>
    </div>
  );
}

function AddMenuLineForm({
  prepItems,
  ingredients,
  nextLineNo,
  onAdd,
}: {
  prepItems: PrepItemLite[];
  ingredients: IngredientLite[];
  nextLineNo: number;
  onAdd: (patch: Partial<MenuLine> & { line_no: number }) => Promise<void> | void;
}) {
  const [kind, setKind] = useState<"ingredient" | "prep">("prep");
  const [sourceId, setSourceId] = useState<string>("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g");

  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-2">
      <div className="mb-2 text-xs font-medium text-stone-700">
        Add line (next #{nextLineNo})
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr_80px_80px_auto]">
        <select
          className="h-9 rounded border border-[var(--color-border)] bg-white px-2 text-sm"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as "ingredient" | "prep");
            setSourceId("");
          }}
        >
          <option value="prep">Prep item</option>
          <option value="ingredient">Ingredient</option>
        </select>
        <select
          className="h-9 rounded border border-[var(--color-border)] bg-white px-2 text-sm"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          <option value="">— pick —</option>
          {(kind === "ingredient" ? ingredients : prepItems).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <Input
          inputMode="decimal"
          placeholder="qty"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        <Input
          placeholder="g"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <Button
          size="sm"
          disabled={!sourceId}
          onClick={async () => {
            const n = parseFloat(qty);
            if (!isFinite(n) || n <= 0) {
              toast.error("Qty must be > 0");
              return;
            }
            await onAdd({
              line_no: nextLineNo,
              qty_per_serve: n,
              qty_unit: unit.trim() || "g",
              ingredient_id: kind === "ingredient" ? sourceId : null,
              prep_item_id: kind === "prep" ? sourceId : null,
            });
            setSourceId("");
            setQty("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Print cook cards — open a new window with print-friendly markup.
// ---------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openPrepCookCard(
  prepItem: PrepItemLite,
  lines: PrepLine[],
  ingredients: IngredientLite[],
  prepItems: PrepItemLite[]
) {
  const yieldQty = lines[0]?.yield_qty ?? "";
  const yieldUnit = lines[0]?.yield_unit ?? prepItem.unit;
  const rows = lines
    .map((ln) => {
      const name = ln.child_prep_item_id
        ? prepItems.find((p) => p.id === ln.child_prep_item_id)?.name ??
          "Child prep"
        : ingredients.find((i) => i.id === ln.ingredient_id)?.name ??
          "Ingredient";
      return `<tr>
  <td>${escapeHtml(name)}</td>
  <td style="text-align:right">${ln.qty_per_yield} ${escapeHtml(ln.qty_unit)}</td>
</tr>`;
    })
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>${escapeHtml(prepItem.name)} — cook card</title>
<style>
  body { font: 14px/1.4 -apple-system, system-ui, sans-serif; padding: 24px; color: #111; }
  h1 { margin: 0 0 4px; }
  .meta { color: #666; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #ddd; }
  th { text-align: left; font-weight: 600; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>${escapeHtml(prepItem.name)}</h1>
<div class="meta">Yield: ${yieldQty} ${escapeHtml(yieldUnit)} · Code ${escapeHtml(prepItem.code)}</div>
<table>
  <thead><tr><th>Ingredient</th><th style="text-align:right">Qty</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="2" style="color:#999">No lines</td></tr>`}</tbody>
</table>
<script>setTimeout(() => window.print(), 200);</script>
</body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

function openMenuCookCard(
  menuItem: MenuItemLite,
  lines: MenuLine[],
  ingredients: IngredientLite[],
  prepItems: PrepItemLite[]
) {
  const rows = lines
    .map((ln) => {
      const name = ln.prep_item_id
        ? prepItems.find((p) => p.id === ln.prep_item_id)?.name ?? "Prep"
        : ingredients.find((i) => i.id === ln.ingredient_id)?.name ??
          "Ingredient";
      return `<tr>
  <td style="width:32px">#${ln.line_no}</td>
  <td>${escapeHtml(name)}</td>
  <td style="text-align:right">${ln.qty_per_serve} ${escapeHtml(ln.qty_unit)}</td>
</tr>`;
    })
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>${escapeHtml(menuItem.name)} — cook card</title>
<style>
  body { font: 14px/1.4 -apple-system, system-ui, sans-serif; padding: 24px; color: #111; }
  h1 { margin: 0 0 4px; }
  .meta { color: #666; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #ddd; }
  th { text-align: left; font-weight: 600; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>${escapeHtml(menuItem.name)}</h1>
<div class="meta">Per serve · Code ${escapeHtml(menuItem.code)}</div>
<table>
  <thead><tr><th>#</th><th>Component</th><th style="text-align:right">Qty</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="3" style="color:#999">No lines</td></tr>`}</tbody>
</table>
<script>setTimeout(() => window.print(), 200);</script>
</body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
