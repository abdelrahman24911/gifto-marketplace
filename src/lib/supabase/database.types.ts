/**
 * Hand-written type definitions for the Gifto schema.
 *
 * Phase 1 tables: profiles, vendors, vendor_members, vendor_status_history.
 * Phase 2 view: public_vendors.
 * Phase 3 tables: categories, products, product_images; helper: is_public_vendor.
 * Phase 4 tables: orders, order_vendors, order_items, inventory_movements;
 *                 RPCs: place_order, cancel_order.
 * Phase 6 tables: commission_entries, settlements, settlement_lines;
 *                 RPCs: create_settlement, mark_settlement_paid.
 * Phase 14: managed vendor onboarding; self-onboarding RPC removed.
 * Phase 15: active-only policies, stock-column grants, create_vendor_for_owner.
 * Phase 16: settlement audit actors, voiding and one-open-per-vendor uniqueness.
 * Phase 17/18: explicit void state, preserved/released settlement lines.
 * Phase 20: vendor profile privacy, working hours, public vendor projection.
 * Phase 21: dedicated vendor-media bucket policies.
 * Phase 22: vendor order pause enforced in checkout.
 * Phase 23: vendor support requests and admin queue.
 * Phase 24: analytics vendor/date index.
 * Phase 26: occasions, tags, matching joins, slug redirects and suggestions.
 * Phase 28: order status audit events and vendor status transition RPC.
 * Phase 29: delivery coverage helper and order_vendors trigger.
 * Phase 30: refund cases, commission adjustments, refund RPCs.
 *
 * Regenerate from the live database once the Gifto project exists:
 *   supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 * (Keeps this file and the real schema in sync; the placeholders below cover
 * Phases 1–24.)
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
export type SettlementStatus = "open" | "paid" | "voided";
export type SupportRequestStatus = "open" | "in_progress" | "resolved";
export type OccasionMatchMode = "manual" | "automatic" | "hybrid";
export type TagSuggestionStatus = "pending" | "approved" | "rejected";
export type OrderStatusActorRole = "customer" | "vendor" | "admin" | "system";
export type RefundCaseStatus = "open" | "approved" | "rejected" | "cancelled";
export type RefundCaseSource = "customer" | "guest" | "admin";

/** The Storage bucket reserved for catalog media (upload arrives later). */
export const PRODUCT_IMAGES_BUCKET = "product-images";

/** Public-read bucket for vendor logos and cover images. */
export const VENDOR_MEDIA_BUCKET = "vendor-media";

