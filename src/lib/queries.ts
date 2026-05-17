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
  productionPnl: (start: string, end: string) =>
    ["production_pnl", start, end] as const,
  salesAverages: (storeId: string, weekNumber: number) =>
    ["sales_averages_4wk", storeId, weekNumber] as const,
  addonEntries: (weekId: string) => ["addon_entries", weekId] as const,
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

export function useProductionPnl(start: string, end: string) {
  return useQuery({
    queryKey: qk.productionPnl(start, end),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("production_pnl", {
        p_start_date: start,
        p_end_date: end,
      });
      if (error) throw error;
      return data ?? [];
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
