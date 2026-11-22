# @eldrajs/nuxt changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- **First release (WS-1236).** A Nuxt module for prerendered storefronts on Cloudflare Workers: a
  request is answered from the files the build wrote; a page path with no built file is a 404 with
  the site's error page and no API reads, any other unbuilt path a bare 404, a write to it a 405.
  Server routes (catch-all ones included) and `prerender: false` pages are still rendered on
  request; a visitor's request to `/__nuxt_error` is a bare 404. Only under a Cloudflare preset. `isUnbuiltPage()` lets
  a plugin skip its reads on that 404; `fetchBuiltFile()` serves a built file from site middleware.
