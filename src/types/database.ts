// Auto-generated via `npm run gen:types` (supabase gen types typescript).
// Regenerate after any DB schema change.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      users: {
        Row: {
          active: boolean;
          created_at: string;
          display_name: string;
          failed_attempts: number;
          id: string;
          last_login: string | null;
          locked_until: string | null;
          must_change_pin: boolean;
          pin_hash: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          display_name: string;
          failed_attempts?: number;
          id?: string;
          last_login?: string | null;
          locked_until?: string | null;
          must_change_pin?: boolean;
          pin_hash: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          display_name?: string;
          failed_attempts?: number;
          id?: string;
          last_login?: string | null;
          locked_until?: string | null;
          must_change_pin?: boolean;
          pin_hash?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      set_pin: {
        Args: { p_pin: string; p_user_id: string };
        Returns: undefined;
      };
      verify_pin: {
        Args: { p_pin: string; p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type PublicUser = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "display_name" | "must_change_pin"
>;
