// Public entry for @eldrajs/ui. Components are exported unprefixed and are not
// registered globally; `@eldrajs/ui/resolver` does that for consumers who want
// `<EldraButton>`.

// Components. Alphabetical by exported name (guarded by `src/__tests__/componentNames.spec.ts`,
// which compares this list's keys against the hand-maintained `componentNames` array sorted) —
// not grouped by source file, so `StockBadge`/`ContentCard`+`FeatureCard`/`Select` sit at their
// own alphabetical position rather than beside the sibling component that shares their file.
export { default as Accordion } from './components/accordion/Accordion.vue';
export { default as AccordionItem } from './components/accordion/AccordionItem.vue';
export { default as Avatar } from './components/avatar/Avatar.vue';
export { default as AvatarGroup } from './components/avatar/AvatarGroup.vue';
export { default as Badge } from './components/badge/Badge.vue';
export { default as Breadcrumb } from './components/breadcrumb/Breadcrumb.vue';
export { default as Button } from './components/button/Button.vue';
export { default as ButtonGroup } from './components/button/ButtonGroup.vue';
export { default as Carousel } from './components/carousel/Carousel.vue';
export { default as Checkbox } from './components/checkbox/Checkbox.vue';
export { default as CheckboxGroup } from './components/checkbox/CheckboxGroup.vue';
export { default as Chip } from './components/chip/Chip.vue';
export { default as ChipGroup } from './components/chip/ChipGroup.vue';
export { default as Container } from './components/container/Container.vue';
export { default as ContentCard } from './components/card/ContentCard.vue';
export { default as CurrencyInput } from './components/currency-input/CurrencyInput.vue';
export { default as Dialog } from './components/dialog/Dialog.vue';
export { default as Drawer } from './components/drawer/Drawer.vue';
export { default as EditorPlaceholder } from './components/empty-state/EditorPlaceholder.vue';
export { default as EmptyState } from './components/empty-state/EmptyState.vue';
export { default as FeatureCard } from './components/card/FeatureCard.vue';
export { default as FieldWrapper } from './components/field-wrapper/FieldWrapper.vue';
export { default as FormLayout } from './components/form-layout/FormLayout.vue';
export { default as Icon } from './components/icon/Icon.vue';
export { default as Image } from './components/image/Image.vue';
export { default as Input } from './components/input/Input.vue';
export { default as Lightbox } from './components/lightbox/Lightbox.vue';
export { default as Link } from './components/link/Link.vue';
export { default as LoadMore } from './components/load-more/LoadMore.vue';
export { default as LogoItem } from './components/logo-item/LogoItem.vue';
export { default as MultiSelect } from './components/select/MultiSelect.vue';
export { default as Pagination } from './components/pagination/Pagination.vue';
export { default as Popover } from './components/popover/Popover.vue';
export { default as Price } from './components/price/Price.vue';
export { default as ProductCard } from './components/product-card/ProductCard.vue';
export { default as QuantityStepper } from './components/quantity-stepper/QuantityStepper.vue';
export { default as RadioGroup } from './components/radio/RadioGroup.vue';
export { default as RangeSlider } from './components/range-slider/RangeSlider.vue';
export { default as Rating } from './components/rating/Rating.vue';
export { default as SearchBar } from './components/search-bar/SearchBar.vue';
export { default as SearchModal } from './components/search-modal/SearchModal.vue';
export { default as Section } from './components/section/Section.vue';
export { default as Select } from './components/select/Select.vue';
export { default as Skeleton } from './components/skeleton/Skeleton.vue';
export { default as StockBadge } from './components/badge/StockBadge.vue';
export { default as Switch } from './components/switch/Switch.vue';
export { default as Tab } from './components/tabs/Tab.vue';
export { default as TabPanel } from './components/tabs/TabPanel.vue';
export { default as Tabs } from './components/tabs/Tabs.vue';
export { default as Textarea } from './components/textarea/Textarea.vue';
export { default as Toast } from './components/toast/Toast.vue';
export { default as Toaster } from './components/toast/Toaster.vue';
export { default as Tooltip } from './components/tooltip/Tooltip.vue';
export { default as UnitInput } from './components/unit-input/UnitInput.vue';
export { default as VariantPicker } from './components/variant-picker/VariantPicker.vue';
export { default as VisuallyHidden } from './components/visually-hidden/VisuallyHidden.vue';

