import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Anything `cx` accepts: a class string, a falsy placeholder for a branch that
 * did not apply, or an object whose truthy keys are class names.
 */
export type ClassValue = string | false | null | undefined | Record<string, boolean>;

/**
 * Stock `twMerge` only knows Tailwind's own utilities: it has no idea `text-button-md` is a
 * "font-size" utility, so a consumer's `classes.container: 'text-lg'` used to land *beside* it
 * instead of replacing it, and CSS source order (not the override) decided which one painted.
 *
 * `src/styles/tailwind.css`'s `@utility` rules are invisible to `tailwind-merge` the same way —
 * it never reads the package's CSS, it only pattern-matches class names against its built-in
 * config — so every custom utility that shares a *concern* with a stock group (a font size, a
 * height, a duration, a z-index, an animation) is registered here under that group's id. The three
 * with no stock equivalent (`eldra-focus*`, `target-min`, `target-touch`) get their own group ids
 * instead, so they still conflict with each other without conflicting with unrelated utilities.
 */
const twMerge = extendTailwindMerge<'target-min' | 'target-touch' | 'eldra-focus'>({
  extend: {
    classGroups: {
      // Type styles (tailwind.css "Type styles" + "Button type"): all `text-*` utilities, so a
      // consumer's `text-lg` replaces `text-button-md` instead of landing beside it.
      'font-size': [
        {
          text: [
            'display',
            'h1',
            'h2',
            'h3',
            'h4',
            'body-lg',
            'body',
            'body-sm',
            'caption',
            'overline',
            'label',
            'code',
            'button-sm',
            'button-md',
            'button-lg',
          ],
        },
      ],
      // Control heights (tailwind.css "Control heights and targets"): whole class names, not a
      // `h-*` suffix, but the same "h" group as Tailwind's own `h-*` scale.
      h: ['control-h', 'control-h-sm', 'control-h-lg'],
      // No stock Tailwind group covers a minimum-target utility, so each gets its own group.
      'target-min': ['target-min'],
      'target-touch': ['target-touch'],
      // The one focus ring (tailwind.css "The one focus ring"): the three variants are mutually
      // exclusive, so they share a group with no stock Tailwind equivalent.
      'eldra-focus': ['eldra-focus', 'eldra-focus-always', 'eldra-focus-inset'],
      // Motion durations (tailwind.css "Motion"): the same "duration" group as `duration-150`.
      duration: ['duration-fast', 'duration-base', 'duration-slow'],
      // Layers (tailwind.css "Layers"): the same "z" group as `z-10`.
      z: ['z-sticky', 'z-drawer', 'z-dialog', 'z-toast'],
      // The button spinner's keyframes (tailwind.css "The Button spinner"): the same "animate"
      // group as `animate-spin`.
      animate: ['animate-eldra-spin', 'animate-eldra-pulse'],
    },
  },
});

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
