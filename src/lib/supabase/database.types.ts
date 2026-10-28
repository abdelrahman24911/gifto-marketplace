/**
 * Hand-written type definitions for the Gifto schema.
 *
 * Phase 1 tables: profiles, vendors, vendor_members, vendor_status_history.
 * Phase 2 RPC: apply_as_vendor (vendor self-onboarding); view: public_vendors.
 * Phase 3 tables: categories, products, product_images; helper: is_public_vendor.
 * Phase 4 tables: orders, order_vendors, order_items, inventory_movements;
 *                 RPCs: place_order, cancel_order.
 * Phase 6 tables: commission_entries, settlements, settlement_lines;
 *                 RPCs: create_settlement, mark_settlement_paid.
 *
 * Regenerate from the live database once the Gifto project exists:
 *   supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 * (Keeps this file and the real schema in sync; the placeholders below are
 * intentionally minimal and only cover Phases 1–6.)
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type VendorRole = "owner" | "manager" | "staff";
export type VendorStatus = "pending" | "active" | "suspended" | "rejected";
export type ProductStatus = "draft" | "active" | "archived";
export type OrderStatus =
  | "placed"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "partially_completed";
export type CommissionStatus = "earned" | "reversed";
export type SettlementStatus = "open" | "paid";

/** The Storage bucket reserved for catalog media (upload arrives later). */
export const PRODUCT_IMAGES_BUCKET = "product-images";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          is_platform_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          is_platform_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          is_platform_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vendors: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          logo_path: string | null;
          status: VendorStatus;
          city: string | null;
          governorate: string | null;
          delivery_coverage: Json;
          commission_rate: number;
          contact_phone: string | null;
          contact_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          logo_path?: string | null;
          status?: VendorStatus;
          city?: string | null;
          governorate?: string | null;
          delivery_coverage?: Json;
          commission_rate?: number;
          contact_phone?: string | null;
          contact_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          logo_path?: string | null;
          status?: VendorStatus;
          city?: string | null;
          governorate?: string | null;
          delivery_coverage?: Json;
          commission_rate?: number;
          contact_phone?: string | null;
          contact_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vendor_members: {
        Row: {
          id: string;
          vendor_id: string;
          profile_id: string;
          role: VendorRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          profile_id: string;
          role?: VendorRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          profile_id?: string;
          role?: VendorRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_members_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
            isOneToOne: false;
          },
          {
            foreignKeyName: "vendor_members_profile_id_fkey";
            columns: ["profile_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
            isOneToOne: false;
          },
        ];
      };
      vendor_status_history: {
        Row: {
          id: string;
          vendor_id: string;
          from_status: VendorStatus | null;
          to_status: VendorStatus;
          changed_by: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          from_status?: VendorStatus | null;
          to_status: VendorStatus;
          changed_by?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          from_status?: VendorStatus | null;
          to_status?: VendorStatus;
          changed_by?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_status_history_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
            isOneToOne: false;
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          position: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          position?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          position?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          vendor_id: string;
          category_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          price_minor: number;
          currency: string;
          stock: number;
          status: ProductStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          category_id?: string | null;
          name: string;
          slug?: string;
          description?: string | null;
          price_minor: number;
          currency?: string;
          stock?: number;
          status?: ProductStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          category_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          price_minor?: number;
          currency?: string;
          stock?: number;
          status?: ProductStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
            isOneToOne: false;
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "categories";
            referencedColumns: ["id"];
            isOneToOne: false;
          },
        ];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          path: string;
          alt: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          path: string;
          alt?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          path?: string;
          alt?: string | null;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
            isOneToOne: false;
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          user_id: string | null;
          status: OrderStatus;
          payment_method: string;
          currency: string;
          subtotal_minor: number;
          delivery_fee_minor: number;
          total_minor: number;
          recipient_name: string;
          contact_phone: string;
          contact_email: string | null;
          address_line: string;
          city: string;
          governorate: string;
          notes: string | null;
          guest_token_hash: string | null;
          idempotency_key: string | null;
          public_reference: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          status?: OrderStatus;
          payment_method?: string;
          currency?: string;
          subtotal_minor: number;
          delivery_fee_minor?: number;
          total_minor: number;
          recipient_name: string;
          contact_phone: string;
          contact_email?: string | null;
          address_line: string;
          city: string;
          governorate: string;
          notes?: string | null;
          guest_token_hash?: string | null;
          idempotency_key?: string | null;
          public_reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          status?: OrderStatus;
          payment_method?: string;
          currency?: string;
          subtotal_minor?: number;
          delivery_fee_minor?: number;
          total_minor?: number;
          recipient_name?: string;
          contact_phone?: string;
          contact_email?: string | null;
          address_line?: string;
          city?: string;
          governorate?: string;
          notes?: string | null;
          guest_token_hash?: string | null;
          idempotency_key?: string | null;
          public_reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      order_vendors: {
        Row: {
          id: string;
          order_id: string;
          vendor_id: string;
          status: OrderStatus;
          currency: string;
          subtotal_minor: number;
          delivery_fee_minor: number;
          commission_rate: number;
          confirmed_at: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          vendor_id: string;
          status?: OrderStatus;
          currency?: string;
          subtotal_minor: number;
          delivery_fee_minor?: number;
          commission_rate: number;
          confirmed_at?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          vendor_id?: string;
          status?: OrderStatus;
          currency?: string;
          subtotal_minor?: number;
          delivery_fee_minor?: number;
          commission_rate?: number;
          confirmed_at?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_vendors_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_vendors_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_vendor_id: string;
          product_id: string | null;
          product_name: string;
          product_slug: string;
          unit_price_minor: number;
          quantity: number;
          line_total_minor: number;
          currency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_vendor_id: string;
          product_id?: string | null;
          product_name: string;
          product_slug: string;
          unit_price_minor: number;
          quantity: number;
          line_total_minor: number;
          currency?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_vendor_id?: string;
          product_id?: string | null;
          product_name?: string;
          product_slug?: string;
          unit_price_minor?: number;
          quantity?: number;
          line_total_minor?: number;
          currency?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_vendor_id_fkey";
            columns: ["order_vendor_id"];
            isOneToOne: false;
            referencedRelation: "order_vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          id: string;
          product_id: string;
          delta: number;
          reason: "order_placed" | "order_cancelled" | "manual_adjustment";
          note: string | null;
          order_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          delta: number;
          reason: "order_placed" | "order_cancelled" | "manual_adjustment";
          note?: string | null;
          order_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          delta?: number;
          reason?: "order_placed" | "order_cancelled" | "manual_adjustment";
          note?: string | null;
          order_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      commission_entries: {
        Row: {
          id: string;
          order_vendor_id: string;
          vendor_id: string;
          status: CommissionStatus;
          currency: string;
          rate: number;
          base_minor: number;
          amount_minor: number;
          earned_at: string;
          reversed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_vendor_id: string;
          vendor_id: string;
          status?: CommissionStatus;
          currency?: string;
          rate: number;
          base_minor: number;
          amount_minor: number;
          earned_at?: string;
          reversed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_vendor_id?: string;
          vendor_id?: string;
          status?: CommissionStatus;
          currency?: string;
          rate?: number;
          base_minor?: number;
          amount_minor?: number;
          earned_at?: string;
          reversed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commission_entries_order_vendor_id_fkey";
            columns: ["order_vendor_id"];
            isOneToOne: true;
            referencedRelation: "order_vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_entries_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          id: string;
          vendor_id: string;
          status: SettlementStatus;
          currency: string;
          total_minor: number;
          note: string | null;
          created_at: string;
          updated_at: string;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          status?: SettlementStatus;
          currency?: string;
          total_minor?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          paid_at?: string | null;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          status?: SettlementStatus;
          currency?: string;
          total_minor?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
          paid_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      settlement_lines: {
        Row: {
          id: string;
          settlement_id: string;
          commission_entry_id: string;
          amount_minor: number;
          currency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          settlement_id: string;
          commission_entry_id: string;
          amount_minor: number;
          currency?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          settlement_id?: string;
          commission_entry_id?: string;
          amount_minor?: number;
          currency?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settlement_lines_settlement_id_fkey";
            columns: ["settlement_id"];
            isOneToOne: false;
            referencedRelation: "settlements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlement_lines_commission_entry_id_fkey";
            columns: ["commission_entry_id"];
            isOneToOne: true;
            referencedRelation: "commission_entries";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      public_vendors: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          logo_path: string | null;
          city: string | null;
          governorate: string | null;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      apply_as_vendor: {
        Args: {
          p_name: string;
          p_description?: string | null;
          p_city?: string | null;
          p_governorate?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
        };
        Returns: string;
      };
      is_public_vendor: {
        Args: { p_vendor_id: string };
        Returns: boolean;
      };
      place_order: {
        Args: {
          p_items: Json;
          p_recipient_name: string;
          p_contact_phone: string;
          p_address_line: string;
          p_city: string;
          p_governorate: string;
          p_notes?: string | null;
        };
        Returns: string;
      };
      place_order_with_idempotency: {
        Args: {
          p_items: Json;
          p_recipient_name: string;
          p_contact_phone: string;
          p_contact_email: string | null;
          p_address_line: string;
          p_city: string;
          p_governorate: string;
          p_notes: string | null;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      place_guest_order: {
        Args: {
          p_items: Json;
          p_recipient_name: string;
          p_contact_phone: string;
          p_contact_email: string | null;
          p_address_line: string;
          p_city: string;
          p_governorate: string;
          p_notes: string | null;
          p_idempotency_key: string;
          p_guest_token_hash: string;
        };
        Returns: string;
      };
      get_guest_order: {
        Args: { p_order_id: string; p_token_hash: string };
        Returns: Json | null;
      };
      consume_checkout_quota: {
        Args: {
          p_bucket: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: number;
      };
      cancel_order: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      create_settlement: {
        Args: { p_vendor_id: string; p_note?: string | null };
        Returns: string;
      };
      mark_settlement_paid: {
        Args: { p_settlement_id: string };
        Returns: undefined;
      };
      adjust_product_stock: {
        Args: { p_product_id: string; p_delta: number; p_note?: string | null };
        Returns: number;
      };
    };
    Enums: {
      vendor_role: VendorRole;
      vendor_status: VendorStatus;
      product_status: ProductStatus;
      order_status: OrderStatus;
      commission_status: CommissionStatus;
      settlement_status: SettlementStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
