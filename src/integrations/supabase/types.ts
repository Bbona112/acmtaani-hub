export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      asset_sessions: {
        Row: {
          asset_id: string
          created_at: string
          ended_at: string | null
          id: string
          issued_by: string | null
          notes: string | null
          started_at: string
          user_id: string | null
          user_name: string
          visitor_id: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          issued_by?: string | null
          notes?: string | null
          started_at?: string
          user_id?: string | null
          user_name?: string
          visitor_id?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          issued_by?: string | null
          notes?: string | null
          started_at?: string
          user_id?: string | null
          user_name?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_sessions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_sessions_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_tag: string | null
          asset_type: string
          battery_charging: boolean | null
          battery_percent: number | null
          battery_updated_at: string | null
          created_at: string
          id: string
          location: string | null
          name: string
          notes: string | null
          serial_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_tag?: string | null
          asset_type?: string
          battery_charging?: boolean | null
          battery_percent?: number | null
          battery_updated_at?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_tag?: string | null
          asset_type?: string
          battery_charging?: boolean | null
          battery_percent?: number | null
          battery_updated_at?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          hours_worked: number | null
          id: string
          user_id: string
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          hours_worked?: number | null
          id?: string
          user_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          hours_worked?: number | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      books: {
        Row: {
          authors: string | null
          book_id: string | null
          copies_available: number
          copies_total: number
          created_at: string
          id: string
          isbn: string | null
          publisher: string | null
          title: string
          updated_at: string
          year: number | null
        }
        Insert: {
          authors?: string | null
          book_id?: string | null
          copies_available?: number
          copies_total?: number
          created_at?: string
          id?: string
          isbn?: string | null
          publisher?: string | null
          title: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          authors?: string | null
          book_id?: string | null
          copies_available?: number
          copies_total?: number
          created_at?: string
          id?: string
          isbn?: string | null
          publisher?: string | null
          title?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string
          id: string
          location: string | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time: string
          id?: string
          location?: string | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string
          id?: string
          location?: string | null
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          channel: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          channel?: string
          content: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read: boolean
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      duty_roster: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          role_label: string
          shift_end: string
          shift_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          role_label?: string
          shift_end?: string
          shift_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          role_label?: string
          shift_end?: string
          shift_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          asset_id: string | null
          available_quantity: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          location: string | null
          name: string
          quantity: number
          requires_checkout: boolean
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          available_quantity?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name: string
          quantity?: number
          requires_checkout?: boolean
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          available_quantity?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          quantity?: number
          requires_checkout?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      inventory_checkouts: {
        Row: {
          checked_out_at: string
          created_at: string
          id: string
          inventory_item_id: string
          notes: string | null
          quantity: number
          returned_at: string | null
          user_id: string
        }
        Insert: {
          checked_out_at?: string
          created_at?: string
          id?: string
          inventory_item_id: string
          notes?: string | null
          quantity?: number
          returned_at?: string | null
          user_id: string
        }
        Update: {
          checked_out_at?: string
          created_at?: string
          id?: string
          inventory_item_id?: string
          notes?: string | null
          quantity?: number
          returned_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_checkouts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosk_settings: {
        Row: {
          exit_pin: string
          google_sheet_url: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          exit_pin?: string
          google_sheet_url?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          exit_pin?: string
          google_sheet_url?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          created_at: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          related_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          employee_id: string | null
          full_name: string
          id: string
          onboarding_completed: boolean
          phone: string | null
          position: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          onboarding_completed?: boolean
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          onboarding_completed?: boolean
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          progress: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          progress?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          progress?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitor_form_fields: {
        Row: {
          created_at: string
          display_order: number
          enabled: boolean
          field_key: string
          field_label: string
          field_type: string
          id: string
          required: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          enabled?: boolean
          field_key: string
          field_label: string
          field_type?: string
          id?: string
          required?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          enabled?: boolean
          field_key?: string
          field_label?: string
          field_type?: string
          id?: string
          required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      visitors: {
        Row: {
          badge_number: string | null
          check_in: string
          check_out: string | null
          checked_in_by: string | null
          company: string | null
          created_at: string
          extra_fields: Json | null
          host_employee_id: string | null
          host_name: string | null
          id: string
          notes: string | null
          phone: string | null
          purpose: string | null
          source: string
          visitor_name: string
        }
        Insert: {
          badge_number?: string | null
          check_in?: string
          check_out?: string | null
          checked_in_by?: string | null
          company?: string | null
          created_at?: string
          extra_fields?: Json | null
          host_employee_id?: string | null
          host_name?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          purpose?: string | null
          source?: string
          visitor_name: string
        }
        Update: {
          badge_number?: string | null
          check_in?: string
          check_out?: string | null
          checked_in_by?: string | null
          company?: string | null
          created_at?: string
          extra_fields?: Json | null
          host_employee_id?: string | null
          host_name?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          purpose?: string | null
          source?: string
          visitor_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      directory_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          department: string | null
          full_name: string | null
          id: string | null
          position: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          full_name?: string | null
          id?: string | null
          position?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          full_name?: string | null
          id?: string | null
          position?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "employee" | "volunteer"
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
    Enums: {
      app_role: ["admin", "employee", "volunteer"],
    },
  },
} as const
