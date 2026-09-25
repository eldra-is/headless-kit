// Public entry for @eldrajs/ui. Components are exported unprefixed and are not
// registered globally; `@eldrajs/ui/resolver` does that for consumers who want
// `<EldraButton>`.

// Components
export { default as Button } from './components/button/Button.vue';
export { default as ButtonGroup } from './components/button/ButtonGroup.vue';
export { default as FieldWrapper } from './components/field-wrapper/FieldWrapper.vue';
export { default as FormLayout } from './components/form-layout/FormLayout.vue';
export { default as Icon } from './components/icon/Icon.vue';
export { default as Input } from './components/input/Input.vue';
export { default as Link } from './components/link/Link.vue';
export { default as Textarea } from './components/textarea/Textarea.vue';
export { default as VisuallyHidden } from './components/visually-hidden/VisuallyHidden.vue';

// Component types
export type {
  ButtonGroupPart,
  ButtonGroupProps,
  ButtonPart,
  ButtonProps,
  ButtonSize,
  ButtonVariant,
} from './components/button/types';
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
export type { InputPart, InputProps, InputSize, InputType } from './components/input/types';
export type { LinkPart, LinkProps, LinkTone, LinkVariant } from './components/link/types';
export type { TextareaPart, TextareaProps } from './components/textarea/types';
export type { VisuallyHiddenPart, VisuallyHiddenProps } from './components/visually-hidden/types';

// Messages
export { defaultMessages, enUS } from './messages';
export {
  MESSAGES_KEY,
  provideEldraUiMessages,
  useMessages,
  type UiMessages,
} from './composables/useMessages';

// Composables
export { useControllableModel } from './composables/useControllableModel';

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
export { useUiId } from './utils/id';
export { applyMask, defaultCharacterMeaning, stripMask } from './utils/mask';
