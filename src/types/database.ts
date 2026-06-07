export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addon_entries: {
        Row: {
          addon_item_id: string
          created_at: string
          id: string
          qty: number
          store_id: string
          updated_at: string
          week_id: string
          weekday: string
        }
        Insert: {
          addon_item_id: string
          created_at?: string
          id?: string
          qty?: number
          store_id: string
          updated_at?: string
          week_id: string
          weekday: string
        }
        Update: {
          addon_item_id?: string
          created_at?: string
          id?: string
          qty?: number
          store_id?: string
          updated_at?: string
          week_id?: string
          weekday?: string
        }
        Relationships: [
          {
            foreignKeyName: "addon_entries_addon_item_id_fkey"
            columns: ["addon_item_id"]
            isOneToOne: false
            referencedRelation: "addon_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_entries_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "sales_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      addon_items: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          linked_prep_item_id: string | null
          name: string
          portion_g: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          linked_prep_item_id?: string | null
          name: string
          portion_g?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          linked_prep_item_id?: string | null
          name?: string
          portion_g?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addon_items_linked_prep_item_id_fkey"
            columns: ["linked_prep_item_id"]
            isOneToOne: false
            referencedRelation: "prep_items"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          buffer_pct: number
          created_at: string
          id: string
          latest_week_number: number
          singleton: boolean
          updated_at: string
          use_median: boolean
          waste_threshold_pct: number
          window_weeks: number
        }
        Insert: {
          buffer_pct?: number
          created_at?: string
          id?: string
          latest_week_number?: number
          singleton?: boolean
          updated_at?: string
          use_median?: boolean
          waste_threshold_pct?: number
          window_weeks?: number
        }
        Update: {
          buffer_pct?: number
          created_at?: string
          id?: string
          latest_week_number?: number
          singleton?: boolean
          updated_at?: string
          use_median?: boolean
          waste_threshold_pct?: number
          window_weeks?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          after_jsonb: Json | null
          before_jsonb: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ts: string
          user_id: string | null
        }
        Insert: {
          action: string
          after_jsonb?: Json | null
          before_jsonb?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ts?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after_jsonb?: Json | null
          before_jsonb?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ts?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_order_lines: {
        Row: {
          catering_order_id: string
          created_at: string
          menu_item_id: string
          qty: number
          updated_at: string
        }
        Insert: {
          catering_order_id: string
          created_at?: string
          menu_item_id: string
          qty: number
          updated_at?: string
        }
        Update: {
          catering_order_id?: string
          created_at?: string
          menu_item_id?: string
          qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catering_order_lines_catering_order_id_fkey"
            columns: ["catering_order_id"]
            isOneToOne: false
            referencedRelation: "catering_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_order_lines_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_orders: {
        Row: {
          contact: string | null
          created_at: string
          created_by_user_id: string | null
          customer_name: string
          delivery_date: string
          id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_name: string
          delivery_date: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_name?: string
          delivery_date?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catering_orders_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_cost_history: {
        Row: {
          cost_per_unit_cents: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          ingredient_id: string
          updated_at: string
        }
        Insert: {
          cost_per_unit_cents: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          ingredient_id: string
          updated_at?: string
        }
        Update: {
          cost_per_unit_cents?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          ingredient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_cost_history_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          code: string
          cost_per_pack_cents: number | null
          cost_per_unit_cents: number | null
          created_at: string
          id: string
          last_cost_update_at: string | null
          name: string
          pack_desc: string | null
          pack_qty: number | null
          pack_unit: string | null
          split_rule: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          cost_per_pack_cents?: number | null
          cost_per_unit_cents?: number | null
          created_at?: string
          id?: string
          last_cost_update_at?: string | null
          name: string
          pack_desc?: string | null
          pack_qty?: number | null
          pack_unit?: string | null
          split_rule?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          cost_per_pack_cents?: number | null
          cost_per_unit_cents?: number | null
          created_at?: string
          id?: string
          last_cost_update_at?: string | null
          name?: string
          pack_desc?: string | null
          pack_qty?: number | null
          pack_unit?: string | null
          split_rule?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          created_at: string
          invoice_id: string
          line_total_cents: number
          prep_item_id: string
          qty: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          invoice_id: string
          line_total_cents: number
          prep_item_id: string
          qty: number
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          invoice_id?: string
          line_total_cents?: number
          prep_item_id?: string
          qty?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_prep_item_id_fkey"
            columns: ["prep_item_id"]
            isOneToOne: false
            referencedRelation: "prep_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          generated_at: string
          generated_by_user_id: string | null
          id: string
          pdf_storage_path: string | null
          store_id: string
          total_cents: number
          updated_at: string
          week_end: string
          week_number: number
          week_start: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generated_by_user_id?: string | null
          id?: string
          pdf_storage_path?: string | null
          store_id: string
          total_cents: number
          updated_at?: string
          week_end: string
          week_number: number
          week_start: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          generated_by_user_id?: string | null
          id?: string
          pdf_storage_path?: string | null
          store_id?: string
          total_cents?: number
          updated_at?: string
          week_end?: string
          week_number?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_generated_by_user_id_fkey"
            columns: ["generated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_recipe: {
        Row: {
          created_at: string
          ingredient_id: string | null
          line_no: number
          menu_item_id: string
          prep_item_id: string | null
          qty_per_serve: number
          qty_unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ingredient_id?: string | null
          line_no: number
          menu_item_id: string
          prep_item_id?: string | null
          qty_per_serve: number
          qty_unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ingredient_id?: string | null
          line_no?: number
          menu_item_id?: string
          prep_item_id?: string | null
          qty_per_serve?: number
          qty_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_recipe_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipe_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipe_prep_item_id_fkey"
            columns: ["prep_item_id"]
            isOneToOne: false
            referencedRelation: "prep_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          code: string
          created_at: string
          haw_split_pct: number
          id: string
          name: string
          sell_price_cents: number
          sy_split_pct: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          haw_split_pct: number
          id?: string
          name: string
          sell_price_cents: number
          sy_split_pct: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          haw_split_pct?: number
          id?: string
          name?: string
          sell_price_cents?: number
          sy_split_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      prep_item_recipe: {
        Row: {
          child_prep_item_id: string | null
          created_at: string
          id: string
          ingredient_id: string | null
          prep_item_id: string
          qty_per_yield: number
          qty_unit: string
          updated_at: string
          yield_qty: number
          yield_unit: string
        }
        Insert: {
          child_prep_item_id?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string | null
          prep_item_id: string
          qty_per_yield: number
          qty_unit: string
          updated_at?: string
          yield_qty: number
          yield_unit: string
        }
        Update: {
          child_prep_item_id?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string | null
          prep_item_id?: string
          qty_per_yield?: number
          qty_unit?: string
          updated_at?: string
          yield_qty?: number
          yield_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "prep_item_recipe_child_prep_item_id_fkey"
            columns: ["child_prep_item_id"]
            isOneToOne: false
            referencedRelation: "prep_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_item_recipe_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_item_recipe_prep_item_id_fkey"
            columns: ["prep_item_id"]
            isOneToOne: false
            referencedRelation: "prep_items"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_items: {
        Row: {
          active: boolean
          batch_size: number | null
          batch_unit: string | null
          code: string
          created_at: string
          frequency_label: string | null
          id: string
          name: string
          portion_g: number
          shelf_life_days: number
          transfer_price_cents: number | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          batch_size?: number | null
          batch_unit?: string | null
          code: string
          created_at?: string
          frequency_label?: string | null
          id?: string
          name: string
          portion_g: number
          shelf_life_days: number
          transfer_price_cents?: number | null
          unit: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          batch_size?: number | null
          batch_unit?: string | null
          code?: string
          created_at?: string
          frequency_label?: string | null
          id?: string
          name?: string
          portion_g?: number
          shelf_life_days?: number
          transfer_price_cents?: number | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      prep_log: {
        Row: {
          created_at: string
          id: string
          log_date: string
          notes: string | null
          prep_item_id: string
          prepped_by_user_id: string | null
          qty_kept: number
          qty_prepped: number
          qty_sent_haw: number
          qty_sent_sy: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          log_date: string
          notes?: string | null
          prep_item_id: string
          prepped_by_user_id?: string | null
          qty_kept?: number
          qty_prepped: number
          qty_sent_haw?: number
          qty_sent_sy?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          log_date?: string
          notes?: string | null
          prep_item_id?: string
          prepped_by_user_id?: string | null
          qty_kept?: number
          qty_prepped?: number
          qty_sent_haw?: number
          qty_sent_sy?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prep_log_prep_item_id_fkey"
            columns: ["prep_item_id"]
            isOneToOne: false
            referencedRelation: "prep_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_log_prepped_by_user_id_fkey"
            columns: ["prepped_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_plan_overrides: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          notes: string | null
          override_haw: number | null
          override_sy: number | null
          override_total: number | null
          plan_date: string
          prep_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          notes?: string | null
          override_haw?: number | null
          override_sy?: number | null
          override_total?: number | null
          plan_date: string
          prep_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          notes?: string | null
          override_haw?: number | null
          override_sy?: number | null
          override_total?: number | null
          plan_date?: string
          prep_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prep_plan_overrides_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_plan_overrides_prep_item_id_fkey"
            columns: ["prep_item_id"]
            isOneToOne: false
            referencedRelation: "prep_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_entries: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          qty: number
          store_id: string
          updated_at: string
          week_id: string
          weekday: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          qty?: number
          store_id: string
          updated_at?: string
          week_id: string
          weekday: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          qty?: number
          store_id?: string
          updated_at?: string
          week_id?: string
          weekday?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_entries_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "sales_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_weeks: {
        Row: {
          created_at: string
          exclude_from_avg: boolean
          id: string
          updated_at: string
          week_end_date: string
          week_number: number
          week_start_date: string
        }
        Insert: {
          created_at?: string
          exclude_from_avg?: boolean
          id?: string
          updated_at?: string
          week_end_date: string
          week_number: number
          week_start_date: string
        }
        Update: {
          created_at?: string
          exclude_from_avg?: boolean
          id?: string
          updated_at?: string
          week_end_date?: string
          week_number?: number
          week_start_date?: string
        }
        Relationships: []
      }
      stock_counts: {
        Row: {
          count_date: string
          counted_at: string
          counted_by_user_id: string | null
          created_at: string
          id: string
          prep_item_id: string
          qty_on_hand: number
          updated_at: string
        }
        Insert: {
          count_date: string
          counted_at?: string
          counted_by_user_id?: string | null
          created_at?: string
          id?: string
          prep_item_id: string
          qty_on_hand: number
          updated_at?: string
        }
        Update: {
          count_date?: string
          counted_at?: string
          counted_by_user_id?: string | null
          created_at?: string
          id?: string
          prep_item_id?: string
          qty_on_hand?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_counted_by_user_id_fkey"
            columns: ["counted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_prep_item_id_fkey"
            columns: ["prep_item_id"]
            isOneToOne: false
            referencedRelation: "prep_items"
            referencedColumns: ["id"]
          },
        ]
      }
      store_order_lines: {
        Row: {
          created_at: string
          prep_item_id: string
          qty_on_hand_at_order: number | null
          qty_ordered: number
          store_order_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          prep_item_id: string
          qty_on_hand_at_order?: number | null
          qty_ordered: number
          store_order_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          prep_item_id?: string
          qty_on_hand_at_order?: number | null
          qty_ordered?: number
          store_order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_order_lines_prep_item_id_fkey"
            columns: ["prep_item_id"]
            isOneToOne: false
            referencedRelation: "prep_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_order_lines_store_order_id_fkey"
            columns: ["store_order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      store_order_overrides: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          for_date: string
          id: string
          notes: string | null
          override_qty: number | null
          prep_item_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          for_date: string
          id?: string
          notes?: string | null
          override_qty?: number | null
          prep_item_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          for_date?: string
          id?: string
          notes?: string | null
          override_qty?: number | null
          prep_item_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_orders: {
        Row: {
          created_at: string
          for_date: string
          id: string
          placed_at: string
          placed_by_user_id: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          for_date: string
          id?: string
          placed_at?: string
          placed_by_user_id?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          for_date?: string
          id?: string
          placed_at?: string
          placed_by_user_id?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      supplier_order_lines: {
        Row: {
          created_at: string
          ingredient_id: string
          qty: number
          qty_unit: string
          supplier_order_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ingredient_id: string
          qty: number
          qty_unit: string
          supplier_order_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ingredient_id?: string
          qty?: number
          qty_unit?: string
          supplier_order_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      supplier_orders: {
        Row: {
          created_at: string
          expected_delivery_date: string | null
          id: string
          notes_to_supplier: string | null
          order_date: string
          placed_at: string
          placed_by_user_id: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_delivery_date?: string | null
          id?: string
          notes_to_supplier?: string | null
          order_date: string
          placed_at?: string
          placed_by_user_id?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_delivery_date?: string | null
          id?: string
          notes_to_supplier?: string | null
          order_date?: string
          placed_at?: string
          placed_by_user_id?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          schedule_jsonb: Json | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          schedule_jsonb?: Json | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          schedule_jsonb?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      transfer_price_history: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          prep_item_id: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          prep_item_id: string
          price_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          prep_item_id?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          failed_attempts: number
          id: string
          is_admin: boolean
          last_login: string | null
          locked_until: string | null
          must_change_pin: boolean
          pin_hash: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          failed_attempts?: number
          id?: string
          is_admin?: boolean
          last_login?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          pin_hash: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          failed_attempts?: number
          id?: string
          is_admin?: boolean
          last_login?: string | null
          locked_until?: string | null
          must_change_pin?: boolean
          pin_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      waste_entries: {
        Row: {
          created_at: string
          id: string
          logged_by_user_id: string | null
          note: string | null
          prep_item_id: string
          qty: number
          reason_code: string
          updated_at: string
          waste_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          logged_by_user_id?: string | null
          note?: string | null
          prep_item_id: string
          qty: number
          reason_code: string
          updated_at?: string
          waste_date: string
        }
        Update: {
          created_at?: string
          id?: string
          logged_by_user_id?: string | null
          note?: string | null
          prep_item_id?: string
          qty?: number
          reason_code?: string
          updated_at?: string
          waste_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _unit_conv: {
        Args: { p_from: string; p_qty: number; p_to: string }
        Returns: number
      }
      auto_advance_week: { Args: never; Returns: undefined }
      combined_demand_by_weekday: {
        Args: { p_week_number: number }
        Returns: {
          demand_qty: number
          prep_item_id: string
          weekday: string
        }[]
      }
      compute_cogs: {
        Args: { p_as_of_date?: string; p_id: string; p_kind: string }
        Returns: number
      }
      daily_prep_plan: {
        Args: { p_date: string }
        Returns: {
          addon_avg: number
          calculated_haw: number
          calculated_sy: number
          calculated_total: number
          catering_qty: number
          effective_haw: number
          effective_sy: number
          effective_total: number
          override_haw: number
          override_sy: number
          override_total: number
          panini_avg: number
          prep_item_id: string
          unit: string
        }[]
      }
      get_ingredient_cost: {
        Args: {
          p_as_of_date?: string
          p_id: string
          p_kind: string
          p_path?: string[]
        }
        Returns: number
      }
      list_active_users: {
        Args: never
        Returns: {
          display_name: string
          id: string
          must_change_pin: boolean
        }[]
      }
      prep_gap: {
        Args: { p_date: string }
        Returns: {
          batches_to_make: number
          prep_gap: number
          prep_item_id: string
          rest_of_week_demand: number
          status: string
          stock_on_hand: number
          today_demand: number
          total_needed: number
        }[]
      }
      sales_averages_4wk: {
        Args: { p_store_id: string; p_week_number: number }
        Returns: {
          avg_qty: number
          menu_item_id: string
          weekday: string
        }[]
      }
      set_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: undefined
      }
      store_order_recommendation: {
        Args: { p_for_date: string; p_store_id: string }
        Returns: {
          calculated_qty: number
          effective_qty: number
          forecast: number
          on_hand: number
          override_qty: number
          prep_item_id: string
          with_buffer: number
        }[]
      }
      supplier_order_recommendation: {
        Args: { p_delivery_date: string; p_supplier_id: string }
        Returns: {
          calculation_note: string
          ingredient_id: string
          on_hand: number
          recommended_qty: number
          weekly_need: number
        }[]
      }
      transfer_price_as_of: {
        Args: { p_as_of_date: string; p_prep_item_id: string }
        Returns: number
      }
      verify_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: boolean
      }
      weekly_invoice: {
        Args: { p_store_id: string; p_week_end: string; p_week_start: string }
        Returns: {
          line_total_cents: number
          prep_item_id: string
          qty: number
          unit_price_cents: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
