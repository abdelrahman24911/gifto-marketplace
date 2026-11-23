// Typed confirmation for destructive actions (e.g. deleting a product):
// the user must type the item's name exactly. Case-sensitive, surrounding
// whitespace ignored. The server action re-checks the same rule against the
// stored name, so a crafted POST cannot bypass the UI step.
export function deleteConfirmationMatches(
  expected: string,
  input: string,
): boolean {
  return expected.trim().length > 0 && input.trim() === expected.trim();
}