// Component types. Each block is alphabetical within itself, and the blocks are ordered by their
// own first name (`src/__tests__/indexExportOrder.spec.ts` guards both) — a multi-component file
// (`Badge`+`StockBadge`, `ContentCard`+`FeatureCard`, `EditorPlaceholder`+`EmptyState`,
// `MultiSelect`+`Select`) sits at its *first* name's position, the same structural exception the
// component export list above notes.
export type {
  AccordionItemHeadingLevel,
  AccordionItemPart,
  AccordionItemProps,
  AccordionPart,
  AccordionProps,
} from './components/accordion/types';
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
  BreadcrumbItem,
  BreadcrumbPart,
  BreadcrumbProps,
} from './components/breadcrumb/types';
export type {
  ButtonGroupPart,
  ButtonGroupProps,
  ButtonPart,
  ButtonProps,
  ButtonSize,
  ButtonVariant,
} from './components/button/types';
export type {
  CarouselControls,
  CarouselPart,
  CarouselPerViewBreakpoints,
  CarouselProps,
} from './components/carousel/types';
export type {
  CheckboxGroupLayout,
  CheckboxGroupOption,
  CheckboxGroupPart,
  CheckboxGroupProps,
  CheckboxPart,
  CheckboxProps,
  CheckboxSize,
} from './components/checkbox/types';
export type {
  ChipGroupPart,
  ChipGroupProps,
  ChipPart,
  ChipProps,
  ChipSize,
} from './components/chip/types';
export type { ContainerPart, ContainerProps, ContainerWidth } from './components/container/types';
export type {
  ContentCardPart,
  ContentCardProps,
  ContentCardRatio,
  ContentCardVariant,
  FeatureCardPart,
  FeatureCardProps,
  FeatureCardVariant,
} from './components/card/types';
export type { CurrencyInputPart, CurrencyInputProps } from './components/currency-input/types';
export type { DialogPart, DialogProps, DialogSize } from './components/dialog/types';
export type { DrawerPart, DrawerProps, DrawerSide } from './components/drawer/types';
export type {
  EditorPlaceholderPart,
  EditorPlaceholderProps,
  EmptyStatePart,
  EmptyStateProps,
  EmptyStateVariant,
} from './components/empty-state/types';
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
export type { LightboxImage, LightboxPart, LightboxProps } from './components/lightbox/types';
export type { LinkPart, LinkProps, LinkTone, LinkVariant } from './components/link/types';
export type { LoadMorePart, LoadMoreProps } from './components/load-more/types';
export type { LogoItemPart, LogoItemProps } from './components/logo-item/types';
export type {
  MultiSelectPart,
  MultiSelectProps,
  SelectOption,
  SelectPart,
  SelectPlacement,
  SelectProps,
  SelectSize,
} from './components/select/types';
export type { PaginationPart, PaginationProps } from './components/pagination/types';
export type { PopoverPart, PopoverProps } from './components/popover/types';
export type { PricePart, PriceProps, PriceSize } from './components/price/types';
export type {
  ProductCardPart,
  ProductCardProduct,
  ProductCardProps,
  ProductCardRatio,
} from './components/product-card/types';
export type {
  QuantityStepperPart,
  QuantityStepperProps,
  QuantityStepperSize,
} from './components/quantity-stepper/types';
export type {
  RadioGroupLayout,
  RadioGroupOption,
  RadioGroupPart,
  RadioGroupProps,
  RadioGroupSize,
} from './components/radio/types';
export type {
  RangeSliderPart,
  RangeSliderProps,
  RangeSliderThumb,
  RangeSliderValue,
} from './components/range-slider/types';
export type { RatingPart, RatingProps, RatingSize } from './components/rating/types';
export type {
  SearchBarPart,
  SearchBarProps,
  SearchBarSize,
  SearchResultItem,
  SearchResultType,
  SearchResults,
  SearchRow,
  SearchSection,
  SearchSelectType,
} from './components/search-bar/types';
export type { SearchModalPart, SearchModalProps } from './components/search-modal/types';
export type {
  SectionBackground,
  SectionPart,
  SectionProps,
  SectionSpacing,
} from './components/section/types';
export type { SkeletonPart, SkeletonProps, SkeletonVariant } from './components/skeleton/types';
export type { SwitchPart, SwitchProps, SwitchSize } from './components/switch/types';
export type {
  TabPanelPart,
  TabPanelProps,
  TabPart,
  TabProps,
  TabsActivation,
  TabsItem,
  TabsPart,
  TabsProps,
  TabsVariant,
} from './components/tabs/types';
export type { TextareaPart, TextareaProps } from './components/textarea/types';
export type {
  ToastAction,
  ToastPart,
  ToastProps,
  ToastVariant,
  ToasterPart,
  ToasterProps,
} from './components/toast/types';
export type {
  TooltipAlign,
  TooltipPart,
  TooltipPlacement,
  TooltipProps,
  TooltipRole,
} from './components/tooltip/types';
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
// and `QuantityStepper` format with it unless their own `locale` prop says otherwise. The currency
// pair beside it has no `DEFAULT_UI_*` constant on purpose — there is no currency a component
// library may guess (see `useEldraUiCurrency`).
export {
  CURRENCY_KEY,
  DEFAULT_UI_LOCALE,
  LOCALE_KEY,
  provideEldraUiCurrency,
  provideEldraUiLocale,
  useEldraUiCurrency,
  useEldraUiLocale,
} from './composables/useLocale';

