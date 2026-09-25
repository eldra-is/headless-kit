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
 */
export const componentNames = [
  'Button',
  'ButtonGroup',
  'Checkbox',
  'CheckboxGroup',
  'FieldWrapper',
  'FormLayout',
  'Icon',
  'Input',
  'Link',
  'MultiSelect',
  'QuantityStepper',
  'RadioGroup',
  'SearchBar',
  'Select',
  'Switch',
  'Textarea',
  'VariantPicker',
  'VisuallyHidden',
] as const;

export type ComponentName = (typeof componentNames)[number];