/** Public-read bucket for occasion hero images. */
export const OCCASION_IMAGES_BUCKET = "occasion-images";

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
          cover_path: string | null;
          address_line: string | null;
          working_hours: Json;
          prep_time_min_days: number | null;
          prep_time_max_days: number | null;
          is_accepting_orders: boolean;
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
          cover_path?: string | null;
          address_line?: string | null;
          working_hours?: Json;
          prep_time_min_days?: number | null;
          prep_time_max_days?: number | null;
          is_accepting_orders?: boolean;
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
          cover_path?: string | null;
          address_line?: string | null;
          working_hours?: Json;
          prep_time_min_days?: number | null;
          prep_time_max_days?: number | null;
          is_accepting_orders?: boolean;
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
      support_requests: {
        Row: {
          id: string;
          vendor_id: string;
          created_by: string | null;
          category: string;
          subject: string;
          body: string;
          status: SupportRequestStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          created_by?: string | null;
          category: string;
          subject: string;
          body: string;
          status?: SupportRequestStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          created_by?: string | null;
          category?: string;
          subject?: string;
          body?: string;
          status?: SupportRequestStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_requests_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
            isOneToOne: false;
          },
          {
            foreignKeyName: "support_requests_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
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
      order_status_events: {
        Row: {
          id: number;
          order_id: string;
          order_vendor_id: string;
          vendor_id: string;
          from_status: OrderStatus;
          to_status: OrderStatus;
          actor_id: string | null;
          actor_role: OrderStatusActorRole;
          reason_code: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          order_id: string;
          order_vendor_id: string;
          vendor_id: string;
          from_status: OrderStatus;
          to_status: OrderStatus;
          actor_id?: string | null;
          actor_role: OrderStatusActorRole;
          reason_code?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          order_id?: string;
          order_vendor_id?: string;
          vendor_id?: string;
          from_status?: OrderStatus;
          to_status?: OrderStatus;
          actor_id?: string | null;
          actor_role?: OrderStatusActorRole;
          reason_code?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_status_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_status_events_order_vendor_id_fkey";
            columns: ["order_vendor_id"];
            isOneToOne: false;
            referencedRelation: "order_vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_status_events_vendor_id_fkey";
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
      commission_adjustments: {
        Row: {
          id: string;
          commission_entry_id: string;
          refund_case_id: string;
          vendor_id: string;
          currency: string;
          amount_minor: number;
          reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          commission_entry_id: string;
          refund_case_id: string;
          vendor_id: string;
          currency?: string;
          amount_minor: number;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          commission_entry_id?: string;
          refund_case_id?: string;
          vendor_id?: string;
          currency?: string;
          amount_minor?: number;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commission_adjustments_commission_entry_id_fkey";
            columns: ["commission_entry_id"];
            isOneToOne: false;
            referencedRelation: "commission_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_adjustments_refund_case_id_fkey";
            columns: ["refund_case_id"];
            isOneToOne: true;
            referencedRelation: "refund_cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_adjustments_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_adjustments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      refund_cases: {
        Row: {
          id: string;
          order_id: string;
          order_vendor_id: string;
          vendor_id: string;
          source: RefundCaseSource;
          opened_by: string | null;
          reason: string;
          requested_amount_minor: number | null;
          status: RefundCaseStatus;
          resolution_note: string | null;
          refund_amount_minor: number | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          order_vendor_id: string;
          vendor_id: string;
          source: RefundCaseSource;
          opened_by?: string | null;
          reason: string;
          requested_amount_minor?: number | null;
          status?: RefundCaseStatus;
          resolution_note?: string | null;
          refund_amount_minor?: number | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          order_vendor_id?: string;
          vendor_id?: string;
          source?: RefundCaseSource;
          opened_by?: string | null;
          reason?: string;
          requested_amount_minor?: number | null;
          status?: RefundCaseStatus;
          resolution_note?: string | null;
          refund_amount_minor?: number | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refund_cases_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_cases_order_vendor_id_fkey";
            columns: ["order_vendor_id"];
            isOneToOne: false;
            referencedRelation: "order_vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_cases_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_cases_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_cases_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
          created_by: string | null;
          paid_by: string | null;
          voided_by: string | null;
          voided_at: string | null;
          void_reason: string | null;
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
          created_by?: string | null;
          paid_by?: string | null;
          voided_by?: string | null;
          voided_at?: string | null;
          void_reason?: string | null;
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
          created_by?: string | null;
          paid_by?: string | null;
          voided_by?: string | null;
          voided_at?: string | null;
          void_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_paid_by_fkey";
            columns: ["paid_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
          released_at: string | null;
          released_by: string | null;
          release_reason: string | null;
        };
        Insert: {
          id?: string;
          settlement_id: string;
          commission_entry_id: string;
          amount_minor: number;
          currency?: string;
          created_at?: string;
          released_at?: string | null;
          released_by?: string | null;
          release_reason?: string | null;
        };
        Update: {
          id?: string;
          settlement_id?: string;
          commission_entry_id?: string;
          amount_minor?: number;
          currency?: string;
          created_at?: string;
          released_at?: string | null;
          released_by?: string | null;
          release_reason?: string | null;
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
            isOneToOne: false;
            referencedRelation: "commission_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlement_lines_released_by_fkey";
            columns: ["released_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      occasions: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          image_path: string | null;
          image_alt: string | null;
          is_active: boolean;
          sort_order: number;
          match_mode: OccasionMatchMode;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          image_path?: string | null;
          image_alt?: string | null;
          is_active?: boolean;
          sort_order?: number;
          match_mode?: OccasionMatchMode;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          image_path?: string | null;
          image_alt?: string | null;
          is_active?: boolean;
          sort_order?: number;
          match_mode?: OccasionMatchMode;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      occasion_slug_redirects: {
        Row: {
          id: string;
          old_slug: string;
          occasion_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          old_slug: string;
          occasion_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          old_slug?: string;
          occasion_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "occasion_slug_redirects_occasion_id_fkey";
            columns: ["occasion_id"];
            isOneToOne: false;
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tags_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      occasion_tags: {
        Row: {
          occasion_id: string;
          tag_id: string;
          created_at: string;
        };
        Insert: {
          occasion_id: string;
          tag_id: string;
          created_at?: string;
        };
        Update: {
          occasion_id?: string;
          tag_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "occasion_tags_occasion_id_fkey";
            columns: ["occasion_id"];
            isOneToOne: false;
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "occasion_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      occasion_categories: {
        Row: {
          occasion_id: string;
          category_id: string;
          created_at: string;
        };
        Insert: {
          occasion_id: string;
          category_id: string;
          created_at?: string;
        };
        Update: {
          occasion_id?: string;
          category_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "occasion_categories_occasion_id_fkey";
            columns: ["occasion_id"];
            isOneToOne: false;
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "occasion_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      occasion_products: {
        Row: {
          occasion_id: string;
          product_id: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          occasion_id: string;
          product_id: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          occasion_id?: string;
          product_id?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "occasion_products_occasion_id_fkey";
            columns: ["occasion_id"];
            isOneToOne: false;
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "occasion_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_tags: {
        Row: {
          product_id: string;
          tag_id: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          product_id: string;
          tag_id: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          product_id?: string;
          tag_id?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_tags_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tag_suggestions: {
        Row: {
          id: string;
          name: string;
          normalized_slug: string;
          description: string | null;
          suggested_by: string | null;
          vendor_id: string;
          status: TagSuggestionStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          normalized_slug?: string;
          description?: string | null;
          suggested_by?: string | null;
          vendor_id: string;
          status?: TagSuggestionStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          normalized_slug?: string;
          description?: string | null;
          suggested_by?: string | null;
          vendor_id?: string;
          status?: TagSuggestionStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tag_suggestions_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tag_suggestions_suggested_by_fkey";
            columns: ["suggested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tag_suggestions_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
          cover_path: string | null;
          working_hours: Json;
          prep_time_min_days: number | null;
          prep_time_max_days: number | null;
          is_accepting_orders: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      vendor_working_hours_valid: {
        Args: { p_hours: Json };
        Returns: boolean;
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
      get_guest_refund_cases: {
        Args: { p_order_id: string; p_token_hash: string };
        Returns: {
          id: string;
          order_vendor_id: string;
          status: RefundCaseStatus;
          reason: string;
          requested_amount_minor: number | null;
          refund_amount_minor: number | null;
          resolution_note: string | null;
          created_at: string;
          resolved_at: string | null;
        }[];
      };
      open_refund_case: {
        Args: {
          p_order_vendor_id: string;
          p_reason: string;
          p_requested_amount_minor?: number | null;
        };
        Returns: string;
      };
      open_guest_refund_case: {
        Args: {
          p_order_id: string;
          p_token_hash: string;
          p_order_vendor_id: string;
          p_reason: string;
          p_requested_amount_minor?: number | null;
        };
        Returns: string;
      };
      resolve_refund_case: {
        Args: {
          p_case_id: string;
          p_approved: boolean;
          p_refund_amount_minor?: number | null;
          p_note?: string | null;
        };
        Returns: undefined;
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
      set_order_vendor_status: {
        Args: {
          p_order_vendor_id: string;
          p_next_status: OrderStatus;
          p_expected_status: OrderStatus;
          p_reason_code?: string | null;
          p_note?: string | null;
        };
        Returns: {
          order_id: string;
          vendor_id: string;
          previous_status: OrderStatus;
          status: OrderStatus;
        }[];
      };
      create_settlement: {
        Args: { p_vendor_id: string; p_note?: string | null };
        Returns: string;
      };
      create_vendor_for_owner: {
        Args: {
          p_name: string;
          p_description: string | null;
          p_city: string | null;
          p_governorate: string | null;
          p_contact_phone: string | null;
          p_contact_email: string;
          p_commission_rate: number;
          p_profile_id: string;
        };
        Returns: string;
      };
      mark_settlement_paid: {
        Args: { p_settlement_id: string };
        Returns: undefined;
      };
      void_settlement: {
        Args: { p_settlement_id: string; p_reason: string };
        Returns: undefined;
      };
      adjust_product_stock: {
        Args: { p_product_id: string; p_delta: number; p_note?: string | null };
        Returns: number;
      };
      get_occasion_products: {
        Args: {
          p_occasion_id: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
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
          is_manual: boolean;
          total_count: number;
        }[];
      };
      replace_occasion_products: {
        Args: { p_occasion_id: string; p_product_ids: string[] };
        Returns: undefined;
      };
      replace_occasion_categories: {
        Args: { p_occasion_id: string; p_category_ids: string[] };
        Returns: undefined;
      };
      replace_occasion_tags: {
        Args: { p_occasion_id: string; p_tag_ids: string[] };
        Returns: undefined;
      };
      replace_occasion_matching_rules: {
        Args: {
          p_occasion_id: string;
          p_category_ids: string[];
          p_tag_ids: string[];
        };
        Returns: undefined;
      };
      reorder_occasions: {
        Args: { p_occasion_ids: string[] };
        Returns: undefined;
      };
      replace_product_tags: {
        Args: { p_product_id: string; p_tag_ids: string[] };
        Returns: undefined;
      };
      review_tag_suggestion: {
        Args: {
          p_suggestion_id: string;
          p_approve: boolean;
          p_rejection_reason?: string | null;
        };
        Returns: string | null;
      };
    };
    Enums: {
      vendor_role: VendorRole;
      vendor_status: VendorStatus;
      product_status: ProductStatus;
      order_status: OrderStatus;
      commission_status: CommissionStatus;
      settlement_status: SettlementStatus;
      occasion_match_mode: OccasionMatchMode;
      tag_suggestion_status: TagSuggestionStatus;
      refund_case_status: RefundCaseStatus;
      refund_case_source: RefundCaseSource;
    };
    CompositeTypes: Record<string, never>;
  };
};
