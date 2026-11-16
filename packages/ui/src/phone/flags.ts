import { shallowRef, type ShallowRef } from 'vue';

/**
 * The flag artwork is 46 kB gzipped, so it is one lazy chunk, fetched when the first `PhoneInput`
 * mounts in a browser and shared by every one after it. Until it arrives a flag is an empty box of
 * the same size, so nothing moves when it does. A server render never loads it: the server and the
 * client's first render both draw the empty box, and agree.
 */
const flags: ShallowRef<Readonly<Record<string, string>> | null> = shallowRef(null);
let loading: Promise<void> | undefined;

/** Loads the flags. Safe to call more than once, and ahead of a `PhoneInput` to draw them sooner. */
export function preloadPhoneFlags(): Promise<void> {
  loading ??= import('./phoneFlagData').then(
    (module) => {
      flags.value = module.default;
    },
    () => {
      // A failed chunk is tried again by the next field that mounts.
      loading = undefined;
    }
  );
  return loading;
}

export interface PhoneFlagArt {
  viewBox: string;
  body: string;
}

/** A country's flag once the chunk is in; reactive, so a flag drawn before then fills in. */
export function phoneFlag(country: string): PhoneFlagArt | undefined {
  const entry = flags.value?.[country];
  if (entry === undefined) return undefined;
  const cut = entry.indexOf('|');
  return { viewBox: entry.slice(0, cut), body: entry.slice(cut + 1) };
}
