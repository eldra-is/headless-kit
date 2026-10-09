# Theme texts

A theme's own UI copy — labels, empty-state copy, anything that is not CMS or commerce content —
ships as a `vue-i18n` message catalogue, one JSON file per locale, at the theme root. This page is
the developer-facing guide to that catalogue: what you ship, what Studio can change about it without
you redeploying, and how an override gets back into your source if you want it there. [Design
tokens](theme-design-tokens.md) is the lower-level reference for the merge
mechanics and the bridge message; [Starter kit conventions §5](starter-kit.md#5-strings) is the
worked example this page draws from.

## What you ship

```
my-theme/
  package.json       { "eldra": { "defaultLocale": "en-US" } }
  tokens.json
  i18n/
    en-US.json
    is-IS.json
  blocks/
```

Each `i18n/<tag>.json` is ordinary nested `vue-i18n` JSON — the same shape `vue-i18n`'s own on-disk
format uses, placeholders like `{count}` included. `@eldrajs/vite-plugin-theme` flattens each file
into dotted keys (`header.menu`, `cart.empty.title`) for the manifest and for Studio; a key matches
`^[a-z0-9]+([A-Z][a-z0-9]*)*(\.[a-z0-9]+([A-Z][a-z0-9]*)*)*$` (camelCase segments, ≤ 128 characters)
and a value is a string of at most 2000 runes.

**One locale's file defines the key set: the default locale.** Declare it explicitly under
`package.json`'s own `eldra` key:

```json
{ "name": "my-theme", "eldra": { "defaultLocale": "en-US" } }
```

Left undeclared, it is `en-US` when the theme ships that file, else the alphabetically first locale
file. **Every other locale's keys must be a subset of the default locale's** — a key outside that
set fails both `eldra-theme validate` and the Vite plugin's own scan, naming the locale and the
offending key. There is no requirement that every other locale be _complete_; a key the default
locale has and a second locale does not falls back (see "The fallback chain" below).

`manifest.messages` is **absent**, not an empty object, when a theme ships no `i18n/` directory, so
a theme with no texts of its own keeps emitting the manifest shape an older platform already
accepts.

### The `{'@'}` escape

`vue-i18n`'s own message syntax treats a bare `@` as the start of a linked-message reference, `|` as
a pluralization separator, and `{`/`}` outside a `{param}` placeholder as syntax — so a literal `@`
inside a value has to be escaped as `{'@'}`:

```json
{ "newsletter": { "emailPlaceholder": "name{'@'}example.com" } }
```

Nothing else in that syntax survives unescaped either; follow the same pattern for any new string
that happens to need one. This is stored verbatim in the manifest and in Studio's theme-texts
editor — the escape is `vue-i18n`'s, not the platform's, so it round-trips through an override the
same way.

## `vue-i18n` in the starter

The starter speaks `vue-i18n` directly, with no wrapper composable: `import { useI18n } from
'vue-i18n'; const { t } = useI18n();`, then `t('header.cartMany', { count })` — exactly how an
application built from scratch on `vue-i18n` would read its own strings. `app/plugins/eldra-i18n.ts`
is the one place that installs it:

```ts
createI18n({
  legacy: false,
  locale: activeLocale(),
  fallbackLocale: [orgDefaultLocale, themeDefaultLocale],
  messages: unflatten(context.messages.locales), // @eldrajs/theme-core/i18n
});
```

`context.messages` (`@eldrajs/theme-vue`'s `EldraContext['messages']`) is the already-merged,
reactive catalogue — the one source both the app's own i18n plugin and `@eldrajs/ui`'s message
provider read from; `unflattenMessages` turns its flat dotted keys back into `vue-i18n`'s nested
shape. A live "Theme texts" edit from an open Studio tab arrives over the preview bridge and is
re-applied through `vue-i18n`'s own `setLocaleMessage`, so every mounted block's `t(...)` call picks
it up with no re-render plumbing of its own (see "The preview bridge", below).

**Typed keys.** `.eldra/block-types.d.ts`'s generated `MessageKey` union (from the default locale's
key set) types anything that hands a key to another call site to interpolate later; `app/i18n.d.ts`
augments `vue-i18n`'s own `DefineLocaleMessage` for autocomplete on `useI18n()` itself. A literal
`t('typo')` written directly in a block's template is not caught by either — `vue-i18n`'s own `t`
signature infers its key type from whatever literal is passed.

**`@eldrajs/ui`'s own strings share these files**, under a top-level `ui.*` namespace — but only the
package's plain-string keys. Its ~40 parameterized keys (pluralization and the like) are not in
`ui.*` and are not overridable; a theme's `app/plugins/eldra-ui-messages.ts` (or equivalent) falls
those back to the package's own function. Every other `ui.*` key _is_ overridable, through the same
mechanism as the theme's own keys.

## What Studio can override

Studio's Site settings → "Theme texts" page lists every plain-string key your manifest carries —
your own namespaces and `ui.*` alike — grouped, searchable, and showing only the overridden ones on
request. An author can:

- **Override** a key the theme shipped a value for, in any of the organisation's configured
  locales.
- **Translate** a key into a locale the theme ships no file for at all — the override's locale is
  added whole, so Studio can translate into a language nobody on the theme side ever wrote.

Only plain-string keys are editable this way; `@eldrajs/ui`'s parameterized keys never appear in the
list, because a flat template cannot carry real pluralization logic.

### The fallback chain

Every key, for every organisation locale, resolves through five tiers, in order, the first one with
a value winning:

```
override(locale) → theme(locale) → override(orgDefault) → theme(orgDefault) → theme(themeDefault)
```

`theme(themeDefault)` is the terminal safety net and deliberately has **no** accompanying override
tier: an override on the theme's own default locale must never leak into a key that, for some other
locale, falls all the way through — the last resort is always the theme's own unmerged text, exactly
what a credential-less build would render. This is `@eldrajs/theme-core/i18n`'s
`resolveMessageCatalogue`; see [Design tokens](theme-design-tokens.md) for the
function signatures.

### Two paths to a live site

A theme-texts edit reaches two different places, on two different schedules:

- **An open builder preview** gets it immediately, over the bridge: Studio pushes
  `editor:theme-messages` (`{ revision, locales }`), and `@eldrajs/theme-vue`'s `useEldraPreview`
  replaces `context.messages.locales[tag]` wholesale for every locale the push names — never a
  per-key merge, since Studio always sends a locale's full resolved set.
- **The deployed, prerendered site** only picks it up at the next build: `@eldrajs/theme-nuxt`'s
  module reads the platform's overrides once, at `nuxi generate` time (one of the four fail-soft
  platform reads — see [How a theme meets the page builder](../CLAUDE.md#build-time-platform-reads)),
  resolves the five-tier chain over the organisation's locales, and that is what
  `virtual:eldra/messages` serves into the build. Saving an override in Studio schedules a rebuild
  the same way a design-token override does (see [the deploy loop's publish-triggered
  rebuilds](theme-deploy-loop.md#5-publish-triggered-rebuilds)), so the gap between "an author
  saved an override" and "the live site shows it" is one rebuild, not a redeploy you have to run by
  hand.

## Export back into the theme

Studio's "Theme texts" page can export the editing locale as a `<tag>.json` file in the same shape
your `i18n/` directory already uses. That is the path from "an author translated or overrode some
copy in Studio" back to "that text lives in the theme's own source": download the export, replace
(or diff against) the matching `i18n/<tag>.json`, and commit it — at that point the text is the
theme's own default again rather than a standing override, and a future site without that override
configured still renders it.

## Reference

- [Design tokens §Messages](theme-design-tokens.md) — the build-time merge
  internals (`flattenMessages`/`unflattenMessages`/`mergeMessageCatalogues`/
  `resolveMessageCatalogue`) and the `editor:theme-messages` bridge payload.
- [Starter kit conventions §5](starter-kit.md#5-strings) — the full worked example: namespaces,
  shared vocabulary (`storefront`, `editor`, `nav`), the "no literal UI copy" test, Storybook/test
  wiring with no gateway.
- [The deploy loop](theme-deploy-loop.md) — build-time platform reads and publish-triggered
  rebuilds in general.
