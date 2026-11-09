export type UserScopedOrderQuery<T> = {
  eq(column: "user_id", value: string): T;
};

/** Applies the customer ownership constraint without replacing database RLS. */
export function scopeOrdersToUser<T>(
  query: UserScopedOrderQuery<T>,
  userId: string,
): T {
  return query.eq("user_id", userId);
}

export type AccountOrdersResult<T> =
  | { kind: "loaded"; orders: T[] }
  | { kind: "error"; error: unknown };

export function resolveAccountOrders<T>(
  data: T[] | null,
  error: unknown,
): AccountOrdersResult<T> {
  if (error) return { kind: "error", error };
  return { kind: "loaded", orders: data ?? [] };
}
