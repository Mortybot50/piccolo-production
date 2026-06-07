// Shared React Query hooks. Single source of truth for query keys so
// mutations can invalidate the right slices.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/format";

export const qk = {
  appSettings: ["app_settings"] as const,
  stores: ["stores"] as const,
  suppliers: ["suppliers"] as const,
  prepItems: ["prep_items"] as const,
  menuItems: ["menu_items"] as const,
  addonItems: ["addon_items"] as const,
  ingredients: ["ingredients"] as const,
  prepItemRecipe: ["prep_item_recipe"] as const,
  menuItemRecipe: ["menu_item_recipe"] as const,
  users: ["users"] as const,
  salesWeeks: ["sales_weeks"] as const,
  salesEntries: (weekId: string) => ["sales_entries", weekId] as const,
  prepLog: (date: string) => ["prep_log", date] as const,
  stockCounts: (date: string) => ["stock_counts", date] as const,
  wasteEntries: (date: string) => ["waste_entries", date] as const,
  storeOrders: ["store_orders"] as const,
  supplierOrders: ["supplier_orders"] as const,
  cateringOrders: ["catering_orders"] as const,
  invoices: ["invoices"] as const,
  auditLog: ["audit_log"] as const,
  dailyPrepPlan: (date: string) => ["daily_prep_plan", date] as const,
  prepGap: (date: string) => ["prep_gap", date] as const,
  storeOrderRecommendation: (storeId: string, forDate: string) =>
    ["store_order_recommendation", storeId, forDate] as const,
  supplierOrderRecommendation: (supplierId: string, deliveryDate: string) =>
    ["supplier_order_recommendation", supplierId, deliveryDate] as const,
  weeklyInvoice: (storeId: string, ws: string, we: string) =>
    ["weekly_invoice", storeId, ws, we] as const,
  salesAverages: (storeId: string, weekNumber: number) =>
    ["sales_averages_4wk", storeId, weekNumber] as const,
  addonEntries: (weekId: string) => ["addon_entries", weekId] as const,
  cateringLines: (date: string) => ["catering_order_lines", date] as const,
  prepPlanOverrides: (date: string) => ["prep_plan_overrides", date] as const,
  storeOrderOverrides: (storeId: string, date: string) =>
    ["store_order_overrides", storeId, date] as const,
  ingredientCostHistory: (id: string) => ["ingredient_cost_history", id] as const,
  transferPriceHistory: (id: string) => ["transfer_price_history", id] as const,
  computeCogs: (kind: string, id: string, asOf: string) =>
    ["compute_cogs", kind, id, asOf] as const,
  transferPriceAsOf: (id: string, asOf: string) =>
    ["transfer_price_as_of", id, asOf] as const,
};

// ---------------------------------------------------------------------------
// App settings (singleton row)
// ---------------------------------------------------------------------------
export function useAppSettings() {
  return useQuery({
    queryKey: qk.appSettings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      latest_week_number?: number;
      buffer_pct?: number;
      waste_threshold_pct?: number;
      window_weeks?: number;
      use_median?: boolean;
    }) => {
      const { data: cur } = await supabase
        .from("app_settings")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (!cur?.id) throw new Error("app_settings row missing");
      const { error } = await supabase.from("app_settings").update(patch).eq("id", cur.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.appSettings }),
  });
}

