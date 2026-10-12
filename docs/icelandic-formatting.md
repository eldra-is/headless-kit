# Icelandic formatting

Numbers, prices, dates, lists and names in Icelandic need locale data that several runtimes do not
ship. Where it is missing, `Intl` does not fail: it formats in English instead. Use
[`@eldrajs/sdk/format`](../packages/sdk/README.md#icelandic-formatting) for any text a shopper reads, and the same text comes out
on every runtime.

## The problem

| Shape         | Full ICU (Node, Safari, Firefox) | Chrome, Edge, Cloudflare Workers |
| ------------- | -------------------------------- | -------------------------------- |
| Price         | `1.234.567 kr.`                  | `ISK 1,234,567`                  |
| Euro price    | `1.234,50 EUR`                   | `€1,234.50`                      |
| Date          | `12. október 2026`               | `October 12, 2026`               |
| List          | `a, b og c`                      | `a, b, and c`                    |
| Relative time | `fyrir 3 dögum`                  | `3 days ago`                     |
| Country       | `Danmörk`                        | `Denmark`                        |
| Sort order    | `A Á B D Ð Z Þ Æ Ö`              | `A Á Æ B D Ð Ö Z Þ`              |

Measured on 12 October 2026 in Node 24.20 (ICU 78.3), Safari 27 on macOS and iOS 27, Firefox 155,
Chrome 154, local `workerd` and Cloudflare's edge. Chrome and Workers both build in Chromium's ICU
data file, which keeps only a stub for Icelandic because it is not a Chrome interface language.
Cloudflare has no option or compatibility flag that adds it.

Two things go wrong:

1. **Icelandic shoppers read English.** In Chrome, which is most of them.
2. **Hydration mismatches.** A server with full ICU renders `12.900 kr.`, Chrome hydrates to
   `ISK 12,900`, Vue warns and the browser's version wins. A site rendered on Workers prints
   English from the start.

## The rules

- **Format with `@eldrajs/sdk/format`, never with `Intl.*`, `toLocaleString` or vue-i18n's `n()`/`d()`**
  for text a shopper reads. Those all use the runtime's own data. The package carries Icelandic and
  English itself and passes every other locale to the runtime.
- **The same code runs on the server and in the browser.** There is no polyfill to load and nothing
  to detect, so there is nothing to wait for before hydration and no runtime whose ICU version can
  drift from another's.
- **Prices use the currency's wide sign:** `12.900 kr.` in Icelandic, `ISK 12,900` in English. A bare
  `kr` is also the Danish, Norwegian and Swedish krone. `formatPrice` and `@eldrajs/ui`'s `<Price>`
  both do this.
- **Dates are UTC.** Iceland is on UTC all year, and a server and a browser in different time zones
  would otherwise print different times. `dateTimeFormat` defaults to UTC and refuses another zone
  for Icelandic or English rather than print UTC under its name.
- **Sort Icelandic text with `comparator(locale)`** (or on the server). `localeCompare` and
  `Intl.Collator` sort `Þ` after `Z` and `Æ`/`Ö` among `A`/`O` where the data is missing.

## In a Nuxt site

Nothing to register: import the function where the text is built, and the server render and the
hydration produce the same string. The starter's
[`app/storefront/money.ts`](../examples/starter-nuxt/app/storefront/money.ts) is a worked example.
The `@eldrajs/ui` components (`Price`, `CurrencyInput`, `RangeSlider`, `ContentCard`'s date and the
rest) already format through the package.

## What it costs

Each entry carries its own `is` and `en` data. Brotlied, as `.size-limit.cjs` budgets them: prices
and numbers about 33 kB, dates 66 kB (numbers included), lists 11 kB, relative times 35 kB (numbers included), names
30 kB; the comparator alone 0.5 kB. A bundler includes only the entries a page imports.

## Known differences from full ICU

The same text comes out on every runtime, so none of these can mismatch a hydration; they differ
from what Node or Safari's own `Intl` would print:

- An English 12-hour time range repeats AM/PM (`2:05 PM – 3:05 PM`, ICU `2:05 – 3:05 PM`).
- `timeZoneName` names the zone `UTC`, also for `Atlantic/Reykjavik` (ICU: `GMT`).
- Rarer options: `calendar`, `dayPeriod`, `timeZoneName: 'shortOffset'`, `unit: 'percent'` and narrow
  language names follow formatjs, not ICU.

## How it is tested

`packages/sdk/src/__tests__/format/parity.spec.ts` replaces Node's `Intl` constructors with ones that
drop Icelandic, the way Chrome and Workers behave, and requires every shape a storefront prints to
match Node's own full-ICU output exactly. `chromium.browser.spec.ts` runs the same cases in real
Chromium. The locale data is copied from formatjs into `src/data` by `pnpm --filter
@eldrajs/sdk format-data`; `check:format-data` fails when a formatjs upgrade leaves it stale.
