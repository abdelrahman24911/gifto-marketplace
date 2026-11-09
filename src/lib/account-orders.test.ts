import { describe, expect, it } from "vitest";

import { resolveAccountOrders, scopeOrdersToUser } from "./account-orders";

describe("customer order ownership", () => {
  it("adds an explicit user_id filter for customer and platform-admin sessions", () => {
    const filters: Array<[string, string]> = [];
    const query = {
      eq(column: "user_id", value: string) {
        filters.push([column, value]);
        return "scoped";
      },
    };

    expect(scopeOrdersToUser(query, "customer-1")).toBe("scoped");
    expect(scopeOrdersToUser(query, "admin-user-who-is-also-a-customer")).toBe(
      "scoped",
    );
    expect(filters).toEqual([
      ["user_id", "customer-1"],
      ["user_id", "admin-user-who-is-also-a-customer"],
    ]);
  });

  it("does not turn a database failure into an empty order history", () => {
    const result = resolveAccountOrders(null, new Error("database unavailable"));
    expect(result.kind).toBe("error");
  });

  it("cannot return another customer's order through the ownership-scoped query", () => {
    const orders = [
      { id: "order-1", user_id: "customer-1" },
      { id: "order-2", user_id: "customer-2" },
    ];
    const query = {
      eq(column: "user_id", value: string) {
        expect(column).toBe("user_id");
        return {
          execute: () => orders.filter((order) => order.user_id === value),
        };
      },
    };

    const result = scopeOrdersToUser(query, "customer-1").execute();

    expect(resolveAccountOrders(result, null)).toEqual({
      kind: "loaded",
      orders: [{ id: "order-1", user_id: "customer-1" }],
    });
  });
});