// ---------------------------------------------------------------------------
// Generic list hooks
// ---------------------------------------------------------------------------
export function useStores() {
  return useQuery({
    queryKey: qk.stores,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: qk.suppliers,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePrepItems() {
  return useQuery({
    queryKey: qk.prepItems,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prep_items")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMenuItems() {
  return useQuery({
    queryKey: qk.menuItems,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddonItems() {
  return useQuery({
    queryKey: qk.addonItems,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_items")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useIngredients() {
  return useQuery({
    queryKey: qk.ingredients,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingredients")
        .select("*, suppliers!ingredients_supplier_id_fkey(code,name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUsersList() {
  return useQuery({
    queryKey: qk.users,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, display_name, active, must_change_pin, last_login, locked_until")
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalesWeeks() {
  return useQuery({
    queryKey: qk.salesWeeks,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_weeks")
        .select("*")
        .order("week_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 1 refresh mutations — sales_weeks exclusion, ingredient split rules,
// menu_item splits, supplier schedule.
// ---------------------------------------------------------------------------
export function useUpdateSalesWeekExclusion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { id: string; exclude_from_avg: boolean }) => {
      const { error } = await supabase
        .from("sales_weeks")
        .update({ exclude_from_avg: patch.exclude_from_avg })
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.salesWeeks }),
  });
}

export function useUpdateIngredientSplitRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { id: string; split_rule: string }) => {
      const { error } = await supabase
        .from("ingredients")
        .update({ split_rule: patch.split_rule })
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ingredients }),
  });
}

export function useUpdateMenuItemSplits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      id: string;
      haw_split_pct: number;
      sy_split_pct: number;
    }) => {
      const { error } = await supabase
        .from("menu_items")
        .update({
          haw_split_pct: patch.haw_split_pct,
          sy_split_pct: patch.sy_split_pct,
        })
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.menuItems }),
  });
}

export function useUpdateSupplierSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { id: string; schedule_jsonb: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("suppliers")
        .update({ schedule_jsonb: patch.schedule_jsonb as never })
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.suppliers }),
  });
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------
export function usePrepRecipes() {
  return useQuery({
    queryKey: qk.prepItemRecipe,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prep_item_recipe")
        .select("*, prep_items(name, code), ingredients(name, code, pack_unit)");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMenuRecipes() {
  return useQuery({
    queryKey: qk.menuItemRecipe,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_item_recipe")
        .select(
          "*, menu_items(name, code), ingredients(name, code), prep_items(name, code)"
        )
        .order("line_no");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------
export function useDailyPrepPlan(date: string = todayISO()) {
  return useQuery({
    queryKey: qk.dailyPrepPlan(date),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("daily_prep_plan", { p_date: date });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePrepGap(date: string = todayISO()) {
  return useQuery({
    queryKey: qk.prepGap(date),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("prep_gap", { p_date: date });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStoreOrderRecommendation(storeId: string | null, forDate: string) {
  return useQuery({
    queryKey: qk.storeOrderRecommendation(storeId ?? "", forDate),
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("store_order_recommendation", {
        p_store_id: storeId!,
        p_for_date: forDate,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSupplierOrderRecommendation(
  supplierId: string | null,
  deliveryDate: string
) {
  return useQuery({
    queryKey: qk.supplierOrderRecommendation(supplierId ?? "", deliveryDate),
    enabled: !!supplierId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("supplier_order_recommendation", {
        p_supplier_id: supplierId!,
        p_delivery_date: deliveryDate,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWeeklyInvoice(
  storeId: string | null,
  weekStart: string,
  weekEnd: string,
) {
  return useQuery({
    queryKey: qk.weeklyInvoice(storeId ?? "", weekStart, weekEnd),
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("weekly_invoice", {
        p_store_id: storeId!,
        p_week_start: weekStart,
        p_week_end: weekEnd,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalesAverages(storeId: string | null, weekNumber: number | null) {
  return useQuery({
    queryKey: qk.salesAverages(storeId ?? "", weekNumber ?? 0),
    enabled: !!storeId && weekNumber != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sales_averages_4wk", {
        p_store_id: storeId!,
        p_week_number: weekNumber!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalesEntries(weekId: string | null) {
  return useQuery({
    queryKey: qk.salesEntries(weekId ?? ""),
    enabled: !!weekId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select("*")
        .eq("week_id", weekId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddonEntries(weekId: string | null) {
  return useQuery({
    queryKey: qk.addonEntries(weekId ?? ""),
    enabled: !!weekId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_entries")
        .select("*")
        .eq("week_id", weekId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// production_pnl was dropped in v2 (Phase 1, migration 0011). Use compute_cogs
// + transfer_price_as_of for per-item COGS/margin, and weekly_invoice for revenue.
export function useComputeCogs(kind: "menu_item" | "prep_item", id: string | null, asOf: string) {
  return useQuery({
    queryKey: qk.computeCogs(kind, id ?? "", asOf),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_cogs", {
        p_kind: kind,
        p_id: id!,
        p_as_of_date: asOf,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export function useTransferPriceAsOf(prepItemId: string | null, asOf: string) {
  return useQuery({
    queryKey: qk.transferPriceAsOf(prepItemId ?? "", asOf),
    enabled: !!prepItemId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("transfer_price_as_of", {
        p_prep_item_id: prepItemId!,
        p_as_of_date: asOf,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

// ---------------------------------------------------------------------------
// Daily log queries
// ---------------------------------------------------------------------------
export function useStockCounts(date: string = todayISO()) {
  return useQuery({
    queryKey: qk.stockCounts(date),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_counts")
        .select("*")
        .eq("count_date", date)
        .order("counted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePrepLog(date: string = todayISO()) {
  return useQuery({
    queryKey: qk.prepLog(date),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prep_log")
        .select("*")
        .eq("log_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePrepLogRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["prep_log_range", startDate, endDate] as const,
    enabled: !!startDate && !!endDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prep_log")
        .select("*")
        .gte("log_date", startDate)
        .lte("log_date", endDate)
        .order("log_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCombinedDemandByWeekday(weekNumber: number | null) {
  return useQuery({
    queryKey: ["combined_demand_by_weekday", weekNumber ?? 0] as const,
    enabled: weekNumber != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("combined_demand_by_weekday", {
        p_week_number: weekNumber!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWasteEntries(date: string = todayISO()) {
  return useQuery({
    queryKey: qk.wasteEntries(date),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_entries")
        .select("*")
        .eq("waste_date", date)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// v2 — catering, overrides, effective-dated history
// ---------------------------------------------------------------------------

export function useCateringForDate(date: string) {
  return useQuery({
    queryKey: qk.cateringLines(date),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catering_orders")
        .select("id, delivery_date, customer_name, notes, catering_order_lines(id, menu_item_id, qty)")
        .eq("delivery_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertCateringQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      date: string;
      menuItemId: string;
      qty: number;
      userId: string | null;
    }) => {
      // Find or create a single "Today decorator" catering order for the date.
      const { data: existing } = await supabase
        .from("catering_orders")
        .select("id")
        .eq("delivery_date", input.date)
        .eq("customer_name", "Today decorator")
        .maybeSingle();
      let orderId = existing?.id as string | undefined;
      if (!orderId) {
        const { data: ins, error: insErr } = await supabase
          .from("catering_orders")
          .insert({
            delivery_date: input.date,
            customer_name: "Today decorator",
            notes: "Inline edit from /today",
            created_by_user_id: input.userId,
            status: "confirmed",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        orderId = ins.id;
      }
      if (input.qty <= 0) {
        const { error } = await supabase
          .from("catering_order_lines")
          .delete()
          .eq("catering_order_id", orderId)
          .eq("menu_item_id", input.menuItemId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("catering_order_lines")
          .upsert(
            { catering_order_id: orderId, menu_item_id: input.menuItemId, qty: input.qty },
            { onConflict: "catering_order_id,menu_item_id" }
          );
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.cateringLines(vars.date) });
      qc.invalidateQueries({ queryKey: qk.dailyPrepPlan(vars.date) });
    },
  });
}

export function usePrepPlanOverrides(date: string) {
  return useQuery({
    queryKey: qk.prepPlanOverrides(date),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prep_plan_overrides")
        .select("*")
        .eq("plan_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertPrepPlanOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      date: string;
      prepItemId: string;
      override_total?: number | null;
      override_haw?: number | null;
      override_sy?: number | null;
      userId: string | null;
    }) => {
      const row = {
        plan_date: input.date,
        prep_item_id: input.prepItemId,
        created_by_user_id: input.userId,
        ...(input.override_total !== undefined ? { override_total: input.override_total } : {}),
        ...(input.override_haw !== undefined ? { override_haw: input.override_haw } : {}),
        ...(input.override_sy !== undefined ? { override_sy: input.override_sy } : {}),
      };
      const { error } = await supabase
        .from("prep_plan_overrides")
        .upsert(row, { onConflict: "plan_date,prep_item_id" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.prepPlanOverrides(vars.date) });
      qc.invalidateQueries({ queryKey: qk.dailyPrepPlan(vars.date) });
    },
  });
}

export function useStoreOrderOverrides(storeId: string | null, date: string) {
  return useQuery({
    queryKey: qk.storeOrderOverrides(storeId ?? "", date),
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_order_overrides")
        .select("*")
        .eq("store_id", storeId!)
        .eq("for_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertStoreOrderOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      storeId: string;
      date: string;
      prepItemId: string;
      override_qty: number | null;
      userId: string | null;
    }) => {
      const { error } = await supabase.from("store_order_overrides").upsert(
        {
          store_id: input.storeId,
          for_date: input.date,
          prep_item_id: input.prepItemId,
          override_qty: input.override_qty,
          created_by_user_id: input.userId,
        },
        { onConflict: "store_id,for_date,prep_item_id" }
      );
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: qk.storeOrderOverrides(vars.storeId, vars.date),
      });
      qc.invalidateQueries({
        queryKey: qk.storeOrderRecommendation(vars.storeId, vars.date),
      });
    },
  });
}

export function useIngredientCostHistory(ingredientId: string | null) {
  return useQuery({
    queryKey: qk.ingredientCostHistory(ingredientId ?? ""),
    enabled: !!ingredientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingredient_cost_history")
        .select("*")
        .eq("ingredient_id", ingredientId!)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTransferPriceHistory(prepItemId: string | null) {
  return useQuery({
    queryKey: qk.transferPriceHistory(prepItemId ?? ""),
    enabled: !!prepItemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_price_history")
        .select("*")
        .eq("prep_item_id", prepItemId!)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Close the open history row and insert a new one effective today. Used by
// Settings when editing transfer prices / ingredient costs.
export function useCloseAndInsertHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input:
      | { kind: "transfer"; prepItemId: string; newPriceCents: number }
      | { kind: "ingredient"; ingredientId: string; newCostPerUnitCents: number }
    ) => {
      const today = todayISO();
      if (input.kind === "transfer") {
        // Close the open row.
        const { error: closeErr } = await supabase
          .from("transfer_price_history")
          .update({ effective_to: today })
          .eq("prep_item_id", input.prepItemId)
          .is("effective_to", null);
        if (closeErr) throw closeErr;
        const { error: insErr } = await supabase
          .from("transfer_price_history")
          .insert({
            prep_item_id: input.prepItemId,
            price_cents: input.newPriceCents,
            effective_from: today,
            effective_to: null,
          });
        if (insErr) throw insErr;
        // Mirror onto prep_items so other read-paths (e.g. cached displays) stay aligned.
        await supabase
          .from("prep_items")
          .update({ transfer_price_cents: input.newPriceCents })
          .eq("id", input.prepItemId);
      } else {
        const { error: closeErr } = await supabase
          .from("ingredient_cost_history")
          .update({ effective_to: today })
          .eq("ingredient_id", input.ingredientId)
          .is("effective_to", null);
        if (closeErr) throw closeErr;
        const { error: insErr } = await supabase
          .from("ingredient_cost_history")
          .insert({
            ingredient_id: input.ingredientId,
            cost_per_unit_cents: input.newCostPerUnitCents,
            effective_from: today,
            effective_to: null,
          });
        if (insErr) throw insErr;
        // cost_per_unit_cents is a generated column on ingredients (cost_per_pack_cents / pack_qty).
        // We only stamp last_cost_update_at here; the upstream caller is expected to
        // have already written cost_per_pack_cents + pack_qty to drive the generated value.
        await supabase
          .from("ingredients")
          .update({ last_cost_update_at: new Date().toISOString() })
          .eq("id", input.ingredientId);
      }
    },
    onSuccess: (_, vars) => {
      if (vars.kind === "transfer") {
        qc.invalidateQueries({ queryKey: qk.transferPriceHistory(vars.prepItemId) });
        qc.invalidateQueries({ queryKey: qk.prepItems });
      } else {
        qc.invalidateQueries({ queryKey: qk.ingredientCostHistory(vars.ingredientId) });
        qc.invalidateQueries({ queryKey: qk.ingredients });
      }
    },
  });
}

export function useAdvanceLatestWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("auto_advance_week");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.appSettings });
      qc.invalidateQueries({ queryKey: qk.salesWeeks });
    },
  });
}
