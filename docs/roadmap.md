# Roadmap

Work that is planned but not built. Each line is a starting point, not a design; open an issue
before picking one up so the shape can be agreed first.

## Open

### SDK

- **Variant selection.** A pure helper in `@eldrajs/sdk` that, from a product's `options`,
  `variants` and the customer's chosen option values, returns the matching active variant (or
  `null` while the choice is incomplete), says whether a value is still available alongside the
  others, and computes the default selection from the product data alone so server and browser
  render the same; every storefront writes this today, and a picker that emits its default from a
  child's setup causes a hydration mismatch in Nuxt — the guide states both rules.
- **Product structured data.** A helper that builds schema.org `Product` / `Offer` JSON-LD from a
  public product (price, sale price from `compareAtPrice`, availability, one offer per variant),
  so search engines can show a product page as a product; plus a paragraph in the storefront guide.
- **A codegen CLI.** The generator behind the `eldra()` Vite plugin as a command, so Next,
  SvelteKit, Angular and plain Node projects get `.eldra/web-studio/` without Vite; the plugin then
  becomes a thin wrapper over it rather than a second implementation.
- **Deprecation reach.** Decide how a deprecated SDK method or contract field reaches the
  developers using it beyond a changelog line — `@deprecated` in the types, a one-time development
  warning, `npm deprecate` on old versions — before the first deprecation ships.

### Documentation

- **A build-a-storefront guide** that instructs rather than describes, written against the
  published packages: organisation id and base URL, catalog and product pages, variant selection,
  the cart and its persistence, discount codes, the checkout handoff, the order page and recovery
  links, shipping (`requiresShipping`, delivery price and free-shipping threshold), locales,
  generated types and upgrading across contract versions, and the SSR traps (cart markup is
  client-only because the server never sees the cart; format prices identically on server and
  client).
- **A provider setup guide**: which payment and delivery providers a storefront can use, what the
  merchant configures in Studio (storefront origins, the checkout recovery URL, providers), and
  what the developer does for each.
- **VitePress on GitHub Pages**, once the docs have a second reader. The markdown in `docs/` is
  written to move over unchanged.

### Working in the repository

- **A playground.** `pnpm dev` starts a small Nuxt app under `examples/` pointed at the demo
  organisation: the manual test, the first tutorial, and the first thing a contributor runs. Until
  then `pnpm dev` runs the unit tests in watch mode.
- **A public demo organisation** on a reachable gateway, with `http://localhost:<port>` in its
  storefront origins and mock payments, so the playground and the guide work without an Eldra
  account; it will collect strangers' test carts and orders by design.
- **Issue and pull request templates**, added with the first outside issue.
- **Wrappers for other frameworks** (`@eldrajs/react`, `@eldrajs/svelte`) when someone needs one;
  the contract a wrapper satisfies is in [frameworks.md](./frameworks.md). An empty package is not
  published ahead of a consumer.
