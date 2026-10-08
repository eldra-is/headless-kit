import { inject, provide, reactive, type InjectionKey } from 'vue';
import type { BridgePayloads } from '@eldrajs/theme-core/bridge';
import type { LinkTargetInfo } from '@eldrajs/theme-core/links';
import { EMPTY_THEME_MESSAGES, type ThemeMessages } from '@eldrajs/theme-core/i18n';
import {
  normalizeThemeDesignTokens,
  type EldraClient,
  type PageLike,
  type RichTextFieldIdentity,
  type RouteTemplateLike,
  type ThemeDesignTokens,
} from '@eldrajs/theme-core';

/**
 * One rendered editor slot marker's geometry. Derives from the bridge payload
 * type so the wire format stays the single source of truth.
 */
export type SlotGeometry = BridgePayloads['theme:slots-rendered']['slots'][number];

export type SlotGeometryReporter = (slots: SlotGeometry[]) => void;

/**
 * What `resolveLink` needs, as one reactive slice of the theme context: the
 * site's pages and route templates, and what it knows about the objects its
 * links point at, keyed `${_type}:${id}`. An adapter fills it where it already
 * resolves the route — one place, one read per type — so a prerendered page
 * carries every href in its payload.
 */
export interface EldraLinkState {
  pages: PageLike[];
  templates: RouteTemplateLike[];
  targets: Map<string, LinkTargetInfo>;
}

/**
 * Which content locale the page a visitor is looking at is, and what the others are — the slice an
 * adapter fills from the site's own routing so a **block** can read it without reaching for the
 * router or the runtime config.
 *
 * It lives on the theme context rather than in a framework composable for the same reason the link
 * state does: a block must render in a Storybook story and a unit test with no Nuxt around it, so
 * everything it needs arrives through one `inject`. `useEldraLocale()` is the accessor.
 *
 * `path` is the one every link goes through and it is **idempotent** — see the adapter's own
 * implementation (`@eldrajs/theme-nuxt`'s `localeHref`): a destination can pass through more than
 * one prefixer, and a second prefix would produce a path nothing on the site answers.
 */
export interface EldraLocaleState {
  /**
   * The active content locale, or `null` on a site that configures none. In a Studio preview this
   * is the locale the editor is driving, which wins over the one the path names.
   */
  active: string | null;
  /** The locale served at `/`, unprefixed. `null` on a site that configures none. */
  defaultLocale: string | null;
  /** Every locale the site serves, `defaultLocale` first. Empty on a site that configures none. */
  supported: readonly string[];
  /**
   * One locale's name **in that locale** — "íslenska (Ísland)", "American English" — for a language
   * switcher's option label, with the tag itself as the fallback.
   *
   * It is on the state rather than left to the caller because the answer is ICU data and a renderer
   * and a browser do not always have the same of it: Node answers "íslenska (Ísland)" for `is-IS`
   * where a reduced-ICU browser build answers "Icelandic (Iceland)". An adapter therefore resolves
   * these **once, on the server**, and carries them to the browser, so a switcher that renders one
   * does not hydrate into a mismatch and repaint.
   */
  name: (locale: string) => string;
  /**
   * One same-site destination (`/products/x`, `/search?q=mug`) under the active locale. Anything
   * that is not a path on this site — an absolute URL, `mailto:`, `#main` — and anything already
   * spelled in one of the site's locales comes back untouched.
   */
  path: (href: string) => string;
  /** The page the visitor is on, spelled in `locale`. The default locale's spelling has no prefix. */
  switchPath: (locale: string) => string;
  /** Go to `switchPath(locale)` — what a language switcher calls when its value changes. */
  select: (locale: string) => void;
}

export interface EldraContext {
  client: EldraClient;
  links: EldraLinkState;
  /**
   * Optional so a context assembled before locales existed still type-checks and still renders:
   * every reader treats its absence as "one unprefixed site, no switcher", which is what such a
   * site is.
   */
  locales?: EldraLocaleState;
  /**
   * The theme's resolved message catalogue — the manifest's own `messages` block (or the K1
   * fallback, `{ defaultLocale: 'en-US', locales: {} }`, for a theme that ships no `i18n/`
   * directory), merged with the platform's own overrides and resolved over the organisation's
   * locales at build time (`@eldrajs/theme-nuxt`'s module, `@eldrajs/theme-core/i18n`'s
   * `mergeMessageCatalogues`/`resolveMessageCatalogue`). Flat dotted keys, one record per locale
   * tag — the starter's `vue-i18n` plugin (K3) is the one consumer that unflattens it.
   *
   * Reactive so a live `editor:theme-messages` push from Studio's preview (`useEldraPreview`)
   * updates every block reading a message through it with no re-render plumbing of its own.
   */
  messages: ThemeMessages;
  preview: {
    active: boolean;
    mode: 'preview' | 'edit';
    locale: string | null;
    sourceDrafts: Record<string, Record<string, unknown>>;
    drafts: Record<string, Record<string, unknown>>;
    draftSchemaApiIds: Record<string, string>;
    refreshRevision: number;
    revision: number;
    designTokensRevision: number;
    /**
     * The revision of the last `editor:theme-messages` push applied to `context.messages`.
     * Mirrors `designTokensRevision`'s role: a push whose `revision` is not strictly greater than
     * this is stale (an out-of-order delivery, a reconnect replay) and is ignored rather than
     * rolling a live edit backwards.
     */
    messagesRevision: number;
    /**
     * Bumped every time `editor:init` carries a preview token that differs
     * from the one before it — so a consumer can tell "the editor handed me a
     * *new* token" apart from "the editor sent another content update"
     * (`refreshRevision` bumps for both). `useEldraPage` reads it to decide
     * whether a 401 is the first failure of a token, which the editor may
     * still recover from, or the failure of a token it has already replaced,
     * which is the operator's to see.
     */
    tokenRevision: number;
    /**
     * Negotiated from the editor's editor:hello capabilities (the
     * `block-slots` capability), re-negotiated on every hello. Gates the
     * editor-only slot markers, which `EldraLayout` renders — the one
     * negotiated capability a Vue component has to read.
     *
     * The `image-framing` and `rich-text-inline` gates are deliberately not
     * mirrored here: theme-core's preview message router negotiates them and
     * forwards them straight to the overlay runtime
     * (`setFramingEnabled`/`setRichTextEnabled`), so there is one owner per
     * capability rather than one per framework binding.
     */
    editorSupportsSlots: boolean;
    /**
     * §18 v3: bumped once for every change theme-core reports through
     * `onRichTextRenderState`, so a rich-text field re-evaluates whether its
     * render is deferred. It is only a change signal — the answer itself is
     * `isRichTextRenderDeferred`, which is core's, not a mirror of it.
     */
    richTextRenderRevision: number;
    /**
     * §18 v3: theme-core's predicate, installed by startEldraPreview. While it
     * answers true for a field, the browser owns that field's DOM (a native
     * text op is in flight) and the renderer must not replace it. Undefined in
     * static output and outside a preview, where nothing is ever deferred.
     */
    isRichTextRenderDeferred?: (identity: RichTextFieldIdentity) => boolean;
    /**
     * Installed by startEldraPreview; posts bounded theme:slots-rendered
     * geometry over the bridge. Undefined in static output.
     */
    slotGeometryReporter?: SlotGeometryReporter;
  };
  designTokens: ThemeDesignTokens;
}

