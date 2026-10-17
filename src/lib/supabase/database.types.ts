/**
 * Hand-written type definitions for the Phase 1 Gifto schema.
 *
 * Phase 1 tables: profiles, vendors, vendor_members, vendor_status_history.
 * Regenerate from the live database once the Gifto project exists:
 *   supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 * (Keeps this file and the real schema in sync; the placeholders below are
 * intentionally minimal and only cover Phase 1.)
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      vendor_role: VendorRole;
      vendor_status: VendorStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
