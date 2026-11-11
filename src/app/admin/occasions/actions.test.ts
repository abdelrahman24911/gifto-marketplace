import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authRejected: false,
  supabase: null as unknown,
}));

vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (state.authRejected) throw new Error("REDIRECT:/login");
    return { supabase: state.supabase };
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

import {
  deleteOccasion,
  moveOccasion,
  removeOccasionImage,
  saveOccasion,
  setOccasionVisibility,
} from "./actions";

type FakeRow = Record<string, unknown>;
type FakeError = { code?: string; message: string };
type QueryResult = { data: unknown; error: FakeError | null };

interface QueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): QueryBuilder;
  insert(payload: FakeRow): QueryBuilder;
  update(payload: FakeRow): QueryBuilder;
  delete(): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
  range(from: number, to: number): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
}

const ROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THIRD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function imageFile(name = "occasion.png", type = "image/png") {
  return new File([PNG_BYTES], name, { type });
}

function occasion(overrides: FakeRow = {}): FakeRow {
  return {
    id: ROW_ID,
    name: "Ramadan evenings",
    slug: "ramadan-evenings",
    description: null,
    image_path: null,
    image_alt: null,
    is_active: true,
    sort_order: 0,
    match_mode: "hybrid",
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeClient(seed: FakeRow[] = []) {
  const occasions: FakeRow[] = seed.map((row) => ({ ...row }));
  const redirects = new Map<string, string>();
  const errors = new Map<string, FakeError>();
  const uploads: Array<{
    path: string;
    file: File;
    options?: { contentType?: string; upsert?: boolean };
  }> = [];
  const removals: string[][] = [];
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const calls: string[] = [];
  const operations: string[] = [];
  let slugOverride: string | null = null;
  let updatedSlugOverride: string | null = null;
  let idCounter = 0;

  function generatedId() {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
  }

  function rowsFor(table: string): FakeRow[] {
    if (table === "occasions") return occasions;
    if (table === "occasion_slug_redirects") {
      return Array.from(
        redirects,
        ([old_slug, occasion_id]) => ({ old_slug, occasion_id }),
      );
    }
    return [];
  }

  function project(row: FakeRow, columns: string | null): FakeRow {
    if (!columns || columns === "*") return { ...row };
    const result: FakeRow = {};
    for (const key of columns.split(",").map((value) => value.trim())) {
      if (key) result[key] = row[key];
    }
    return result;
  }

  function compare(
    a: FakeRow,
    b: FakeRow,
    orders: Array<{ column: string; ascending: boolean }>,
  ) {
    for (const { column, ascending } of orders) {
      const left = a[column];
      const right = b[column];
      if (left === right) continue;
      const direction = left == null ? 1 : right == null ? -1 : left < right ? -1 : 1;
      return ascending ? direction : -direction;
    }
    return 0;
  }

  function from(table: string) {
    calls.push(table);
    let operation: "select" | "insert" | "update" | "delete" = "select";
    let payload: FakeRow = {};
    let filters: Array<{
      column: string;
      value: unknown;
      kind: "eq" | "neq";
    }> = [];
    let orders: Array<{ column: string; ascending: boolean }> = [];
    let limit: number | null = null;
    let range: [number, number] | null = null;
    let columns: string | null = null;

    function matches(row: FakeRow) {
      return filters.every(({ column, value, kind }) => {
        if (kind === "neq") return row[column] !== value;
        if (Array.isArray(value)) return value.includes(row[column]);
        return row[column] === value;
      });
    }

    function readRows() {
      const readError = errors.get("read");
      if (readError) return { data: null, error: readError };
      const matched = rowsFor(table).filter(matches).sort((a, b) => compare(a, b, orders));
      const limited = limit == null ? matched : matched.slice(0, limit);
      const sliced = range
        ? limited.slice(range[0], range[1] + 1)
        : limited;
      return {
        data: sliced.map((row) => project(row, columns)),
        error: null,
      };
    }

    function insertSingle() {
      operations.push("insert:occasions");
      const insertError = errors.get("insert");
      if (insertError) return { data: null, error: insertError };

      const id = generatedId();
      const row: FakeRow = {
        ...payload,
        id,
        slug: slugOverride ?? payload.slug,
        image_path: payload.image_path ?? null,
        description: payload.description ?? null,
        image_alt: payload.image_alt ?? null,
        is_active: payload.is_active ?? false,
        sort_order: payload.sort_order ?? 0,
        match_mode: payload.match_mode ?? "hybrid",
        created_at: "2026-11-01T10:00:00.000Z",
        updated_at: "2026-11-01T10:00:00.000Z",
      };
      occasions.push(row);
      return { data: project(row, columns), error: null };
    }

    function applyUpdate() {
      operations.push("update:occasions");
      const updateError = errors.get("update");
      if (updateError) return { data: null, error: updateError };
      const matched = occasions.filter(matches);
      const patch: FakeRow = { ...payload };
      if (updatedSlugOverride && "slug" in payload) {
        patch.slug = updatedSlugOverride;
      }
      for (const row of matched) {
        Object.assign(row, patch, {
          updated_at: "2026-11-01T11:00:00.000Z",
        });
      }
      return { data: matched[0] ?? null, error: null };
    }

    function applyDelete() {
      operations.push("delete:occasions");
      const deleteError = errors.get("delete");
      if (deleteError) return { data: null, error: deleteError };
      for (let index = occasions.length - 1; index >= 0; index -= 1) {
        if (matches(occasions[index])) occasions.splice(index, 1);
      }
      return { data: null, error: null };
    }

    function execute(): QueryResult {
      if (operation === "insert") return insertSingle();
      if (operation === "update") return applyUpdate();
      if (operation === "delete") return applyDelete();
      return readRows();
    }

    const builder: QueryBuilder = {
      select(nextColumns) {
        columns = nextColumns ?? "*";
        return builder;
      },
      insert(nextPayload) {
        operation = "insert";
        payload = nextPayload;
        return builder;
      },
      update(nextPayload) {
        operation = "update";
        payload = nextPayload;
        return builder;
      },
      delete() {
        operation = "delete";
        return builder;
      },
      eq(column, value) {
        filters = [...filters, { column, value, kind: "eq" }];
        return builder;
      },
      neq(column, value) {
        filters = [...filters, { column, value, kind: "neq" }];
        return builder;
      },
      order(column, options) {
        orders = [...orders, { column, ascending: options?.ascending ?? true }];
        return builder;
      },
      limit(count) {
        limit = count;
        return builder;
      },
      range(fromIndex, toIndex) {
        range = [fromIndex, toIndex];
        return builder;
      },
      async maybeSingle() {
        if (operation === "insert") return insertSingle();
        if (operation === "update") {
          const result = applyUpdate();
          return result.error
            ? result
            : {
                data: result.data ? project(result.data, columns) : null,
                error: null,
              };
        }
        const result = readRows();
        if (result.error) return result;
        const rows = result.data as FakeRow[];
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        if (operation === "insert") return insertSingle();
        return { data: null, error: { message: "single() is not expected" } };
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve(execute()).then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  return {
    occasions,
    redirects,
    errors,
    uploads,
    removals,
    rpcCalls,
    calls,
    operations,
    setInsertedSlug(value: string | null) {
      slugOverride = value;
    },
    setUpdatedSlug(value: string | null) {
      updatedSlugOverride = value;
    },
    from,
    storage: {
      from() {
        return {
          async upload(
            path: string,
            file: File,
            options?: { contentType?: string; upsert?: boolean },
          ) {
            operations.push(`upload:${path}`);
            uploads.push({ path, file, options });
            return { error: errors.get("upload") ?? null };
          },
          async remove(paths: string[]) {
            operations.push(`remove:${paths.join(",")}`);
            removals.push(paths);
            return { error: errors.get("remove") ?? null };
          },
        };
      },
    },
    async rpc(name: string, args: unknown) {
      operations.push(`rpc:${name}`);
      rpcCalls.push({ name, args });
      return { error: errors.get("rpc") ?? null };
    },
  };
}

function form(values: Record<string, string | File>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

const baseFields = {
  name: "Eid al-Fitr",
  slug: "eid-al-fitr",
  description: "Gifts for the morning of Eid.",
  image_alt: "A wrapped gift on a table",
  match_mode: "hybrid",
};

beforeEach(() => {
  state.authRejected = false;
  state.supabase = makeClient();
});

describe("saveOccasion authorization and validation", () => {
  it("rejects unauthorized callers before touching the database", async () => {
    state.authRejected = true;
    const client = state.supabase as ReturnType<typeof makeClient>;

    await expect(saveOccasion(null, form(baseFields))).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(client.calls).toEqual([]);
  });

  it("returns field errors without inserting an invalid occasion", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;

    const result = await saveOccasion(
      null,
      form({ ...baseFields, name: "a", match_mode: "wrong" }),
    );

    expect(result).toMatchObject({
      error: "Check the highlighted fields and try again.",
      fieldErrors: {
        name: expect.any(String),
        match_mode: expect.any(String),
      },
    });
    expect(client.occasions).toEqual([]);
  });

  it("rejects a spoofed image before creating a draft", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;

    const result = await saveOccasion(
      null,
      form({
        ...baseFields,
        image: new File([new Uint8Array([1, 2, 3, 4])], "fake.png", {
          type: "image/png",
        }),
      }),
    );

    expect(result).toMatchObject({
      fieldErrors: { image: expect.stringContaining("does not look like") },
    });
    expect(client.occasions).toEqual([]);
    expect(client.uploads).toEqual([]);
  });

  it("refuses a slug already claimed by a redirect", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.redirects.set("eid-al-fitr", OTHER_ID);

    const result = await saveOccasion(null, form(baseFields));

    expect(result).toMatchObject({
      fieldErrors: { slug: expect.stringContaining("used before") },
    });
    expect(client.occasions).toEqual([]);
  });
});

describe("saveOccasion create", () => {
  it("creates a hidden occasion at the end of the list without an image", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(occasion({ slug: "existing", sort_order: 4 }));

    const result = await saveOccasion(null, form(baseFields));

    expect(result).toMatchObject({
      occasionId: expect.any(String),
      slug: "eid-al-fitr",
      imagePath: null,
      success: "“Eid al-Fitr” was created as a hidden occasion.",
    });
    expect(client.occasions).toHaveLength(2);
    expect(client.occasions[1]).toMatchObject({
      name: "Eid al-Fitr",
      slug: "eid-al-fitr",
      is_active: false,
      sort_order: 5,
      match_mode: "hybrid",
    });
    expect(client.uploads).toEqual([]);
  });

  it("creates first, uploads into the generated folder, then saves the path", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;

    const result = await saveOccasion(
      null,
      form({ ...baseFields, is_active: "on", image: imageFile() }),
    );

    const createdId = (result as { occasionId: string }).occasionId;
    expect(client.occasions).toHaveLength(1);
    expect(client.uploads).toHaveLength(1);
    expect(client.uploads[0].path).toMatch(
      new RegExp(`^${createdId}/[0-9a-f-]{36}\\.png$`),
    );
    expect(client.uploads[0].options).toEqual({
      contentType: "image/png",
      upsert: false,
    });
    expect(client.occasions[0]).toMatchObject({
      id: createdId,
      is_active: true,
      image_path: client.uploads[0].path,
    });
    expect(client.operations).toEqual([
      "insert:occasions",
      `upload:${client.uploads[0].path}`,
      "update:occasions",
    ]);
    expect(result).toMatchObject({
      success: "“Eid al-Fitr” was created and published.",
      imagePath: client.uploads[0].path,
    });
  });

  it("removes the empty draft when the image upload fails", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.errors.set("upload", { message: "upload failed" });

    const result = await saveOccasion(
      null,
      form({ ...baseFields, image: imageFile() }),
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("image could not be uploaded"),
      fieldErrors: { image: expect.any(String) },
    });
    expect(client.occasions).toEqual([]);
  });

  it("removes the uploaded object before deleting a draft when the path update fails", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.errors.set("update", { message: "update failed" });

    const result = await saveOccasion(
      null,
      form({ ...baseFields, image: imageFile() }),
    );

    expect(result).toMatchObject({
      error: "The occasion was not created because its image could not be attached.",
      fieldErrors: { image: expect.any(String) },
    });
    expect(client.operations).toEqual([
      "insert:occasions",
      `upload:${client.uploads[0].path}`,
      "update:occasions",
      `remove:${client.uploads[0].path}`,
      "delete:occasions",
    ]);
    expect(client.occasions).toEqual([]);
  });

  it("removes a draft whose persisted slug differs from the requested slug", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.setInsertedSlug("eid-al-fitr-taken");

    const result = await saveOccasion(null, form(baseFields));

    expect(result).toMatchObject({
      error: expect.stringContaining("already in use"),
      fieldErrors: { slug: "That URL slug is already in use." },
    });
    expect(client.occasions).toEqual([]);
  });
});