export const ELDRA_KEY: InjectionKey<EldraContext> = Symbol.for(
  'eldra.themeContext'
) as InjectionKey<EldraContext>;

/**
 * The preview slice of a fresh theme context, reactive and complete. Every
 * adapter that assembles an `EldraContext` by hand — theme-nuxt's runtime
 * plugin, or an equivalent entry for another framework — must build it from
 * here: the hand-written literal had already drifted several fields behind
 * this interface, and a missing field is a runtime error rather than a type
 * error once the object is assembled elsewhere.
 */
export function createEldraPreviewState(): EldraContext['preview'] {
  return reactive({
    active: false,
    mode: 'preview',
    locale: null,
    sourceDrafts: {},
    drafts: {},
    draftSchemaApiIds: {},
    refreshRevision: 0,
    revision: 0,
    designTokensRevision: 0,
    messagesRevision: 0,
    tokenRevision: 0,
    editorSupportsSlots: false,
    richTextRenderRevision: 0,
    isRichTextRenderDeferred: undefined,
    slotGeometryReporter: undefined,
  });
}

/**
 * The link slice of a fresh theme context, reactive and empty. Built here for
 * the same reason `createEldraPreviewState` is: a missing field is a runtime
 * error rather than a type error once the object is assembled elsewhere.
 */
/**
 * The locale slice of a context with no router behind it — a Storybook story, a unit-test mount, a
 * site whose organisation configures no locales. Every answer is the one-unprefixed-site answer,
 * so a block written against `useEldraLocale()` renders identically in all three.
 *
 * An adapter that *has* routing builds its own (see `@eldrajs/theme-nuxt`'s runtime plugin): the
 * active locale and the paths are derived from the route, which this layer knows nothing about.
 */
export function createEldraLocaleState(): EldraLocaleState {
  return reactive({
    active: null,
    defaultLocale: null,
    supported: [] as readonly string[],
    // The tag, not `Intl.DisplayNames`: this state serves no locales, so nothing asks — and a
    // renderer-dependent answer has no business in the shape a test and a story share.
    name: (locale: string) => locale,
    path: (href: string) => href,
    switchPath: () => '/',
    select: () => {},
  });
}

export function createEldraLinkState(): EldraLinkState {
  return reactive({ pages: [], templates: [], targets: new Map<string, LinkTargetInfo>() });
}

export function provideEldra(opts: {
  client: EldraClient;
  designTokens?: unknown;
  /** Defaults to the K1 fallback (`{ defaultLocale: 'en-US', locales: {} }`) — a Storybook mount
   * or a unit test that does not pass one renders exactly as a theme with no `i18n/` directory
   * does. An adapter with a real build (`@eldrajs/theme-nuxt`'s runtime plugin) passes the
   * resolved `virtual:eldra/messages` content instead. */
  messages?: ThemeMessages;
}): EldraContext {
  const context: EldraContext = {
    client: opts.client,
    designTokens: reactive(normalizeThemeDesignTokens(opts.designTokens ?? { colors: {} })),
    messages: reactive(opts.messages ?? EMPTY_THEME_MESSAGES) as ThemeMessages,
    links: createEldraLinkState(),
    // The one-unprefixed-site state. A provider with real routing behind it (an adapter's own
    // plugin) replaces it; a story or a test keeps it, and every block then renders the same
    // markup it does on a single-locale site.
    locales: createEldraLocaleState(),
    preview: createEldraPreviewState(),
  };
  provide(ELDRA_KEY, context);
  return context;
}

export function useEldra(): EldraContext {
  const context = inject(ELDRA_KEY);
  if (context === undefined) {
    throw new Error('[eldra] useEldra() called without provideEldra() in an ancestor');
  }
  return context;
}
