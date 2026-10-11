import type { InjectionKey } from 'vue';

/**
 * An optional override for `useEldraIcon`'s own resolution, kept in its own module so a consumer
 * can import just the key and the type without pulling in `useEldraIcon.ts` (and, through it,
 * every bundled icon in `app/icons.ts`).
 *
 * Nothing in the app or in Storybook provides one: icons resolve out of `app/icons.ts`. It exists
 * for a spec that wants to drive resolution itself, and for a theme that resolves icons some other
 * way entirely.
 */
export type IconFetcher = (name: string) => Promise<string | null>;

export const ICON_FETCHER_KEY: InjectionKey<IconFetcher> = Symbol('eldra-icon-fetcher');
