import type { InjectionKey } from 'vue';

/**
 * Split out of `useEldraIcon.ts` so Storybook config (`.storybook/preview.ts`,
 * `.storybook/iconFetcher.ts`) can import just the key/type without pulling
 * in `useEldraIcon.ts`'s default-path code, which references Nuxt's
 * auto-imported `useFetch` as a bare global — a name `tsconfig.storybook.json`'s
 * plain `tsc` (no Nuxt ambient types) cannot resolve, even though it is
 * never called under Storybook (an injected fetcher always takes over
 * before that branch runs).
 */
export type IconFetcher = (name: string) => Promise<string | null>;

export const ICON_FETCHER_KEY: InjectionKey<IconFetcher> = Symbol('eldra-icon-fetcher');
