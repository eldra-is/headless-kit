import { kitMerge } from '../utils/mergeClass';

/** Classes `tailwind-merge` would drop from `tokens` because a later one replaces them. */
export function conflicting(tokens: readonly string[]): string[] {
  const kept = new Set(kitMerge(tokens.join(' ')).split(/\s+/));
  return tokens.filter((token) => !kept.has(token));
}
