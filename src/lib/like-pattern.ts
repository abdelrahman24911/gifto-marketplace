export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function containsLikePattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}
