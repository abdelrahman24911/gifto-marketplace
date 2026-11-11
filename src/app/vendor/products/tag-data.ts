import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type ServerClient = SupabaseClient<Database>;

export type ProductTagOption = {
  id: string;
  name: string;
  description: string | null;
};

export type ProductTagSuggestion = {
  id: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
};

export type ProductTaggingData = {
  tags: ProductTagOption[];
  selectedTagIds: string[];
  inactiveSelectionCount: number;
  suggestions: ProductTagSuggestion[];
};

export type ProductTaggingLoad =
  | { ok: true; data: ProductTaggingData }
  | { ok: false; error: string };

export async function loadProductTagging(
  supabase: ServerClient,
  productId: string,
  vendorId: string,
): Promise<ProductTaggingLoad> {
  const [tagResult, selectionResult, suggestionResult] = await Promise.all([
    supabase
      .from("tags")
      .select("id, name, description")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("product_tags")
      .select("tag_id")
      .eq("product_id", productId),
    supabase
      .from("tag_suggestions")
      .select("id, name, status, rejection_reason, created_at")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (tagResult.error || selectionResult.error || suggestionResult.error) {
    return {
      ok: false,
      error: "Could not load product tags. Please try again.",
    };
  }

  const tags = tagResult.data ?? [];
  const activeIds = new Set(tags.map((tag) => tag.id));
  const selected = (selectionResult.data ?? []).map((row) => row.tag_id);

  return {
    ok: true,
    data: {
      tags,
      selectedTagIds: selected.filter((id) => activeIds.has(id)),
      inactiveSelectionCount: selected.filter((id) => !activeIds.has(id))
        .length,
      suggestions: suggestionResult.data ?? [],
    },
  };
}
