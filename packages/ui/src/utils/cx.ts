import { twMerge } from 'tailwind-merge';

/**
 * Anything `cx` accepts: a class string, a falsy placeholder for a branch that
 * did not apply, or an object whose truthy keys are class names.
 */
export type ClassValue = string | false | null | undefined | Record<string, boolean>;

/**
 * Join class values, then resolve Tailwind conflicts so the last one wins.
 *
 * Every component builds its classes with this, which is what makes the
 * `classes` prop work without `!important`: a consumer's `px-6` replaces the
 * component's `px-4` instead of landing beside it and losing to source order.
 */
export function cx(...inputs: ClassValue[]): string {
  const parts: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      parts.push(input);
      continue;
    }
    for (const [name, enabled] of Object.entries(input)) {
      if (enabled) parts.push(name);
    }
  }
  return twMerge(parts.join(' '));
}

/**
 * The classes for one named part of a component: the part's own classes with
 * the consumer's override for that part merged over them.
 *
 * `Part` is the union of the part names in the component's spec anatomy, so a
 * typo in a `classes` key is a type error rather than a silently ignored
 * override.
 */
export function partClass<P extends string>(
  base: string,
  classes: Partial<Record<P, string>> | undefined,
  part: P
): string {
  return cx(base, classes?.[part]);
}
