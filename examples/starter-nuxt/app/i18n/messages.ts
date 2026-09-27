/**
 * UI string shape shared by every locale (`en-US.ts`, `is-IS.ts`) — no
 * hard-coded copy in primitives/blocks/pages, per the starter's strings rule
 * (see `useT.ts`). Content copy (from a block's `mock.json`) is data, not UI
 * copy, and does not belong here.
 */
export interface Messages {
  notFound: {
    eyebrow: string;
    title: string;
    body: string;
    back: string;
  };
  loading: string;
  error: string;
  nav: {
    menu: string;
    close: string;
    skipToContent: string;
    primary: string;
  };
  /**
   * The gallery block's own fallback accessible name — used for its `Carousel` variant and its
   * `Lightbox`, only when the block has no `heading` to use instead (a heading is content, not UI
   * copy, so it is used directly when present; see `blocks/gallery/Block.vue`). Every other
   * gallery/lightbox string (arrows, counter, close button, "Go to image n") is
   * `@eldrajs/ui`'s own `Lightbox`/`Carousel` vocabulary now (`useMessages`), not this starter's.
   */
  gallery: {
    viewer: string;
  };
  /** The testimonials block's own fallback accessible name for its `carousel` variant, only when
   *  the block has no `heading` (see `gallery.viewer` above for the same pattern). */
  testimonials: {
    carousel: string;
  };
  /** The announcement-bar block's own strings: the region's accessible name, the dismiss
   *  button's accessible name, and the two-part editor hint shown when `message` is empty. */
  announcement: {
    region: string;
    dismiss: string;
    hintLabel: string;
    hintHelp: string;
  };
  /**
   * The breadcrumbs block's own editor hint (`EditorPlaceholder`, shown only via `useEditing()`):
   * `trail` is not editable from a page tree the block cannot read (see `blocks/breadcrumbs/
   * block.json`'s own `description`), so a top-level page with an empty `trail` and no
   * `currentTitle` renders nothing live and needs an explanation in the editor instead.
   */
  breadcrumbs: {
    hintLabel: string;
    hintHelp: string;
  };
  /**
   * The feature-grid block's own strings: the block's fallback accessible name (used only when
   * `heading` is empty, the same pattern as `gallery.viewer`/`testimonials.carousel`) and its two
   * editor-only hints — an unfilled heading, and an image-media item with no image chosen yet.
   */
  featureGrid: {
    fallbackLabel: string;
    headingHintLabel: string;
    imageHintLabel: string;
  };
  /**
   * The footer block's own UI chrome — everything it writes itself rather than reads from
   * `mock.json` (see `blocks/footer/Block.vue`): the landmark labels, the newsletter form's
   * visually hidden label and status copy, the two selectors' labels and their theme-constant
   * option sets (not CMS content — the spec's own example locales/currencies), and the social
   * link name template ("{brand} on {network}").
   */
  footer: {
    /** Visually hidden `<h2>` naming the `<footer>` landmark. */
    title: string;
    /** `aria-label` on the link-groups (or flat-links) `<nav>`. */
    nav: string;
    /** Visually hidden `<label>` and placeholder for the newsletter email field. */
    emailLabel: string;
    /** The newsletter form's accessible name when `newsletterTitle` is empty. */
    newsletterAriaLabel: string;
    /** Newsletter submit button label. */
    subscribe: string;
    /** Newsletter submit button's accessible name while the request is in flight. */
    subscribing: string;
    /** Shown when the email is empty or not a valid address. */
    emailInvalid: string;
    /** Shown when `forms.subscribe` resolves with `ok: false`. */
    emailError: string;
    /** The newsletter success status line. */
    subscribed: string;
    /** Visually hidden label for the country/language selector. */
    localeLabel: string;
    /** Placeholder and accessible name of the country/language selector's search field. */
    localeSearchPlaceholder: string;
    /** Visually hidden label for the currency selector. */
    currencyLabel: string;
    /** Display names for `social[].network`, used in the icon button's accessible name. */
    social: {
      instagram: string;
      facebook: string;
      pinterest: string;
      tiktok: string;
      youtube: string;
    };
    /** A social icon link's accessible name, e.g. "Northwind Goods on Instagram". */
    socialLinkName: string;
    /** The country/language selector's fixed option set (spec example locales, not CMS content). */
    localeOptions: {
      usEnglish: string;
      caEnglish: string;
      caFrench: string;
    };
    /** The currency selector's fixed option set (spec example currencies, not CMS content). */
    currencyOptions: {
      usd: string;
      cad: string;
      eur: string;
    };
  };
  /**
   * The hero block's own strings: a fallback accessible name for its `split-carousel` variant's
   * `Carousel` (used only while `heading` — a required field — is still empty, the same pattern as
   * `gallery.viewer`/`testimonials.carousel`), and the editor-only hints (`EditorPlaceholder`,
   * gated by `useEditing()`) for each part of the block that can be empty on a freshly-inserted
   * page (spec "Hero" → States, "Empty (freshly inserted)" row).
   */
  hero: {
    carouselFallback: string;
    headingHintLabel: string;
    headingHintHelp: string;
    subheadingHintLabel: string;
    buttonHintLabel: string;
    imageHintLabel: string;
  };
  /**
   * The `cta` block's three per-field editor hints (spec `02-blocks.md` line 815, "Empty (freshly
   * inserted)"): each replaces just the one empty part it names, only via `useEditing()` — the
   * live site simply omits an empty optional part instead (see `blocks/cta/Block.vue`).
   */
  cta: {
    headingHintLabel: string;
    headingHintHelp: string;
    textHintLabel: string;
    buttonHintLabel: string;
  };
  /**
   * Shared vocabulary for the commerce blocks built on `app/storefront/*` (design doc
   * §"Storefront source") — a `StorefrontResult.pending`/`error` state or an order's delivery
   * step is the same kind of thing across `collection-grid`, `product-detail`, `search`,
   * `cart` and `order-status`, so it lives here once instead of once per block namespace.
   */
  storefront: {
    /** A `StorefrontResult` still loading (`pending` true, no `data` yet). */
    loading: string;
    /** A `StorefrontResult.error` with no more specific, block-authored copy for it. */
    error: string;
    orderStatus: {
      processing: string;
      shipped: string;
      delivered: string;
      delayed: string;
      cancelled: string;
    };
    orderSteps: {
      ordered: string;
      packed: string;
      shipped: string;
      delivered: string;
    };
  };
  /** The header block's own strings (design doc §"Strings and i18n": one namespace per block). */
  header: {
    /** The bar's `<nav aria-label>`. */
    primary: string;
    /** The mobile menu drawer's `ariaLabel`, and the visible text of the "Menu" button in the
     *  `minimal` variant. */
    menu: string;
    /** The hamburger button's accessible name in `default`/`centered`, where it is icon-only. */
    openMenu: string;
    /** The search control's accessible name in the `icon` style. */
    search: string;
    /** The `field` style trigger's visible text, and the search field's placeholder. */
    searchField: string;
    /** The account icon button's accessible name, and the drawer's Account utility link text. */
    account: string;
    /** The cart button's accessible name with no items ("Cart, empty"). */
    cartEmpty: string;
    /** The cart button's accessible name with exactly one item ("Cart, 1 item"). */
    cartOne: string;
    /** The cart button's accessible name with more than one item ("Cart, {count} items"). */
    cartMany: string;
  };
  /**
   * Editor-only hint strings (design doc contract addition #4): shown only when `useEditing()` is
   * true, shared across every block that can render an `EditorPlaceholder` for an empty optional
   * part, rather than duplicated per block namespace.
   */
  editor: {
    /** Shown where a block's link list has no items yet. */
    addLink: string;
  };
}

/** Every dotted leaf key of `Messages` — `'notFound.eyebrow'`, `'loading'`, … */
type DottedKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DottedKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = DottedKeys<Messages>;