describe("saveOccasion edit", () => {
  const oldPath = `${ROW_ID}/old.png`;

  it("uploads a replacement before updating, then removes the owned old image", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(
      occasion({ slug: "ramadan-evenings", image_path: oldPath }),
    );

    const result = await saveOccasion(
      null,
      form({
        ...baseFields,
        occasion_id: ROW_ID,
        name: "Ramadan evenings",
        slug: "ramadan-evenings",
        image: imageFile("new.png"),
      }),
    );

    expect(client.uploads).toHaveLength(1);
    expect(client.occasions[0].image_path).toBe(client.uploads[0].path);
    expect(client.removals).toEqual([[oldPath]]);
    expect(client.operations).toEqual([
      `upload:${client.uploads[0].path}`,
      "update:occasions",
      `remove:${oldPath}`,
    ]);
    expect(result).toMatchObject({
      success: "“Ramadan evenings” was saved.",
      warning: undefined,
      imagePath: client.uploads[0].path,
    });
  });

  it("does not update or upload when the new image is rejected by the server", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(
      occasion({ slug: "ramadan-evenings", image_path: oldPath }),
    );

    const result = await saveOccasion(
      null,
      form({
        ...baseFields,
        occasion_id: ROW_ID,
        name: "Ramadan evenings",
        slug: "ramadan-evenings",
        image: new File([new Uint8Array([1, 2, 3])], "bad.png", {
          type: "image/png",
        }),
      }),
    );

    expect(result).toMatchObject({
      fieldErrors: { image: expect.any(String) },
    });
    expect(client.uploads).toEqual([]);
    expect(client.occasions[0].image_path).toBe(oldPath);
  });

  it("removes the newly uploaded image when the database update fails", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(
      occasion({ slug: "ramadan-evenings", image_path: oldPath }),
    );
    client.errors.set("update", { message: "update failed" });

    const result = await saveOccasion(
      null,
      form({
        ...baseFields,
        occasion_id: ROW_ID,
        name: "Ramadan evenings",
        slug: "ramadan-evenings",
        image: imageFile("new.png"),
      }),
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("existing data is unchanged"),
    });
    expect(client.removals).toEqual([[client.uploads[0].path]]);
    expect(client.occasions[0].image_path).toBe(oldPath);
  });

  it("allows an occasion to reclaim its own previous slug", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(
      occasion({ slug: "ramadan-evenings", image_path: null }),
    );
    client.redirects.set("ramadan-old", ROW_ID);

    const result = await saveOccasion(
      null,
      form({
        ...baseFields,
        occasion_id: ROW_ID,
        name: "Ramadan evenings",
        slug: "ramadan-old",
      }),
    );

    expect(result).toMatchObject({
      success: "“Ramadan evenings” was saved.",
      slug: "ramadan-old",
    });
    expect(client.occasions[0].slug).toBe("ramadan-old");
  });

  it("rejects a redirect slug that belongs to another occasion", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(
      occasion({ slug: "ramadan-evenings", image_path: null }),
    );
    client.redirects.set("ramadan-old", OTHER_ID);

    const result = await saveOccasion(
      null,
      form({
        ...baseFields,
        occasion_id: ROW_ID,
        name: "Ramadan evenings",
        slug: "ramadan-old",
      }),
    );

    expect(result).toMatchObject({
      fieldErrors: { slug: expect.stringContaining("used before") },
    });
    expect(client.occasions[0].slug).toBe("ramadan-evenings");
  });

  it("reports the slug the database actually saved after a race", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(
      occasion({ slug: "ramadan-evenings", image_path: null }),
    );
    client.setUpdatedSlug("ramadan-old-2");

    const result = await saveOccasion(
      null,
      form({
        ...baseFields,
        occasion_id: ROW_ID,
        name: "Ramadan evenings",
        slug: "ramadan-old",
      }),
    );

    expect(result).toMatchObject({
      success: "“Ramadan evenings” was saved.",
      slug: "ramadan-old-2",
      warning: expect.stringContaining("saved as “ramadan-old-2”"),
    });
    expect(result?.values.slug).toBe("ramadan-old-2");
  });

  it("leaves an unrecognized legacy image path untouched with a warning", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(
      occasion({ slug: "ramadan-evenings", image_path: "legacy/image.png" }),
    );

    const result = await saveOccasion(
      null,
      form({
        ...baseFields,
        occasion_id: ROW_ID,
        name: "Ramadan evenings",
        slug: "ramadan-evenings",
        image: imageFile("new.png"),
      }),
    );

    expect(client.removals).toEqual([]);
    expect(result).toMatchObject({
      success: expect.any(String),
      warning: expect.stringContaining("not recognized"),
    });
  });
});

