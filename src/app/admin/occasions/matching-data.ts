import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type ServerClient = SupabaseClient<Database>;

export type MatchingRuleOption = {
  id: string;
  name: string;
};

export type MatchingRulesData = {
  categories: MatchingRuleOption[];
  tags: MatchingRuleOption[];
  selectedCategoryIds: string[];
  selectedTagIds: string[];
  unavailableCategories: MatchingRuleOption[];
  unavailableTags: MatchingRuleOption[];
};

export type MatchingRulesLoad =
  | { ok: true; data: MatchingRulesData }
  | { ok: false; error: string };

export type MatchingPreviewItem = {
  id: string;
  name: string;
  vendorName: string | null;
  isManual: boolean;
};

export type MatchingPreviewData = {
  total: number;
  items: MatchingPreviewItem[];
};

export type MatchingPreviewLoad =
  | { ok: true; data: MatchingPreviewData }
  | { ok: false; error: string };

const PREVIEW_LIMIT = 8;

export async function loadOccasionMatchingRules(
  supabase: ServerClient,
  occasionId: string,
): Promise<MatchingRulesLoad> {
  const [
    { data: categoryRows, error: categoryError },
    { data: tagRows, error: tagError },
    { data: categoryLinks, error: categoryLinkError },
    { data: tagLinks, error: tagLinkError },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, is_active")
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("tags").select("id, name, is_active").order("name"),
    supabase
      .from("occasion_categories")
      .select("category_id")
      .eq("occasion_id", occasionId),
    supabase
      .from("occasion_tags")
      .select("tag_id")
      .eq("occasion_id", occasionId),
  ]);

  if (categoryError || tagError || categoryLinkError || tagLinkError) {
    return {
      ok: false,
      error: "Could not load the matching rules. Please try again.",
    };
  }

  const categories = categoryRows ?? [];
  const tags = tagRows ?? [];
  const categoryById = new Map(categories.map((tag) => [tag.id, tag]));
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const selectedCategoryIds = (categoryLinks ?? []).map(
    (link) => link.category_id,
  );
  const selectedTagIds = (tagLinks ?? []).map((link) => link.tag_id);

  return {
    ok: true,
    data: {
      categories: categories
        .filter((category) => category.is_active)
        .map(({ id, name }) => ({ id, name })),
      tags: tags
        .filter((tag) => tag.is_active)
        .map(({ id, name }) => ({ id, name })),
      selectedCategoryIds,
      selectedTagIds,
      unavailableCategories: selectedCategoryIds.flatMap((id) => {
        const category = categoryById.get(id);
        return category && !category.is_active
          ? [{ id: category.id, name: category.name }]
          : [];
      }),
      unavailableTags: selectedTagIds.flatMap((id) => {
        const tag = tagById.get(id);
        return tag && !tag.is_active ? [{ id: tag.id, name: tag.name }] : [];
      }),
    },
  };
}

export async function loadOccasionMatchingPreview(
  supabase: ServerClient,
  occasionId: string,
): Promise<MatchingPreviewLoad> {
  const { data, error } = await supabase.rpc("get_occasion_products", {
    p_occasion_id: occasionId,
    p_limit: PREVIEW_LIMIT,
    p_offset: 0,
  });

  if (error) {
    return {
      ok: false,
      error: "Could not build the matching preview. Please try again.",
    };
  }

  const rows = data ?? [];
  const vendorIds = [...new Set(rows.map((row) => row.vendor_id))];
  let vendorNames = new Map<string, string>();

  if (vendorIds.length > 0) {
    const { data: vendors } = await supabase
      .from("vendors")
      .select("id, name")
      .in("id", vendorIds);
    vendorNames = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor.name]));
  }

  return {
    ok: true,
    data: {
      total: rows[0]?.total_count ?? 0,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        vendorName: vendorNames.get(row.vendor_id) ?? null,
        isManual: row.is_manual,
      })),
    },
  };
}
