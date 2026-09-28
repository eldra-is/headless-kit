<!--
  The one spinner shape in this package: a 1.125rem-per-`size` circle with a quarter-turn arc in
  the current text colour, turning once every 700ms (spec "Button" → Behaviour & motion). With
  reduced motion it pulses at 60–100% opacity instead of turning — the `animate-eldra-spin` /
  `motion-reduce:animate-eldra-pulse` pair from `tailwind.css`, whose two timings are the only
  durations in the package that do not read a `--eldra-duration-*` token (the reduced-motion rule
  in `tokens.css` zeroes those, which would stop the pulse as well).

  Internal: it is not exported from `src/index.ts` and takes no props — `Button`, `LoadMore`,
  `Price` and `StockBadge` each size and colour it with a plain `class`, which Vue merges onto the
  `<svg>` below. It exists because those four drew the identical SVG by hand, and a fifth copy
  (`Price`'s own inline spinner) is what made the duplication worth naming. The `viewBox` is 18
  units wide so `stroke-width="2"` renders as exactly 2px at the 1.125rem size `Button` draws it
  at; every other size scales with it.

  It is decorative in every one of those four: the state it belongs to is announced by the
  component's own `aria-busy` and live region, never by this shape, so it is `aria-hidden` here
  rather than at each call site.
-->
<template>
  <svg
    class="animate-eldra-spin motion-reduce:animate-eldra-pulse"
    viewBox="0 0 18 18"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="2" stroke-opacity="0.3" />
    <path d="M17 9a8 8 0 0 0-8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>
