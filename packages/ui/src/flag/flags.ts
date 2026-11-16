import { shallowRef, type ShallowRef } from 'vue';

/**
 * The flag artwork is 46 kB gzipped, so it is one lazy chunk, fetched when the first `CountryFlag`
 * (or `PhoneInput`, which draws them) mounts in a browser and shared by every one after it. Until
 * it arrives a flag is an empty box of the same size, so nothing moves when it does. A server
 * render never loads it: the server and the client's first render both draw the empty box, and
 * agree.
 */
const flags: ShallowRef<Readonly<Record<string, string>> | null> = shallowRef(null);
let loading: Promise<void> | undefined;

/** Loads the flags. Safe to call more than once, and ahead of a flag to draw it sooner. */
export function preloadCountryFlags(): Promise<void> {
  // The data sits beside the phone input it was first made for; the chunk keeps that name.
  loading ??= import('../phone/phoneFlagData').then(
    (module) => {
      flags.value = module.default;
    },
    () => {
      // A failed chunk is tried again by the next flag that mounts.
      loading = undefined;
    }
  );
  return loading;
}

export interface CountryFlagArt {
  viewBox: string;
  body: string;
}

/** A country's flag once the chunk is in; reactive, so a flag drawn before then fills in. */
export function countryFlag(country: string): CountryFlagArt | undefined {
  const entry = flags.value?.[country.toUpperCase()];
  if (entry === undefined) return undefined;
  const cut = entry.indexOf('|');
  return { viewBox: entry.slice(0, cut), body: entry.slice(cut + 1) };
}
