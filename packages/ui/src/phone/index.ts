/**
 * `@eldrajs/ui/phone`: the phone number field and what it knows about numbers.
 *
 * Its own entry because it is the only part of the package that needs `libphonenumber-js`, an
 * optional peer: `pnpm add libphonenumber-js` in an app that imports this, and nothing to install
 * in one that does not. The root entry never loads it (`src/__tests__/phoneIsolation.spec.ts`).
 */
export { default as PhoneInput } from './PhoneInput.vue';
export { phoneExample } from './examples';
// The name this entry released the preload under; `@eldrajs/ui/flag` has it as `preloadCountryFlags`.
export { preloadCountryFlags as preloadPhoneFlags } from '../flag/flags';
export {
  isValidPhone,
  parsePhone,
  phoneCallingCode,
  phoneCountries,
  type PhoneParts,
} from './phone';
export { phoneCountryName, phoneRule, type PhoneRuleOptions } from './rule';
export type { PhoneInputChange, PhoneInputPart, PhoneInputProps, PhoneInputSize } from './types';
