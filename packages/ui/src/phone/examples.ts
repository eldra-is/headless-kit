import { getExampleNumber, isSupportedCountry } from 'libphonenumber-js/min';
import examples from 'libphonenumber-js/mobile/examples';

/** A number the country could have, spaced as it writes one (`IS` → `611 1234`): a placeholder. */
export function phoneExample(country: string): string | undefined {
  if (!isSupportedCountry(country)) return undefined;
  return getExampleNumber(country, examples)?.formatNational();
}
