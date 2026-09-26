// Public entry for @eldrajs/ui. Components are exported unprefixed and are not
// registered globally; `@eldrajs/ui/resolver` does that for consumers who want
// `<EldraButton>`.

// Components
export { default as Avatar } from './components/avatar/Avatar.vue';
export { default as AvatarGroup } from './components/avatar/AvatarGroup.vue';
export { default as Badge } from './components/badge/Badge.vue';
export { default as StockBadge } from './components/badge/StockBadge.vue';
export { default as Button } from './components/button/Button.vue';
export { default as ButtonGroup } from './components/button/ButtonGroup.vue';
export { default as Checkbox } from './components/checkbox/Checkbox.vue';
export { default as CheckboxGroup } from './components/checkbox/CheckboxGroup.vue';
export { default as CurrencyInput } from './components/currency-input/CurrencyInput.vue';
export { default as FieldWrapper } from './components/field-wrapper/FieldWrapper.vue';
export { default as FormLayout } from './components/form-layout/FormLayout.vue';
export { default as Icon } from './components/icon/Icon.vue';
export { default as Image } from './components/image/Image.vue';
export { default as Input } from './components/input/Input.vue';
export { default as Link } from './components/link/Link.vue';
export { default as LogoItem } from './components/logo-item/LogoItem.vue';
export { default as MultiSelect } from './components/select/MultiSelect.vue';
export { default as Price } from './components/price/Price.vue';
export { default as QuantityStepper } from './components/quantity-stepper/QuantityStepper.vue';
export { default as RadioGroup } from './components/radio/RadioGroup.vue';
export { default as Rating } from './components/rating/Rating.vue';
export { default as SearchBar } from './components/search-bar/SearchBar.vue';
export { default as Select } from './components/select/Select.vue';
export { default as Skeleton } from './components/skeleton/Skeleton.vue';
export { default as Switch } from './components/switch/Switch.vue';
export { default as Textarea } from './components/textarea/Textarea.vue';
export { default as UnitInput } from './components/unit-input/UnitInput.vue';
export { default as VariantPicker } from './components/variant-picker/VariantPicker.vue';
export { default as VisuallyHidden } from './components/visually-hidden/VisuallyHidden.vue';

// Component types
export type {
  AvatarGroupPart,
  AvatarGroupPerson,
  AvatarGroupProps,
  AvatarPart,
  AvatarProps,
  AvatarSize,
} from './components/avatar/types';
export type {
  BadgePart,
  BadgeProps,
  BadgeTone,
  BadgeVariant,
  StockBadgePart,
  StockBadgeProps,
  StockLevel,
} from './components/badge/types';
export type {
  ButtonGroupPart,
  ButtonGroupProps,
  ButtonPart,
  ButtonProps,
  ButtonSize,
  ButtonVariant,
} from './components/button/types';
export type {
  CheckboxGroupLayout,
  CheckboxGroupOption,
  CheckboxGroupPart,
  CheckboxGroupProps,
  CheckboxPart,
  CheckboxProps,
  CheckboxSize,
} from './components/checkbox/types';
export type { CurrencyInputPart, CurrencyInputProps } from './components/currency-input/types';
export type {
  FieldWrapperCounter,
  FieldWrapperPart,
  FieldWrapperProps,
} from './components/field-wrapper/types';
export type {
  FormLayoutHeadingLevel,
  FormLayoutPart,
  FormLayoutProps,
  FormLayoutSubmitPayload,
  FormLayoutVariant,
} from './components/form-layout/types';
export type { IconComponent, IconPart, IconProps, IconSize } from './components/icon/types';
export type { ImageMedia, ImagePart, ImageProps, ImageRatio } from './components/image/types';
export type { InputPart, InputProps, InputSize, InputType } from './components/input/types';
export type { LinkPart, LinkProps, LinkTone, LinkVariant } from './components/link/types';
export type { LogoItemPart, LogoItemProps } from './components/logo-item/types';
export type {
  RadioGroupLayout,
  RadioGroupOption,
  RadioGroupPart,
  RadioGroupProps,
  RadioGroupSize,
} from './components/radio/types';
export type { RatingPart, RatingProps, RatingSize } from './components/rating/types';
export type {
  MultiSelectPart,
  MultiSelectProps,
  SelectOption,
  SelectPart,
  SelectPlacement,
  SelectProps,
  SelectSize,
} from './components/select/types';
export type {
  SearchBarPart,
  SearchBarProps,
  SearchBarSize,
  SearchResultItem,
  SearchResults,
  SearchResultType,
  SearchRow,
  SearchSection,
  SearchSelectType,
} from './components/search-bar/types';
export type { PricePart, PriceProps, PriceSize } from './components/price/types';
export type {
  QuantityStepperPart,
  QuantityStepperProps,
  QuantityStepperSize,
} from './components/quantity-stepper/types';
export type { SkeletonPart, SkeletonProps, SkeletonVariant } from './components/skeleton/types';
export type { SwitchPart, SwitchProps, SwitchSize } from './components/switch/types';
export type { TextareaPart, TextareaProps } from './components/textarea/types';
export type { UnitInputPart, UnitInputProps } from './components/unit-input/types';
export type {
  VariantPickerOption,
  VariantPickerPart,
  VariantPickerProps,
  VariantPickerType,
} from './components/variant-picker/types';
export type { VisuallyHiddenPart, VisuallyHiddenProps } from './components/visually-hidden/types';