describe("removeOccasionImage", () => {
  it("detaches the image before deleting its stored object", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    const path = `${ROW_ID}/old.png`;
    client.occasions.push(occasion({ image_path: path }));

    const result = await removeOccasionImage(
      null,
      form({ occasion_id: ROW_ID }),
    );

    expect(result).toMatchObject({
      success: "The occasion image was removed.",
      warning: undefined,
    });
    expect(client.occasions[0].image_path).toBeNull();
    expect(client.removals).toEqual([[path]]);
    expect(client.operations).toEqual([
      "update:occasions",
      `remove:${path}`,
    ]);
  });

  it("warns when the database is cleared but Storage cleanup fails", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    const path = `${ROW_ID}/old.png`;
    client.occasions.push(occasion({ image_path: path }));
    client.errors.set("remove", { message: "remove failed" });

    const result = await removeOccasionImage(
      null,
      form({ occasion_id: ROW_ID }),
    );

    expect(result).toMatchObject({
      success: "The occasion image was removed.",
      warning: expect.stringContaining("Storage"),
    });
    expect(client.occasions[0].image_path).toBeNull();
  });

  it("does not touch an unrecognized image path", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(occasion({ image_path: "legacy/image.png" }));

    const result = await removeOccasionImage(
      null,
      form({ occasion_id: ROW_ID }),
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("not recognized"),
    });
    expect(client.occasions[0].image_path).toBe("legacy/image.png");
    expect(client.operations).toEqual([]);
  });

  it("leaves everything unchanged when clearing the database fails", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    const path = `${ROW_ID}/old.png`;
    client.occasions.push(occasion({ image_path: path }));
    client.errors.set("update", { message: "update failed" });

    const result = await removeOccasionImage(
      null,
      form({ occasion_id: ROW_ID }),
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("Nothing was changed"),
    });
    expect(client.occasions[0].image_path).toBe(path);
    expect(client.removals).toEqual([]);
  });

  it("is idempotent when there is no image", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(occasion({ image_path: null }));

    const result = await removeOccasionImage(
      null,
      form({ occasion_id: ROW_ID }),
    );

    expect(result).toMatchObject({
      success: "This occasion already has no image.",
    });
    expect(client.operations).toEqual([]);
  });

  it("rejects an invalid occasion id", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;

    const result = await removeOccasionImage(
      null,
      form({ occasion_id: "not-a-uuid" }),
    );

    expect(result).toMatchObject({
      error: "That occasion id is not valid.",
    });
    expect(client.calls).toEqual([]);
  });
});

