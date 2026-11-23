import { containsLikePattern } from "./like-pattern";

const POSTGREST_SYNTAX = /[,()"*]/g;
const MAX_COURIER_LENGTH = 80;

export function normalizeCourierSearch(value: string | undefined): string {
  return (value ?? "")
    .replace(POSTGREST_SYNTAX, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_COURIER_LENGTH);
}

export function courierLikePattern(value: string | undefined): string | null {
  const courier = normalizeCourierSearch(value);
  return courier ? containsLikePattern(courier) : null;
}