// Messages
export { defaultMessages, enUS } from './messages';
export {
  MESSAGES_KEY,
  provideEldraUiMessages,
  useMessages,
  type UiMessages,
} from './composables/useMessages';

// The number locale, the same provide/inject shape as the messages: `UnitInput`, `CurrencyInput`
// and `QuantityStepper` format with it unless their own `locale` prop says otherwise.
export {
  CURRENCY_KEY,
  DEFAULT_UI_CURRENCY,
  DEFAULT_UI_LOCALE,
  LOCALE_KEY,
  provideEldraUiCurrency,
  provideEldraUiLocale,
  useEldraUiCurrency,
  useEldraUiLocale,
} from './composables/useLocale';

// Composables
export { useControllableModel } from './composables/useControllableModel';
export {
  useFloating,
  type FloatingPlacement,
  type UseFloatingOptions,
  type UseFloatingReturn,
} from './composables/useFloating';
export {
  useOverlay,
  type UseOverlayOptions,
  type UseOverlayReturn,
} from './composables/useOverlay';
// The listbox keyboard, shared by `Select` and (next) `MultiSelect`: the active row, arrow
// movement that skips disabled and filtered-out rows, `PageUp`/`PageDown`, `Home`/`End`,
// `Alt+ArrowUp`, `Escape` clearing a query first, `Tab` closing, and type-ahead with a 0.6s buffer.
export {
  normalizeText,
  useListbox,
  type ListboxOption,
  type UseListboxOptions,
  type UseListboxReturn,
} from './components/select/useListbox';
// The open/closed life of a non-modal popup anchored to a control: the "only one open at a time"
// registry, `useOverlay`'s closing rules, `useFloating`'s position and entrance variables, and the
// label-forwarded-click latch. `Select`, `MultiSelect` and `SearchBar` all open their panel with it.
export {
  usePopover,
  type UsePopoverOptions,
  type UsePopoverReturn,
} from './components/select/usePopover';

// Form context. A `FormLayout` provides it; every Button below reads it, so a submitting form
// shows its primary action loading and every other action disabled.
export { FORM_LAYOUT_KEY, FORM_SUBMITTING_KEY } from './components/form-layout/context';

// Field context. A `FieldWrapper` provides it; the controls inside it read their `id`,
// `aria-describedby`, invalid and required state from it, so a bare `<Input />` needs no wiring.
export { FIELD_KEY, type FieldContext } from './components/field-wrapper/context';

// Styling helpers, so a consumer composing its own wrapper merges classes the
// same way the components do.
export { cx, partClass, type ClassValue } from './utils/cx';
export { mixToward } from './utils/color';
export { joinIds, useUiId } from './utils/id';
export { applyMask, defaultCharacterMeaning, stripMask } from './utils/mask';
export {
  createNumberFormat,
  currencyFractionDigits,
  formatNumber,
  localeSeparators,
  parseLocaleNumber,
  type NumberFormatOptions,
} from './utils/number-format';
// The `beforeinput` filter that keeps a numeric text field numeric, used by `QuantityStepper` —
// exported for a consumer building a numeric control of their own.
export { filterNumericBeforeInput, type NumericInputFilterOptions } from './utils/numeric-input';
