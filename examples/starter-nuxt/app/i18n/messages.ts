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
   * The gallery block's own strings (spec `02-blocks.md` 2720–2845, "Gallery"). `viewer` is the
   * `Lightbox`'s fallback accessible name, used only while `heading` is empty (the same pattern as
   * `testimonials.carousel`); `viewerHeading` is the templated form once a heading exists ("From
   * the studio, image viewer") — kept as a second key rather than adding a `{heading}` placeholder
   * to `viewer` itself, which other call sites already read as a plain string.
   * `carouselFallback` is the same kind of fallback, for the `carousel` variant's own `Carousel`.
   * `viewLarger` names each tile ("View larger, image 2 of 6: {alt}") and `imageHintLabel` is the
   * per-tile editor hint for an item with no image chosen yet (the same "Missing image" state
   * `featureGrid.imageHintLabel` covers for its own media field). The remaining four are the
   * block-level editor-only hints (`EditorPlaceholder`, gated by `useEditing()`) for an empty
   * heading and for a freshly-inserted gallery with no images at all yet (spec States, "Empty
   * (freshly inserted)"). Every other gallery/lightbox string (arrows, counter, close button, "Go
   * to image n") is `@eldrajs/ui`'s own `Lightbox`/`Carousel` vocabulary (`useMessages`), not this
   * starter's.
   */
  gallery: {
    viewer: string;
    viewerHeading: string;
    carouselFallback: string;
    viewLarger: string;
    imageHintLabel: string;
    headingHintLabel: string;
    headingHintHelp: string;
    itemsHintLabel: string;
    itemsHintHelp: string;
  };
  /**
   * The testimonials block's own strings: `carousel` is its fallback accessible name for the
   * `carousel` variant's `Carousel`, only while `heading` — a required field — is still empty
   * (see `gallery.viewer` above for the same pattern); the other four are its two editor-only
   * hints (`EditorPlaceholder`, gated by `useEditing()`) for the heading and for an empty review
   * (spec `02-blocks.md` "Testimonials" → States, "Empty (freshly inserted)").
   */
  testimonials: {
    carousel: string;
    headingHintLabel: string;
    headingHintHelp: string;
    itemHintLabel: string;
    itemHintHelp: string;
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
  /**
   * The split-content block's own strings. There is no block-level heading field to name the
   * section from (each row carries its own `h2`), so `label` is a fixed accessible name for the
   * `<section>` (spec "Split content" → Keyboard & accessibility: "labelled by the block's name in
   * the editor"). `imageHintLabel`/`headingHintLabel`/`headingHintHelp` are the editor-only hints
   * for a freshly inserted row's empty parts (spec → States, "Empty (freshly inserted)").
   * `richTextTableLabel` is the fallback `useRichTextScrollRegions` label for an uncaptioned table,
   * should a row's rich text ever contain one (the field's own toolbar has no table control today).
   */
  splitContent: {
    label: string;
    imageHintLabel: string;
    headingHintLabel: string;
    headingHintHelp: string;
    richTextTableLabel: string;
  };
  /**
   * The stats block's own editor-only hints (spec `02-blocks.md` "Stats" → States, "Empty
   * (freshly inserted)"): the required heading, the optional intro, and a per-figure hint shown
   * for any item whose value and label are both still empty (see `blocks/stats/Block.vue`).
   */
  stats: {
    headingHintLabel: string;
    introHintLabel: string;
    itemHintLabel: string;
    itemHintHelp: string;
  };
  /**
   * The faq block's own strings (spec `02-blocks.md` "FAQ" → States, "Empty (freshly inserted)"):
   * the required heading, the optional intro, and a combined hint shown in place of the whole
   * accordion when `items` is empty (see `blocks/faq/Block.vue`). `richTextTableLabel` is the
   * fallback `useRichTextScrollRegions` label for an uncaptioned table, should an answer's rich
   * text ever contain one (the field's own toolbar has no table control today) — same pattern as
   * `splitContent.richTextTableLabel`.
   */
  faq: {
    headingHintLabel: string;
    introHintLabel: string;
    itemHintLabel: string;
    itemHintHelp: string;
    richTextTableLabel: string;
  };
  /**
   * The pricing-table block's own strings (spec `02-blocks.md` "Pricing table" → Keyboard &
   * accessibility): `mostPopular` is the `highlightLabel` field's own default, used only while
   * that optional field is empty; `included`/`notIncluded` are each read immediately before a
   * feature row's visible label (see `blocks/pricing-table/Block.vue`), so — the same "bake the
   * join into the hidden string" convention `@eldrajs/ui`'s own `VisuallyHidden` story uses for
   * its suffix example (`", 2 items"`) — both carry a trailing space of their own rather than
   * relying on template whitespace to add one; `includedIn` names each plan's own feature list
   * with the plan's name interpolated in; the last three are the two editor-only hints
   * (`EditorPlaceholder`, gated by `useEditing()`) for a freshly inserted table's empty heading,
   * intro and first plan (spec → States, "Empty (freshly inserted)").
   */
  pricing: {
    mostPopular: string;
    included: string;
    notIncluded: string;
    includedIn: string;
    headingHintLabel: string;
    introHintLabel: string;
    planHintLabel: string;
    planHintHelp: string;
  };
  /**
   * The newsletter block's own strings (spec `02-blocks.md` "Newsletter"): fallback copy for the
   * optional field label/placeholder/button/success-title fields (shown even before an editor
   * fills them in, per that section's "Empty (freshly inserted)" state), the two validation
   * messages (invalid email, backend failure) and the required-consent-checkbox message, plus the
   * heading/text editor-only hints and the `useRichTextScrollRegions` fallback table label for the
   * consent field, matching `splitContent.richTextTableLabel`/`faq.richTextTableLabel`.
   */
  newsletter: {
    emailLabel: string;
    emailPlaceholder: string;
    subscribe: string;
    subscribing: string;
    successTitle: string;
    consentCheckboxLabel: string;
    invalidEmail: string;
    failed: string;
    consentRequired: string;
    headingHintLabel: string;
    textHintLabel: string;
    richTextTableLabel: string;
  };
  /**
   * The contact block's own strings (spec `02-blocks.md` "Contact and map"): the four editor-only
   * hints for a freshly inserted block's empty parts (heading, intro, the whole details column,
   * the whole map area — see `blocks/contact/Block.vue`); the four detail-row labels
   * (`addressLabel`/`hoursLabel`/`phoneLabel`/`emailLabel`);
   * the map's fallback `<iframe title>` (with and without a known address); the form's own field
   * labels, validation messages, submit/help copy and the error summary's count-aware title; the
   * server-failure and success copy (`serverError`/`successTitle` take `{email}`/`{name}`); and the
   * two optional-field content defaults (`formTitleDefault`/`successTextDefault`, the design spec's
   * own fallback text for when an editor leaves those fields empty).
   */
  contact: {
    headingHintLabel: string;
    headingHintHelp: string;
    introHintLabel: string;
    detailsHintLabel: string;
    detailsHintHelp: string;
    mapHintLabel: string;
    mapHintHelp: string;
    addressLabel: string;
    hoursLabel: string;
    phoneLabel: string;
    emailLabel: string;
    mapTitle: string;
    mapTitleWithAddress: string;
    formTitleDefault: string;
    nameLabel: string;
    nameRequiredError: string;
    emailFieldLabel: string;
    emailInvalidError: string;
    orderNumberLabel: string;
    orderNumberPlaceholder: string;
    topicLabel: string;
    messageLabel: string;
    messageRequiredError: string;
    sendMessage: string;
    sending: string;
    replyTime: string;
    summaryTitleOne: string;
    summaryTitleMany: string;
    serverError: string;
    successTitle: string;
    successTextDefault: string;
    sendAnother: string;
  };
  /**
   * The video-embed block's own strings (spec `02-blocks.md` "Video embed"): the play button's
   * accessible name (`play`/`playWithDuration`, the latter used once `duration` parses), the
   * spoken duration built from `minuteOne`/`minuteMany`/`secondOne`/`secondMany` (never an English
   * literal like "minutes" written directly in the block), the privacy note's fallback copy, the
   * load-failure `EmptyState` title/text/link, and the editor-only hints for an empty heading,
   * intro and `videoUrl` (the last per that section's "Empty (freshly inserted)" state).
   */
  video: {
    play: string;
    playWithDuration: string;
    minuteOne: string;
    minuteMany: string;
    secondOne: string;
    secondMany: string;
    privacyNoteDefault: string;
    errorTitle: string;
    errorText: string;
    errorLink: string;
    headingHintLabel: string;
    introHintLabel: string;
    urlHintLabel: string;
    urlHintHelp: string;
  };
  /**
   * The timeline block's own strings (spec `02-blocks.md` "Timeline" → Keyboard & accessibility,
   * States): `step` is read immediately before each `steps`-variant item's visible title (see
   * `blocks/timeline/Block.vue`) — the same "bake the join into the hidden string" convention
   * `pricing.included` uses, so it carries its own trailing space rather than relying on template
   * whitespace to add one. The last four are the two editor-only hints (`EditorPlaceholder`, gated
   * by `useEditing()`) for a freshly inserted block's empty heading and empty item list (spec →
   * States, "Empty (freshly inserted)").
   */
  timeline: {
    step: string;
    headingHintLabel: string;
    headingHintHelp: string;
    itemHintLabel: string;
    itemHintHelp: string;
  };
  /**
   * The team block's own strings (spec `02-blocks.md` "Team"): each icon link's accessible-name
   * template (`{name}` interpolated, matching `footer.socialLinkName`'s own pattern), the photo
   * alt-text default, and the two editor-only hints (`EditorPlaceholder`, gated by `useEditing()`)
   * for a freshly inserted block's empty heading/intro/link and its first, still-empty person
   * (spec → States, "Empty (freshly inserted)").
   */
  team: {
    /** Default `alt` text for a person's photo, e.g. "Portrait of Ingrid Solberg". */
    portraitOf: string;
    /** Each icon link's accessible name, `{name}` interpolated — see `blocks/team/Block.vue`'s
     *  `NAME_KEYS`. The icons themselves stay `aria-hidden`. */
    onInstagram: string;
    emailPerson: string;
    website: string;
    onTiktok: string;
    onPinterest: string;
    headingHintLabel: string;
    headingHintHelp: string;
    itemHintLabel: string;
    itemHintHelp: string;
  };
  /**
   * The logo-cloud block's own strings (spec `02-blocks.md` "Logo cloud"): `linkContext` is the
   * accessible-name suffix appended to a linked logo's name (`LogoItem`'s own `linkContext` prop —
   * see `blocks/logo-cloud/Block.vue`), read verbatim so it carries its own leading space; the
   * other two are the editor-only hints (`EditorPlaceholder`, gated by `useEditing()`) for a
   * freshly inserted block's empty heading and an empty logo cell (spec → States, "Empty (freshly
   * inserted)").
   */
  logoCloud: {
    linkContext: string;
    headingHintLabel: string;
    headingHintHelp: string;
    itemHintLabel: string;
    itemHintHelp: string;
  };
  /**
   * The tabs block's own strings (spec `02-blocks.md` "Tabs" → States, "Empty (freshly inserted)",
   * line 2251): the required heading and optional intro's editor-only hints, the non-interactive
   * placeholder tab label ("Tab 1") shown with the placeholder panel when the whole `tabs` list is
   * empty, and `richTextTableLabel` — the `useRichTextScrollRegions` fallback label for an
   * uncaptioned table inside a tab's body, matching `faq.richTextTableLabel` (see
   * `blocks/tabs/Block.vue`).
   */
  tabsBlock: {
    headingHintLabel: string;
    introHintLabel: string;
    tabPlaceholderLabel: string;
    itemHintLabel: string;
    itemHintHelp: string;
    richTextTableLabel: string;
  };
  /**
   * The quote block's own strings (spec `02-blocks.md` "Quote" → Field → layout mapping, States):
   * `headingFor` names the visually hidden `h2` that labels the section ("Quote from {name}",
   * interpolated the same way `footer.socialLinkName` is), and the other three are its editor-only
   * hints (`EditorPlaceholder`, gated by `useEditing()`) — `quoteHintLabel`/`quoteHintHelp` for a
   * freshly inserted, still-empty quote (spec States → "Empty (freshly inserted)": "Add a quote" /
   * "Then the name and role or source"), and `nameHintLabel` for the name once the quote itself has
   * been filled in (see `blocks/quote/Block.vue`).
   */
  quote: {
    headingFor: string;
    quoteHintLabel: string;
    quoteHintHelp: string;
    nameHintLabel: string;
  };
  /**
   * The article block's own strings (spec `02-blocks.md` "Article"): `byline` is the header's "By
   * {name}" template — the same interpolation shape as `footer.socialLinkName` — with the name
   * split back out of the interpolated result so it can render inside its own `<Link>` (see
   * `blocks/article/Block.vue`'s own comment). `richTextTableLabel` is the fallback
   * `useRichTextScrollRegions` label for an uncaptioned table, same pattern as
   * `faq.richTextTableLabel`. The rest are the editor-only hints (`EditorPlaceholder`, gated by
   * `useEditing()`) named in spec → States, "Empty (freshly inserted)".
   */
  article: {
    byline: string;
    metaHintLabel: string;
    titleHintLabel: string;
    dekHintLabel: string;
    coverHintLabel: string;
    coverHintHelp: string;
    bodyHintLabel: string;
    bodyHintHelp: string;
    authorHintLabel: string;
    authorHintHelp: string;
    richTextTableLabel: string;
  };
  /**
   * The image block's own editor-only hints (spec `02-blocks.md` "Image" → States, "Empty
   * (freshly inserted)"), gated by `useEditing()` like every other block's own hints: `hintLabel`/
   * `hintHelp` for the photo-icon placeholder shown with no image chosen yet, and
   * `captionHintLabel` for the muted caption placeholder shown beside it (see
   * `blocks/image/Block.vue`).
   */
  imageBlock: {
    hintLabel: string;
    hintHelp: string;
    captionHintLabel: string;
  };
  /**
   * The rich-text block's own strings (spec `02-blocks.md` "Rich text" → States, "Empty (freshly
   * inserted)", line 2994): editor-only hints (`EditorPlaceholder`, gated by `useEditing()`) for
   * the optional heading ("Add a heading" / "Optional") and the required body ("Start writing" /
   * "Type / for headings, lists, quotes and links."). `richTextTableLabel` is the fallback
   * `useRichTextScrollRegions` label for an uncaptioned table, should the body ever contain one
   * (the field's own toolbar has no table control today) — same pattern as `faq.richTextTableLabel`
   * (see `blocks/rich-text/Block.vue`).
   */
  richTextBlock: {
    headingHintLabel: string;
    headingHintHelp: string;
    bodyHintLabel: string;
    bodyHintHelp: string;
    richTextTableLabel: string;
  };
  /**
   * The trust-strip block's own strings: the hidden `h2` labelling the section, the accessible
   * name for the `mobileLayout: "scroll"` scrolling region and for the payment marks list, the
   * four payment brand names (`apple-pay` renders the `brand-apple` icon but keeps this name — see
   * `blocks/trust-strip/Block.vue`), and the editor-only hint for a still-empty item (spec
   * `02-blocks.md` "Trust strip" → States, "Empty (freshly inserted)").
   */
  trust: {
    title: string;
    scrollRegion: string;
    payments: string;
    visa: string;
    mastercard: string;
    paypal: string;
    applePay: string;
    itemHintLabel: string;
    itemHintHelp: string;
  };
  /**
   * The article-list block's own strings (spec `02-blocks.md` "Article list" → Field → layout
   * mapping, Keyboard & accessibility): `filterNav` labels the category-chip `<nav>` and `pages`
   * labels `@eldrajs/ui`'s `Pagination`. `headingHintLabel`/`headingHintHelp` are the editor-only
   * hint for an empty heading (`EditorPlaceholder`, gated by `useEditing()`), the same shape as
   * every other rebuilt block's own heading hint; `itemsHintLabel`/`itemsHintHelp` are the spec's
   * "Empty (freshly inserted)" source hint, shown instead while `items` is empty (see
   * `blocks/article-list/Block.vue`'s own comment for why the live site falls to `emptyTitle`
   * instead of the spec's literal "shows the latest stories straight away").
   */
  articleList: {
    filterNav: string;
    pages: string;
    headingHintLabel: string;
    headingHintHelp: string;
    itemsHintLabel: string;
    itemsHintHelp: string;
  };
  /**
   * The collection header block's own strings (spec `02-blocks.md` "Collection header"):
   * `readMore`/`readLess` label the description's disclosure button; `countOne`/`countMany`
   * follow the same pluralisation shape as `header.cartOne`/`cartMany` for the store's live
   * product count ("1 product" / "{count} products" — the count itself always comes from
   * `useStorefront().catalog.collection()`, never a field); `subcollections` is the accessible
   * name of the sub-collection pill list. `titleHintLabel`/`titleHintHelp` are the one editor-only
   * hint this block needs (`EditorPlaceholder`, gated by `useEditing()`): the title otherwise
   * always resolves from the field or the store, so this only shows when neither has anything at
   * all (e.g. a block with no bound collection and no title of its own).
   */
  collection: {
    readMore: string;
    readLess: string;
    countOne: string;
    countMany: string;
    subcollections: string;
    titleHintLabel: string;
    titleHintHelp: string;
  };
  /**
   * The product-carousel block's own strings (spec `02-blocks.md` "Product carousel"):
   * `viewAllContext` is a visually hidden suffix appended right after the visible "View all" text
   * (the same "bake the join into the hidden string" convention `pricing.included`/`timeline.step`
   * use, so it carries its own leading space) — the block has no structured collection-name field
   * to quote the spec's own illustrative "View all knitwear", so this names the content generically
   * instead. `clearHistory` is the `recently-viewed` variant's own button, replacing the View all
   * link. The last two are the editor-only hint (`EditorPlaceholder`, gated by `useEditing()`) for
   * a freshly inserted block's empty required heading (spec → States, "Empty (freshly inserted)").
   */
  productCarousel: {
    viewAllContext: string;
    clearHistory: string;
    headingHintLabel: string;
    headingHintHelp: string;
  };
  /**
   * The collection-grid block's own strings (spec `02-blocks.md` "Collection grid", 3047-3170).
   * Everything the block writes itself: the `<section>` label naming the collection
   * (`sectionLabel`), the grid's visually hidden `h2` (`products`), the filter groups' hidden
   * `<legend>`s (`legend*`) and their count badge (`nSelected`), the price range's own labels
   * (`minLabel`/`maxLabel`, the decorative `pricePrefix`, the word `to` between the two inputs) and
   * the "Show all 14" link for a group with 12 or more values (`showAllValues`); the Filter button
   * (`filter`) with its count badge (`nActive`), the sidebar landmark (`filters`), the active-filter
   * list (`activeFilters`, `removeFilter`, `clearAll`); the polite result count, pluralised the way
   * `header.cartOne`/`cartMany` are (`oneProduct`/`nProducts`) and its filtering state
   * (`updating`); `productsNoun` for `LoadMore`'s own "Showing 6 of 48 products" line and
   * `pagination` for the `Pagination` landmark; the drawer's apply button (`showNProducts`); the
   * empty-results sentence naming the active filters (`nothingIn`) and its button
   * (`clearFilters`); the Sort by / Columns select labels and the five sort option names used when
   * a `sortOptions[].label` is empty; `price` as the price group's own title (every other group
   * falls back to the store's own facet label); and the editor-only hint shown when no collection
   * is bound (spec States, "Empty (freshly inserted)").
   */
  grid: {
    sectionLabel: string;
    products: string;
    nSelected: string;
    legendCategory: string;
    legendSize: string;
    legendColour: string;
    legendPrice: string;
    legendAvailability: string;
    price: string;
    to: string;
    minLabel: string;
    maxLabel: string;
    pricePrefix: string;
    showAllValues: string;
    filter: string;
    nActive: string;
    filters: string;
    activeFilters: string;
    removeFilter: string;
    clearAll: string;
    updating: string;
    oneProduct: string;
    nProducts: string;
    productsNoun: string;
    pagination: string;
    showNProducts: string;
    nothingIn: string;
    noResultsTitle: string;
    clearFilters: string;
    sortBy: string;
    sortFeatured: string;
    sortBestSelling: string;
    sortPriceAsc: string;
    sortPriceDesc: string;
    sortNewest: string;
    columns: string;
    noCollectionLabel: string;
    noCollectionHelp: string;
  };
}

/** Every dotted leaf key of `Messages` — `'notFound.eyebrow'`, `'loading'`, … */
type DottedKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DottedKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = DottedKeys<Messages>;
