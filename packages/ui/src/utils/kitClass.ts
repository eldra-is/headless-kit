import { kitMerge, mergeWith, warnArrayClassesValue, type ClassValue } from './cx';

export type { ClassValue };

const PREFIX = 'eldra:';

/**
 * A class without the prefix is a consumer's (through `classes` or `class`): it is kept as written,
 * and it still replaces the package's own `eldra:` class it conflicts with, so `px-6` drops
 * `eldra:px-4` instead of landing beside it.
 */
function mergeKit(classes: string): string {
  const tokens = classes.split(/\s+/).filter(Boolean);
  const shadow = tokens.map((token) => (token.startsWith(PREFIX) ? token : PREFIX + token));
  const kept = kitMerge(shadow.join(' ')).split(/\s+/).filter(Boolean);
  // `kept` is a subsequence of `shadow`; align from the end, since the later of two duplicates wins.
  const out: string[] = [];
  let j = kept.length - 1;
  for (let i = shadow.length - 1; i >= 0 && j >= 0; i--) {
    if (shadow[i] === kept[j]) {
      out.push(tokens[i]!);
      j--;
    }
  }
  return out.reverse().join(' ');
}

/** The package's own `cx`: the public one's merge, for classes that carry the `eldra:` prefix. */
export function cx(...inputs: ClassValue[]): string {
  return mergeWith(mergeKit, inputs);
}

/** The package's own `partClass`: the part's classes with the consumer's override merged over them. */
export function partClass<P extends string>(
  base: string,
  classes: Partial<Record<P, string>> | undefined,
  part: P
): string {
  const override = classes?.[part] as unknown;
  if (Array.isArray(override)) warnArrayClassesValue(part);
  return mergeWith(mergeKit, [base, override]);
}
