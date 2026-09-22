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
  gallery: {
    previous: string;
    next: string;
    imageOf: string;
    open: string;
  };
  dialog: {
    close: string;
  };
  rating: {
    outOf: string;
  };
  price: {
    was: string;
    now: string;
  };
  carousel: {
    previous: string;
    next: string;
    slideOf: string;
  };
}

/** Every dotted leaf key of `Messages` — `'notFound.eyebrow'`, `'loading'`, … */
type DottedKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DottedKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = DottedKeys<Messages>;
