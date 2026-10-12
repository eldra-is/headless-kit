# @eldrajs/format

Icelandic and English number, price, date, list and name formatting that prints the same text on
every runtime. Chrome, Edge and Cloudflare Workers ship without Icelandic locale data, and `Intl`
then falls back to English without an error: `ISK 1,234,567` instead of `1.234.567 kr.`,
`October` instead of `október`. On a server-rendered site that is also a hydration mismatch, because
the server and the browser print different text.

```bash
pnpm add @eldrajs/format
```

```ts
import { comparator, formatPrice, numberFormat } from '@eldrajs/format';
import { dateTimeFormat } from '@eldrajs/format/date';

formatPrice(12900, 'ISK', 'is-IS'); // "12.900 kr."
formatPrice(12900, 'ISK', 'en-US'); // "ISK 12,900"
numberFormat('is-IS', { style: 'percent' }).format(0.24); // "24%"
dateTimeFormat('is-IS', { dateStyle: 'long' }).format(date); // "12. október 2026"
towns.sort(comparator('is-IS')); // Akureyri, Ísafjörður, Þórshöfn, Ölfus
```

Each function takes the same options as the `Intl` constructor it is named after and returns an
object with the same methods (`format`, `formatToParts`, `resolvedOptions`, …). Formatters are
cached per locale and options.

| Entry                           | Exports                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `@eldrajs/format`               | `numberFormat`, `formatPrice`, `comparator`, `compareIcelandic` |
| `@eldrajs/format/date`          | `dateTimeFormat`                                                |
| `@eldrajs/format/list`          | `listFormat`                                                    |
| `@eldrajs/format/relative-time` | `relativeTimeFormat`                                            |
| `@eldrajs/format/display-names` | `displayNames`                                                  |

Import only the entries you use; each carries its own data.

## Rules

`is`, `is-IS`, `en` and `en-US` come from this package's data; other locales go to the runtime.
Dates are UTC. Prices are in major units. The reasons, the measured runtime support and the cost
are in [docs/icelandic-formatting.md](../../docs/icelandic-formatting.md).
