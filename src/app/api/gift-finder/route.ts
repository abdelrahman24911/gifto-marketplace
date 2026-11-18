import { NextResponse } from "next/server";

import { loadGiftFinderPage } from "@/lib/catalog";
import { parseGiftFinderSearchParams } from "@/lib/gift-finder";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = parseGiftFinderSearchParams(
    new URL(request.url).searchParams,
  );

  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Invalid Gift Finder query." },
      { status: 400 },
    );
  }

  const result = await loadGiftFinderPage(parsed.query);

  if (!result.ok) {
    return NextResponse.json(
      { error: "Gift Finder is temporarily unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return NextResponse.json(result.data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
