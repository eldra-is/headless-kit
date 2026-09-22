/**
 * Shared Tailwind class recipes for the `Ui*` primitives (`app/components/ui/**`)
 * and, later, the rebuilt blocks. Centralised here so every interactive
 * element gets the same focus ring and every button gets the same base
 * shape, instead of each component re-deriving its own utility string.
 */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';
export const buttonBase = `inline-flex items-center justify-center gap-2 rounded-theme-md font-medium transition-colors motion-safe:duration-150 disabled:pointer-events-none disabled:opacity-50 ${focusRing}`;
export const buttonVariants = {
  primary: 'bg-primary text-primary-contrast hover:bg-primary/90',
  secondary: 'bg-accent text-accent-contrast hover:bg-accent/90',
  outline: 'border border-border bg-transparent text-text hover:bg-surface',
  ghost: 'bg-transparent text-text hover:bg-surface',
  link: 'bg-transparent text-primary underline-offset-4 hover:underline',
} as const;
export const buttonSizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-base',
  lg: 'h-12 px-6 text-lg',
} as const;
export const inputBase = `block w-full rounded-theme-md border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted aria-invalid:border-danger ${focusRing}`;
