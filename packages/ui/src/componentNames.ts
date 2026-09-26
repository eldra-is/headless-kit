/**
 * The components `src/index.ts` exports from its root entry, unprefixed, exactly as `Object.keys`
 * would read them at runtime. Hand-maintained rather than generated: a generator would need its
 * own build step ahead of `vite build` (see `packages/ui/package.json`'s `build` script) for a
 * list of names that changes at most once per component, ever — `src/__tests__/componentNames.spec.ts`
 * guards this list against drift by importing `src/index.ts` and comparing its component keys
 * against this array, so an added or renamed component fails a test here rather than silently
 * missing the resolver.
 *
 * `src/resolver.ts` is the reader: `EldraUiResolver` resolves `<prefix><Name>` for every name here.
 *
 * The `./vee-validate` entry's `Form` and `Field*` components are deliberately **not** here, and
 * `FieldWrapper` — which is a root-entry layout component, not one of them — is the only name
 * beginning with "Field" that belongs in this list. Resolving `<EldraFieldInput>` would auto-import
 * it from `@eldrajs/ui`, where it does not exist, and would pull an optional peer into a project
 * that never installed it. `src/__tests__/veeValidateIsolation.spec.ts` asserts both halves.
 */
export const componentNames = [
  'Avatar',
  'AvatarGroup',
  'Badge',
  'Button',
  'ButtonGroup',
  'Checkbox',
  'CheckboxGroup',
  'Container',
  'Chip',
  'ChipGroup',
  'ContentCard',
  'CurrencyInput',
  'EditorPlaceholder',
  'EmptyState',
  'FeatureCard',
  'FieldWrapper',
  'FormLayout',
  'Icon',
  'Image',
  'Input',
  'Link',
  'LogoItem',
  'MultiSelect',
  'Price',
  'ProductCard',
  'QuantityStepper',
  'RadioGroup',
  'Rating',
  'SearchBar',
  'Section',
  'Select',
  'Skeleton',
  'StockBadge',
  'Switch',
  'Textarea',
  'UnitInput',
  'VariantPicker',
  'VisuallyHidden',
] as const;

export type ComponentName = (typeof componentNames)[number];