describe("deleteOccasion", () => {
  it("removes its owned image before deleting the row", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    const path = `${ROW_ID}/old.png`;
    client.occasions.push(occasion({ image_path: path }));

    const result = await deleteOccasion(
      null,
      form({ occasion_id: ROW_ID }),
    );

    expect(result).toMatchObject({
      success: "“Ramadan evenings” was deleted.",
      warning: undefined,
    });
    expect(client.occasions).toEqual([]);
    expect(client.removals).toEqual([[path]]);
    expect(client.operations).toEqual([
      `remove:${path}`,
      "delete:occasions",
    ]);
  });

  it("keeps the row when the owned image cannot be removed", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(occasion({ image_path: `${ROW_ID}/old.png` }));
    client.errors.set("remove", { message: "remove failed" });

    const result = await deleteOccasion(
      null,
      form({ occasion_id: ROW_ID }),
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("still in the list"),
    });
    expect(client.occasions).toHaveLength(1);
    expect(client.operations).toEqual([`remove:${ROW_ID}/old.png`]);
  });

  it("reports an image that was removed when the row delete fails", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    const path = `${ROW_ID}/old.png`;
    client.occasions.push(occasion({ image_path: path }));
    client.errors.set("delete", { message: "delete failed" });

    const result = await deleteOccasion(
      null,
      form({ occasion_id: ROW_ID }),
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("image was removed"),
    });
    expect(client.occasions).toHaveLength(1);
    expect(client.removals).toEqual([[path]]);
    expect(client.operations).toEqual([
      `remove:${path}`,
      "delete:occasions",
    ]);
  });

  it("deletes a row with an unrecognized image path and warns", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(occasion({ image_path: "legacy/image.png" }));

    const result = await deleteOccasion(
      null,
      form({ occasion_id: ROW_ID }),
    );

    expect(result).toMatchObject({
      success: "“Ramadan evenings” was deleted.",
      warning: expect.stringContaining("not recognized"),
    });
    expect(client.occasions).toEqual([]);
    expect(client.removals).toEqual([]);
    expect(client.operations).toEqual(["delete:occasions"]);
  });
});