// Composables
export { useControllableModel } from './composables/useControllableModel';
// The modal stack every modal surface in this package shares (`Dialog`, `Drawer`, `Lightbox` and
// `SearchModal`) — nested modals are allowed; `Esc`/a backdrop click act only on the topmost one
// (operator override, see the README's Deviations entry). `TOAST_HOST_KEY` is the hand-off a
// `Toaster` reads to render its live region inside whichever dialog is topmost, per the shared
// modal rule that a toast raised while a modal is open must not be inert behind it; the rest are
// exported for a consumer building a modal surface of their own on top of `useDialog`.
export {
  closeDialog,
  currentDialog,
  isOpenDialog,
  openDialog,
  TOAST_HOST_KEY,
} from './composables/dialogStack';
export { useDialog, type UseDialogOptions, type UseDialogReturn } from './composables/useDialog';
export {
  useToast,
  type ToastItem,
  type ToastOptions,
  type UseToastReturn,
} from './composables/useToast';
export {
  useFloating,
  type FloatingPlacement,
  type UseFloatingOptions,
  type UseFloatingReturn,
} from './composables/useFloating';
// `headingLevel` → `<component :is>` tag, shared by every component with a `headingLevel` prop
// (`ContentCard`, `FeatureCard`, `ProductCard`, `EmptyState`, `FormLayout`) — exported so a
// consumer's own wrapper picks the same heading tag the same way.
export { useHeadingTag, type HeadingLevel } from './composables/useHeadingTag';
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
// Reactive slot presence: every component in this package that branches on a slot uses it instead
// of a plain `$slots.x !== undefined` (slots are not reactive on their own — see its own comment)
// — exported so a consumer's own wrapper composing this package's parts gets the same behaviour.
export { useSlotPresence } from './composables/useSlotPresence';
// The range slider's arithmetic, with no reactivity and no DOM of its own: the step grid (and the
// float-accumulation rule a fractional step needs), value-to-percent, a pointer position to a
// value, each thumb's limits against the other, and the keyboard transitions. Exported so a
// consumer building a range control this package does not ship — a dual histogram filter, a
// vertical slider — reuses exactly the maths `RangeSlider` is built on.
export {
  clampRangeThumb,
  fractionDigits,
  nearestRangeThumb,
  normalizeRangeValue,
  rangeKeyTransition,
  rangePositionToValue,
  rangeStepDigits,
  rangeThumbLimits,
  rangeValueToPercent,
  snapToRangeStep,
  type RangeSliderMath,
} from './components/range-slider/useRangeSlider';
// The scroll-snap carousel's own behaviour — index tracking, previous/next/goTo, edge detection
// for the arrows, autoplay with the spec's pause rules — with no rendering of its own, so `Task
// 11`'s `Lightbox` reuses it unchanged for its own track. `resolveCarouselPerView` and
// `carouselPerViewStyle` turn `CarouselProps['perView']` into the three inline custom properties
// the `eldra-carousel-track` utility resolves per container-query breakpoint — an inline style, not
// classes, because a class name built by interpolating a number is never in the text Tailwind
// scans (see `carouselPerViewStyle`'s own comment); `prefersReducedMotion` is the one JavaScript
// check `motion-reduce:` CSS cannot make on its own (whether autoplay may start at all).
export {
  carouselPerViewStyle,
  prefersReducedMotion,
  resolveCarouselPerView,
  useCarousel,
  type UseCarouselOptions,
  type UseCarouselReturn,
} from './components/carousel/useCarousel';

