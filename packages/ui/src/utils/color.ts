/**
 * A CSS `color-mix()` of `color` shifted `percent` toward `toward`, in the
 * perceptual oklab space.
 *
 * States that the design spec describes as "darker"/"lighter" than a token
 * (hover and active fills, subtle separators) are expressed this way rather
 * than as new colour tokens: a store restyles by setting one variable and
 * every derived state follows. Components use the result inside an arbitrary
 * Tailwind value, e.g. `bg-[color-mix(...)]`.
 */
export function mixToward(color: string, toward: string, percent: number): string {
  return `color-mix(in oklab, ${color}, ${toward} ${percent}%)`;
}
