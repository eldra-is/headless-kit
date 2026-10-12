# @eldrajs/format changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- First release. `numberFormat` and `formatPrice`; `dateTimeFormat` (`./date`), `listFormat`
  (`./list`), `relativeTimeFormat` (`./relative-time`) and `displayNames` (`./display-names`);
  `compareIcelandic` and `comparator`. Icelandic and English are formatted from the package's own
  CLDR 48.2 data, so a server and a browser print the same text whatever ICU data the runtime
  ships; every other locale goes to the runtime's own `Intl`.
