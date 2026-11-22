import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "user-1",
  // What the mocked update returns: "found" resolves the row,
  // "missing" resolves an empty set (another customer's id).
  updateResult: "found" as "found" | "missing",
  lastUpdate: null as Record<string, unknown> | null,
  clearedDefaults: 0,
  updatedRows: [] as Record<string, unknown>[],
  requireUserCalls: [] as unknown[],
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async (options: unknown) => {
    state.requireUserCalls.push(options);
    return {
      user: { id: state.userId },
      supabase: {
        from() {
          const builder: Record<string, unknown> = {};
          builder.select = () => builder;
          builder.eq = () => builder;
          builder.order = () => builder;
          builder.limit = () => builder;
          builder.update = (values: Record<string, unknown>) => {
            state.lastUpdate = values;
            return builder;
          };
          builder.insert = () => builder;
          builder.delete = () => builder;
          // The chain ends in .select("id") for the update path; the
          // add path ends in an insert whose awaited value is the
          // builder itself, so make the builder thenable.
          builder.then = (resolve: (value: unknown) => void) => {
            if (
              state.lastUpdate !== null &&
              Object.keys(state.lastUpdate).length === 1 &&
              state.lastUpdate.is_default === false
            ) {
              // setDefault / clear-defaults update: no rows selected.
              state.clearedDefaults += 1;
              resolve({ data: null, error: null });
              return;
            }
            if (state.lastUpdate !== null) {
              state.updatedRows.push(state.lastUpdate);
              resolve({
                data: state.updateResult === "found" ? [{ id: "addr-1" }] : [],
                error: null,
              });
              return;
            }
            resolve({ data: null, error: null });
          };
          return builder;
        },
      },
    };
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

import {
  addSavedAddress,
  deleteSavedAddress,
  setDefaultSavedAddress,
  updateSavedAddress,
  type AddressBookState,
} from "./actions";

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    form.set(key, value);
  }
  return form;
}

const VALID = {
  address_id: "addr-1",
  label: "Home",
  recipient_name: "Amina",
  contact_phone: "01001112233",
  address_line: "12 Road 9, Maadi",
  city: "Cairo",
  governorate: "Cairo",
  notes: "",
};

describe("updateSavedAddress (R-08 address edit)", () => {
  beforeEach(() => {
    state.updateResult = "found";
    state.lastUpdate = null;
    state.clearedDefaults = 0;
    state.updatedRows = [];
    state.requireUserCalls = [];
  });

  it("updates the caller's own row and reports success", async () => {
    const result: AddressBookState = await updateSavedAddress(null, formData(VALID));
    expect(result).toEqual({ success: "Address updated.", attempt: 1 });
    expect(state.updatedRows).toHaveLength(1);
    expect(state.updatedRows[0]).toMatchObject({
      label: "Home",
      city: "Cairo",
      governorate: "Cairo",
    });
  });

  it("returns not-found when the row is not the caller's", async () => {
    state.updateResult = "missing";
    const result: AddressBookState = await updateSavedAddress(null, formData(VALID));
    expect(result).toEqual({ error: "That address was not found.", attempt: 1 });
  });

  it("rejects invalid input without touching the database", async () => {
    const result: AddressBookState = await updateSavedAddress(
      null,
      formData({ ...VALID, label: "X" }),
    );
    expect(result && "error" in result ? result.error : null).toBe(
      "Label must be 2–40 characters.",
    );
    expect(state.updatedRows).toHaveLength(0);
  });

  it("clears other defaults when the edited address becomes default", async () => {
    const result: AddressBookState = await updateSavedAddress(
      null,
      formData({ ...VALID, is_default: "1" }),
    );
    expect(result).toEqual({ success: "Address updated.", attempt: 1 });
    expect(state.clearedDefaults).toBe(1);
    expect(state.updatedRows[0]).toMatchObject({ is_default: true });
  });

  it("requires an address id", async () => {
    const withoutId = { ...VALID };
    delete (withoutId as Partial<typeof VALID>).address_id;
    const result: AddressBookState = await updateSavedAddress(
      null,
      formData(withoutId),
    );
    expect(result).toEqual({ error: "Missing address.", attempt: 1 });
    expect(state.updatedRows).toHaveLength(0);
  });
});

describe("address mutation auth verification", () => {
  beforeEach(() => {
    state.updateResult = "found";
    state.lastUpdate = null;
    state.clearedDefaults = 0;
    state.updatedRows = [];
    state.requireUserCalls = [];
  });

  it("verifies the Auth server session for every write", async () => {
    await addSavedAddress(null, formData(VALID));
    await updateSavedAddress(null, formData(VALID));
    await setDefaultSavedAddress(null, formData({ address_id: "addr-1" }));
    await deleteSavedAddress(null, formData({ address_id: "addr-1" }));

    expect(state.requireUserCalls).toEqual([
      { verifyWithAuthServer: true },
      { verifyWithAuthServer: true },
      { verifyWithAuthServer: true },
      { verifyWithAuthServer: true },
    ]);
  });
});
