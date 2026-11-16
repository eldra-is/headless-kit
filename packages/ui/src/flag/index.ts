/**
 * `@eldrajs/ui/flag`: a country's flag, for a country select, an address or a language switch.
 *
 * Its own entry because of its artwork: one lazy chunk of about 46 kB gzipped that the root entry
 * must never reach. It needs no peer; `@eldrajs/ui/phone` draws its flags with the same component
 * and shares the chunk.
 */
export { default as CountryFlag } from './CountryFlag.vue';
export { preloadCountryFlags } from './flags';
