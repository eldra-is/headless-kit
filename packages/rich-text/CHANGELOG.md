# Changelog

## 0.1.0 (2026-09-15)


### Features

* the headless kit — sdk, rich-text and vue ([b7e2447](https://github.com/eldra-is/headless-kit/commit/b7e2447f7e91ba930c6f08910a71db0d7b9723b0))

## @eldra-is/rich-text changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- First release, moved out of `@eldra-is/vue-ui-components`. The document types are declared here
  (`RichTextDocument`, `RichTextNode`, `RichTextMark`), so nothing needs TipTap or Vue to typecheck.
- `toHtml(document, { nodes, marks })`: an escaping HTML serialiser with the same override
  semantics as the Vue renderer — string tag, styled tag, `null` for children only, or a function.
- Link and image URLs are limited to safe schemes (`safeHref`, `safeImageSrc`); `textStyle`
  colours must be a colour (`safeCssColor`); an embed renders only from a source on
  `EMBED_SOURCE_HOSTS` (`isTrustedEmbedSource`). Script-mode embeds become a link card in HTML.
- Embed normalisation moved here unchanged (`normalizeEmbedInput`, `extractSupportedEmbedUrl`).
- Text helpers moved here unchanged (`extractTipTapText`, `renderTipTapText`,
  `truncateTipTapText`, `normalizeTipTapText`).
