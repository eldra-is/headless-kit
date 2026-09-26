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
}

/** Every dotted leaf key of `Messages` — `'notFound.eyebrow'`, `'loading'`, … */
type DottedKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DottedKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = DottedKeys<Messages>;