describe("setOccasionVisibility", () => {
  it("updates the published flag", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(occasion({ is_active: false }));

    const result = await setOccasionVisibility(
      null,
      form({ occasion_id: ROW_ID, next_state: "published" }),
    );

    expect(result).toMatchObject({
      success: "“Ramadan evenings” is now published.",
    });
    expect(client.occasions[0].is_active).toBe(true);
  });

  it("rejects an unknown visibility state without writing", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(occasion({ is_active: false }));

    const result = await setOccasionVisibility(
      null,
      form({ occasion_id: ROW_ID, next_state: "archived" }),
    );

    expect(result).toMatchObject({
      error: "Choose a valid visibility state.",
    });
    expect(client.occasions[0].is_active).toBe(false);
  });
});

describe("moveOccasion", () => {
  it("moves one occasion past a hidden neighbour through the full-list RPC", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(
      occasion({ id: ROW_ID, slug: "first", sort_order: 0 }),
      occasion({ id: OTHER_ID, slug: "second", sort_order: 1, is_active: false }),
      occasion({ id: THIRD_ID, slug: "third", sort_order: 2 }),
    );

    const result = await moveOccasion(
      null,
      form({ occasion_id: OTHER_ID, direction: "up" }),
    );

    expect(result).toMatchObject({ success: "Moved up." });
    expect(client.rpcCalls).toEqual([
      {
        name: "reorder_occasions",
        args: { p_occasion_ids: [OTHER_ID, ROW_ID, THIRD_ID] },
      },
    ]);
  });

  it("reports the first boundary without calling the RPC", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(occasion({ id: ROW_ID, sort_order: 0 }));

    const result = await moveOccasion(
      null,
      form({ occasion_id: ROW_ID, direction: "up" }),
    );

    expect(result).toMatchObject({ success: "This occasion is already first." });
    expect(client.rpcCalls).toEqual([]);
  });

  it("surfaces an RPC failure without a false success", async () => {
    const client = state.supabase as ReturnType<typeof makeClient>;
    client.occasions.push(
      occasion({ id: ROW_ID, sort_order: 0 }),
      occasion({ id: OTHER_ID, slug: "second", sort_order: 1 }),
    );
    client.errors.set("rpc", { message: "rpc failed" });

    const result = await moveOccasion(
      null,
      form({ occasion_id: OTHER_ID, direction: "up" }),
    );

    expect(result).toEqual({
      attempt: 1,
      occasionId: OTHER_ID,
      error: "Could not reorder the occasions. No changes were saved.",
    });
  });
});