// Form context. A `FormLayout` provides it; every Button below reads it, so a submitting form
// shows its primary action loading and every other action disabled.
export { FORM_LAYOUT_KEY, FORM_SUBMITTING_KEY } from './components/form-layout/context';

// Field context. A `FieldWrapper` provides it; the controls inside it read their `id`,
// `aria-describedby`, invalid and required state from it, so a bare `<Input />` needs no wiring.
export { FIELD_KEY, type FieldContext } from './components/field-wrapper/context';

// Section context. A `Section` provides it for its own subtree so a nested `Section` can warn
// against the spec's own "sections are never nested inside another section" rule.
export { SECTION_KEY } from './components/section/context';
// Chip group context. A `ChipGroup` provides it; a member `Chip` with both a `value` and a group
// above it reads its selected state and toggles it here instead of through its own `selected` prop.
export { CHIP_GROUP_KEY, type ChipGroupContext } from './components/chip/context';
// Accordion context. An `Accordion` provides it; a member `AccordionItem` reads whether the group
// is single-open and, if so, the shared native `name` every item in it takes.
export { ACCORDION_KEY, type AccordionContext } from './components/accordion/context';

// Tabs context. A `Tabs` provides it; a standalone `Tab`/`TabPanel` reads the selected value,
// activation and variant from it, and registers itself so cross-tab arrow-key moves work with no
// prop telling `Tabs` what order its children are in.
export { TABS_KEY, type TabsContext, type TabsEntry } from './components/tabs/context';

// Styling helpers, so a consumer composing its own wrapper merges classes the
// same way the components do.
export { cx, partClass, type ClassValue } from './utils/cx';
export { mixToward } from './utils/color';
export { joinIds, useUiId } from './utils/id';
export { applyMask, defaultCharacterMeaning, stripMask } from './utils/mask';
export {
  createNumberFormat,
  currencyFractionDigits,
  currencySymbol,
  defaultUnitFormat,
  formatCurrency,
  formatNumber,
  formatUnit,
  localeSeparators,
  parseLocaleNumber,
  type NumberFormatOptions,
  type UnitFormatOptions,
} from './utils/number-format';
// The `beforeinput` filter that keeps a numeric text field numeric, used by `QuantityStepper` —
// exported for a consumer building a numeric control of their own.
export { filterNumericBeforeInput, type NumericInputFilterOptions } from './utils/numeric-input';
// `ImageRatio` (above) is public, but the only function that turns a preset into the CSS
// `aspect-ratio` value it resolves to was not — a consumer accepting an `ImageRatio` of their own
// could not honour it without this. Shared by `Image` and `Skeleton`'s `media` variant.
export { frameAspectRatio } from './utils/ratio';
// Never throws (see its own comment) — a consumer rendering its own `<time>` from a CMS date gets
// the same guard `ContentCard` uses, rather than reimplementing the ISO-parsing/invalid-date rules.
// `FormatDateOptions` is the `Intl.DateTimeFormatOptions` subset its third argument accepts (a
// spelled-out month, a weekday, two-digit parts), so a caller can restyle the output without
// reaching for `Intl.DateTimeFormat` itself and losing those guards.
export { formatDate, type FormatDateOptions } from './utils/date';
// `Rating`'s own rounding/star-fill rules, pulled out for a consumer building a rating display of
// their own (or a custom `Rating` slot) that still rounds to the nearest half star the same way.
export { ratingStarStates, roundRatingToHalf, type RatingStarState } from './utils/rating';
// `Avatar`'s initials rule (first + last word's first letter, uppercase; two letters for a single
// word) — exported so a consumer's own avatar-shaped fallback matches `Avatar`'s own.
export { initialsFromName } from './utils/avatar';
